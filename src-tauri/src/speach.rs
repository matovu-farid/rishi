use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    rc::Rc,
    sync::{atomic::AtomicU64, Arc},
};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;

use webrtc_audio_processing::{
    Config, EchoCancellation, EchoCancellationSuppressionLevel, InitializationConfig,
    NoiseSuppression, NoiseSuppressionLevel, Processor,
};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Downloads a Whisper model to the app data directory if not already present.
/// Returns the absolute path to the downloaded model.
pub async fn ensure_model_available(
    app_dir: &PathBuf,
    model_name: &str,
    model_url: &str,
) -> Result<PathBuf, String> {
    // /AppData/AppName/models
    let model_dir = app_dir.join("models");
    if !model_dir.exists() {
        fs::create_dir_all(&model_dir).map_err(|e| format!("Failed to create model dir: {}", e))?;
    }

    let model_path = model_dir.join(model_name);

    // 2. If already downloaded, return it
    if model_path.exists() {
        return Ok(model_path);
    }

    println!("Whisper model missing — downloading {}", model_name);

    // 3. Download the file
    let resp = reqwest::get(model_url)
        .await
        .map_err(|e| format!("Download error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Failed to download whisper model. HTTP {}",
            resp.status()
        ));
    }

    // Download all bytes and write to disk
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response bytes: {}", e))?;

    let mut file = tokio::fs::File::create(&model_path)
        .await
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    file.write_all(&bytes)
        .await
        .map_err(|e| format!("Write error: {}", e))?;

    println!("Model downloaded to {:?}", model_path);

    Ok(model_path)
}
// whisper_rs::set_log_callback(|level, msg| {
//     // Silence everything below error:
//     if level >= whisper_rs::WhisperLogLevel::Error {
//         eprintln!("[whisper error] {}", msg);
//     }
// });

pub async fn tts(text: &str) -> anyhow::Result<Vec<u8>> {
    let client = reqwest::Client::new();

    let map = json!({
        "voice": "alloy",
        "input": text,
        "response_format": "mp3",
        "speed": 1.0
    });
    let response = client
        .post("https://rishi-worker.faridmato90.workers.dev/api/audio/speech")
        .json(&map)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get response bytes: {}", e))?
        .bytes()
        .await?;

    let vec: Vec<u8> = response.to_vec();

    Ok(vec)
}

pub async fn transcribe_audio(
    app_dir: &PathBuf,
    audio_data: Vec<f32>,
) -> Result<Vec<String>, String> {
    let model = ensure_model_available(
        &app_dir,
        "ggml-large-v3.bin",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin", // "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/small.en-q5_1.gguf",
    )
    .await
    .map_err(|e| format!("Failed to ensure whisper model: {}", e))?;
    let path = model.to_str().unwrap();
    let ctx = WhisperContext::new_with_params(path, WhisperContextParameters::default())
        .expect("failed to load model");

    let params = FullParams::new(SamplingStrategy::BeamSearch {
        beam_size: 5,
        patience: -1.0,
    });

    let mut state = ctx.create_state().expect("failed to create state");

    whisper_rs::install_logging_hooks();

    state
        .full(params, &audio_data)
        .expect("failed to run model");

    let text = state
        .as_iter()
        .filter_map(|segment| segment.to_str().ok().map(|s| s.to_string()))
        .collect::<Vec<String>>();

    Ok(text)
}

pub async fn transcribe(app: &AppHandle, audio_data: Vec<f32>) -> Result<Vec<String>, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    transcribe_audio(&app_dir, audio_data).await
}
pub async fn get_audio(app: &AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    _get_audio(&app_dir).await
}

struct NoiseProcessor {
    ap: Processor,
    frame_size: usize,
}

impl NoiseProcessor {
    fn new(sample_rate: usize, channel_count: u16, frames_per_second: usize) -> Self {
        let init_config = InitializationConfig {
            num_capture_channels: channel_count as i32,
            num_render_channels: 0,
            ..InitializationConfig::default()
        };

        let mut ap = Processor::new(&init_config).expect("Failed to create processor");

        let config = Config {
            echo_cancellation: None,
            noise_suppression: Some(NoiseSuppression {
                suppression_level: NoiseSuppressionLevel::VeryHigh, // start here
            }),
            ..Config::default()
        };
        ap.set_config(config);

        let frame_size = sample_rate / frames_per_second; // 10 ms

        Self { ap, frame_size }
    }

