use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;
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

pub async fn transcribe_audio(
    app_dir: &PathBuf,
    audio_data: Vec<f32>,
) -> Result<Vec<String>, String> {
    let model = ensure_model_available(
        &app_dir,
        "small.en-q5_1",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin", // "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/small.en-q5_1.gguf",
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

    state
        .full(params, &audio_data)
        .expect("failed to run model");

    let text = state
        .as_iter()
        .filter_map(|segment| segment.to_str().ok().map(|s| s.to_string()))
        .collect::<Vec<String>>();
    println!("text: {:?}", text);
    Ok(text)
}

pub async fn transcribe(app: &AppHandle, audio_data: Vec<f32>) -> Result<Vec<String>, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    transcribe_audio(&app_dir, audio_data).await
}



#[cfg(test)]
mod tests {
    use std::{fs::File, path::Path};

    use expectest::prelude::*;
    // use voirs::prelude::*;

    use super::*;

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