    fn process_frame(&mut self, frame: &mut [f32]) {
        if frame.len() == self.frame_size {
            if let Err(e) = self.ap.process_capture_frame(frame) {
                eprintln!("APM error: {:?}", e);
            }
        }
    }
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
fn get_next_id() -> u64 {
    NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}
fn frame_rms(frame: &[f32]) -> f32 {
    let sum_sq: f32 = frame.iter().map(|s| s * s).sum();
    (sum_sq / frame.len() as f32).sqrt()
}

struct AudioData {
    id: u64,
    data: Vec<f32>,
}
impl AudioData {
    fn new(data: Vec<f32>) -> Self {
        Self {
            id: get_next_id(),
            data,
        }
    }
    fn save(&self, app_dir: &PathBuf, sample_rate: u32) -> Result<(), String> {
        let path = app_dir.join(format!("audio_{}.wav", self.id));
        let mut file =
            std::fs::File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
        let mut head = wav_io::new_mono_header();
        head.sample_rate = sample_rate;
        wav_io::write_to_file(&mut file, &head, &self.data)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        Ok(())
    }
    async fn transcribe(self, app_dir: &PathBuf) -> Result<String, String> {
        let text = transcribe_audio(&app_dir, self.data)
            .await
            .map_err(|e| format!("Failed to transcribe audio: {}", e))?;
        Ok(text.join("\n"))
    }
}
async fn _listen_to_audio(app_dir: &PathBuf) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No default input device")?;

    let desired_rates = [48_000u32, 32_000, 16_000, 8_000];
    let supported_configs = device
        .supported_input_configs()
        .map_err(|e| format!("Failed to get supported input configs: {}", e))?;

    // 2. Collect so we can iterate multiple times
    let supported: Vec<_> = supported_configs.collect();
    println!("supported: {:?}", supported);

    // 4. Pick the first rate that fits in any supported range
    let config = desired_rates
        .iter()
        .find_map(|&target_rate| {
            supported.iter().find_map(|range| {
                let min = range.min_sample_rate().0;
                let max = range.max_sample_rate().0;
                if min <= target_rate && target_rate <= max {
                    Some(
                        range
                            .clone()
                            .with_sample_rate(cpal::SampleRate(target_rate)),
                    )
                } else {
                    None
                }
            })
        })
        .or(device.default_input_config().ok())
        .ok_or("No WebRTC-compatible sample rate supported by input device")?;
    let sample_rate = config.sample_rate().0 as usize;
    let supports_webrtc = desired_rates
        .iter()
        .any(|rate| *rate == config.sample_rate().0);

    let app_dir = app_dir.clone();
    let batch_size = 600;
    let frames_per_sec = 100;
    let (tx, rx) = std::sync::mpsc::sync_channel(batch_size);
    let (tx_batch, rx_batch) = std::sync::mpsc::channel();

    tokio::spawn(async move {
        while let Ok(audio_data) = rx_batch.recv() {
            let audio = AudioData::new(audio_data);
            match audio.save(&app_dir, sample_rate as u32) {
                Ok(_) => {}
                Err(e) => {
                    println!("Failed to save audio: {}", e);
                }
            }
            let text = match audio.transcribe(&app_dir).await {
                Ok(text) => text,
                Err(e) => {
                    println!("Failed to transcribe audio: {}", e);
                    continue;
                }
            };
            println!("text: {:?}", text);
        }
    });

    std::thread::spawn(move || {
        // tuning knobs
        let silence_threshold = 0.01; // how “quiet” a frame must be
        let silence_ms = 1000; // how long of silence ends a segment
        let min_segment_ms = 1500; // don’t send tiny 200ms chunks

        let silence_frames_needed = silence_ms * frames_per_sec / 1000;
        let min_segment_frames = min_segment_ms * frames_per_sec / 1000;

        let mut current_segment: Vec<Vec<f32>> = Vec::new();
        let mut silence_run = 0usize;

        loop {
            let frame: Vec<f32> = match rx.recv() {
                Ok(f) => f,
                Err(_) => break, // producer gone
            };

            // 1) measure loudness of this frame
            let rms = frame_rms(&frame);
            let is_silence = rms < silence_threshold;

            if is_silence {
                silence_run += 1;
            } else {
                silence_run = 0;
            }

            // 2) add frame to current segment if it’s “speechy” or we’re already in a segment
            current_segment.push(frame);

            let seg_len = current_segment.len();

            let long_enough = seg_len >= min_segment_frames;

            let long_silence_after = silence_run >= silence_frames_needed;

            let should_close = long_enough && (long_silence_after);

            if should_close {
                let finished_segment = std::mem::take(&mut current_segment)
                    .into_iter()
                    .flatten()
                    .collect::<Vec<f32>>();
                let rms = frame_rms(&finished_segment);

                if !finished_segment.is_empty() && rms > silence_threshold {
                    // send this “sentence/phrase”
                    if let Err(e) = tx_batch.send(finished_segment) {
                        eprintln!("tx_batch send error: {e}");
                        break;
                    }
                }
                // reset silence run so we don’t immediately trigger again
                silence_run = 0;
            }
        }
        let current_segment_frames = current_segment.into_iter().flatten().collect::<Vec<f32>>();

        // flush last bit if any frames remain when stream ends
        if !current_segment_frames.is_empty() {
            let rms = frame_rms(&current_segment_frames);

            if rms > silence_threshold {
                let _ = tx_batch.send(current_segment_frames);
            }
        }
    });
    let channel_count = config.channels();

    let mut noise_processor = NoiseProcessor::new(sample_rate, channel_count, frames_per_sec);
    let mut frame_buffer = Vec::with_capacity(noise_processor.frame_size);
    let stream = device
        .build_input_stream(
            &config.config(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                for &sample in data {
                    frame_buffer.push(sample);

                    if frame_buffer.len() == noise_processor.frame_size {
                        if supports_webrtc {
                            noise_processor.process_frame(&mut frame_buffer);
                        }
                        let _ = tx.send(frame_buffer.clone());
                        frame_buffer.clear();
                    }
                }
            },
            move |err| {
                // react to errors here.
                println!("error: {:?}", err);
            },
            None, // None=blocking, Some(Duration)=timeout
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;
    stream
        .play()
        .map_err(|e| format!("Failed to play stream: {}", e))?;
    std::thread::park();

    Ok(())
}

async fn _get_audio(app_dir: &PathBuf) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No default input device")?;

    let desired_rates = [48_000u32, 32_000, 16_000, 8_000];
    let supported_configs = device
        .supported_input_configs()
        .map_err(|e| format!("Failed to get supported input configs: {}", e))?;

    // 2. Collect so we can iterate multiple times
    let supported: Vec<_> = supported_configs.collect();
    println!("supported: {:?}", supported);

    // 4. Pick the first rate that fits in any supported range
    let config = desired_rates
        .iter()
        .find_map(|&target_rate| {
            supported.iter().find_map(|range| {
                let min = range.min_sample_rate().0;
                let max = range.max_sample_rate().0;
                if min <= target_rate && target_rate <= max {
                    Some(
                        range
                            .clone()
                            .with_sample_rate(cpal::SampleRate(target_rate)),
                    )
                } else {
                    None
                }
            })
        })
        .or(device.default_input_config().ok())
        .ok_or("No WebRTC-compatible sample rate supported by input device")?;
    let sample_rate = config.sample_rate().0 as usize;
    let supports_webrtc = desired_rates
        .iter()
        .any(|rate| *rate == config.sample_rate().0);

    let app_dir = app_dir.clone();
    let batch_size = 600;
    let frames_per_sec = 100;
    let (tx, rx) = std::sync::mpsc::sync_channel(batch_size);
    let (tx_batch, rx_batch) = std::sync::mpsc::channel::<Vec<f32>>();

    tokio::spawn(async move {
        while let Ok(audio_data) = rx_batch.recv() {
            let audio = AudioData::new(audio_data);
            match audio.save(&app_dir, sample_rate as u32) {
                Ok(_) => {}
                Err(e) => {
                    println!("Failed to save audio: {}", e);
                }
            }
            let text = match audio.transcribe(&app_dir).await {
                Ok(text) => text,
                Err(e) => {
                    println!("Failed to transcribe audio: {}", e);
                    continue;
                }
            };
            println!("text: {:?}", text);
        }
    });

    std::thread::spawn(move || {
        // tuning knobs
        let silence_threshold = 0.01; // how “quiet” a frame must be
        let silence_ms = 1000; // how long of silence ends a segment
        let min_segment_ms = 1500; // don’t send tiny 200ms chunks

        let silence_frames_needed = silence_ms * frames_per_sec / 1000;
        let min_segment_frames = min_segment_ms * frames_per_sec / 1000;

        let mut current_segment: Vec<Vec<f32>> = Vec::new();
        let mut silence_run = 0usize;

        loop {
            let frame: Vec<f32> = match rx.recv() {
                Ok(f) => f,
                Err(_) => break, // producer gone
            };

            // 1) measure loudness of this frame
            let rms = frame_rms(&frame);
            let is_silence = rms < silence_threshold;

            if is_silence {
                silence_run += 1;
            } else {
                silence_run = 0;
            }

            // 2) add frame to current segment if it’s “speechy” or we’re already in a segment
            current_segment.push(frame);

            let seg_len = current_segment.len();

            let long_enough = seg_len >= min_segment_frames;

            let long_silence_after = silence_run >= silence_frames_needed;

            let should_close = long_enough && (long_silence_after);

            if should_close {
                let finished_segment = std::mem::take(&mut current_segment)
                    .into_iter()
                    .flatten()
                    .collect::<Vec<f32>>();
                let rms = frame_rms(&finished_segment);

                if !finished_segment.is_empty() && rms > silence_threshold {
                    // send this “sentence/phrase”
                    if let Err(e) = tx_batch.send(finished_segment) {
                        eprintln!("tx_batch send error: {e}");
                        break;
                    }
                }
                // reset silence run so we don’t immediately trigger again
                silence_run = 0;
            }
        }
        let current_segment_frames = current_segment.into_iter().flatten().collect::<Vec<f32>>();

        // flush last bit if any frames remain when stream ends
        if !current_segment_frames.is_empty() {
            let rms = frame_rms(&current_segment_frames);

            if rms > silence_threshold {
                let _ = tx_batch.send(current_segment_frames);
            }
        }
    });
    let channel_count = config.channels();

    let mut noise_processor = NoiseProcessor::new(sample_rate, channel_count, frames_per_sec);
    let mut frame_buffer = Vec::with_capacity(noise_processor.frame_size);
    let stream = device
        .build_input_stream(
            &config.config(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                for &sample in data {
                    frame_buffer.push(sample);

                    if frame_buffer.len() == noise_processor.frame_size {
                        if supports_webrtc {
                            noise_processor.process_frame(&mut frame_buffer);
                        }
                        let _ = tx.send(frame_buffer.clone());
                        frame_buffer.clear();
                    }
                }
            },
            move |err| {
                // react to errors here.
                println!("error: {:?}", err);
            },
            None, // None=blocking, Some(Duration)=timeout
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;
    stream
        .play()
        .map_err(|e| format!("Failed to play stream: {}", e))?;
    std::thread::park();

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{fs::File, time::Duration};

    use expectest::prelude::*;
    // use voirs::prelude::*;

    use super::*;

    #[tokio::test]
    async fn test_get_audio_thread() {
        let app_dir = PathBuf::from("test_data");
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(_get_audio(&app_dir)).unwrap();
        });
    }

    #[tokio::test]
    async fn test_get_audio() {
        let app_dir = PathBuf::from("test_data");
        tokio::spawn(async move {
            _get_audio(&app_dir).await.unwrap();
        });
        // wait for 10 seconds
        tokio::time::sleep(Duration::from_secs(10)).await;
    }

    #[tokio::test]
    async fn test_tts() {
        let text = "The quick brown fox jumps over the lazy dog.";
        let audio_data = tts(text).await.unwrap();
        println!(
            "audio_data: {:x?}",
            audio_data.iter().take(12).collect::<Vec<&u8>>()
        );
        expect!(audio_data.len()).not_to(be_equal_to(0));
    }

    #[tokio::test]
    async fn test_transcribe() {
        let app_dir = PathBuf::from("test_data");
        let path = app_dir.join("test.wav");

        struct TestData {
            audio_path: String,
            expected_text: String,
        }
        let txt = "The quick brown fox jumps over the lazy dog.";

        let test_data = vec![TestData {
            audio_path: path.to_str().unwrap().to_string(),
            expected_text: txt.to_string(),
        }];

        for test in test_data {
            let app_dir = PathBuf::from("test_data");
            // Tts(&app_dir).await.unwrap();
            let file_input = File::open(test.audio_path).unwrap();
            let (_head, audio_data) = wav_io::read_from_file(file_input).unwrap();
            // let audio_data = test.audio_data;

            let res = transcribe_audio(&app_dir, audio_data).await.unwrap();
            expect!(res.is_empty()).to(be_equal_to(false));
            println!("res: {:?}", res);
            expect!(res[0].trim()).to(be_equal_to(test.expected_text));
        }
    }
}
