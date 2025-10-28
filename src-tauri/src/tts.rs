use once_cell::sync::Lazy;
use serde::Serialize;
use std::cmp::Ordering;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Condvar, Mutex};
use tauri::Emitter;

fn cache_dir() -> Result<PathBuf, String> {
    let base = std::env::temp_dir();
    let dir = base.join("rishi_tts");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn audio_key(book_id: &str, cfi: &str) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(book_id.as_bytes());
    hasher.update(cfi.as_bytes());
    hasher.finalize().to_hex().to_string()
}

fn audio_path(book_id: &str, cfi: &str) -> Result<PathBuf, String> {
    let dir = cache_dir()?;
    let key = audio_key(book_id, cfi);
    let book_dir = dir.join(book_id);
    fs::create_dir_all(&book_dir).map_err(|e| e.to_string())?;
    Ok(book_dir.join(format!("{}.mp3", key)))
}

#[tauri::command]
pub fn tts_get_audio_path(book_id: String, cfi_range: String) -> Result<Option<String>, String> {
    let p = audio_path(&book_id, &cfi_range)?;
    if p.exists() {
        Ok(Some(p.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[derive(Serialize)]
pub struct TtsQueueStatus {
    pub pending: usize,
    pub is_processing: bool,
    pub active: usize,
}

#[tauri::command]
pub fn tts_queue_status() -> Result<TtsQueueStatus, String> {
    let q = QUEUE.lock().map_err(|_| "queue poisoned".to_string())?;
    Ok(TtsQueueStatus {
        pending: q.pending_len(),
        is_processing: q.is_processing,
        active: q.active,
    })
}

#[tauri::command]
pub fn tts_clear_book_cache(book_id: String) -> Result<(), String> {
    let dir = cache_dir()?.join(book_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn tts_get_book_cache_size(book_id: String) -> Result<u64, String> {
    let dir = cache_dir()?.join(book_id);
    if !dir.exists() {
        return Ok(0);
    }
    let mut size = 0u64;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_file() {
            size += meta.len();
        }
    }
    Ok(size)
}

#[tauri::command]
pub fn tts_request_audio(
    book_id: String,
    cfi_range: String,
    text: String,
    _priority: Option<u32>,
    voice: Option<String>,
    rate: Option<f32>,
) -> Result<String, String> {
    // Return cached if exists
    let out = audio_path(&book_id, &cfi_range)?;
    if out.exists() {
        return Ok(out.to_string_lossy().to_string());
    }

    // Fetch from proxy
    let proxy =
        std::env::var("RISHI_TTS_PROXY").map_err(|_| "RISHI_TTS_PROXY not set".to_string())?;
    let client = reqwest::blocking::Client::new();
    let mut body = serde_json::json!({ "text": text });
    if let Some(v) = voice.clone() {
        body["voice"] = serde_json::Value::String(v);
    }
    if let Some(r) = rate {
        body["rate"] = serde_json::Value::from(r);
    }
    let resp = client
        .post(&proxy)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("proxy error: {}", resp.status()));
    }
    let bytes = resp.bytes().map_err(|e| e.to_string())?;
    if let Some(dir) = out.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut f = File::create(&out).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().to_string())
}

#[derive(Clone)]
struct TtsTask {
    priority: u32,
    book_id: String,
    cfi_range: String,
    text: String,
    voice: Option<String>,
    rate: Option<f32>,
}

impl Eq for TtsTask {}
impl PartialEq for TtsTask {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority
    }
}
impl Ord for TtsTask {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority.cmp(&other.priority)
    }
}
impl PartialOrd for TtsTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

struct TtsQueueState {
    heap: std::collections::BinaryHeap<TtsTask>,
    is_processing: bool,
    active: usize,
}

impl TtsQueueState {
    fn new() -> Self {
        Self {
            heap: std::collections::BinaryHeap::new(),
            is_processing: false,
            active: 0,
        }
    }
    fn pending_len(&self) -> usize {
        self.heap.len()
    }
}

static QUEUE: Lazy<Mutex<TtsQueueState>> = Lazy::new(|| Mutex::new(TtsQueueState::new()));
static QUEUE_CV: Lazy<Condvar> = Lazy::new(|| Condvar::new());
static WORKER_STARTED: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
static APP_HANDLE: Lazy<Mutex<Option<tauri::AppHandle>>> = Lazy::new(|| Mutex::new(None));

fn ensure_worker_started() {
    let mut started = WORKER_STARTED.lock().unwrap();
    if *started {
        return;
    }
    *started = true;
    std::thread::spawn(|| loop {
        let task_opt = {
            let mut q = QUEUE.lock().unwrap();
            while q.heap.is_empty() {
                q.is_processing = false;
                q = QUEUE_CV.wait(q).unwrap();
            }
            q.is_processing = true;
            q.heap.pop()
        };
        if let Some(task) = task_opt {
            {
                let mut q = QUEUE.lock().unwrap();
                q.active += 1;
            }
            let path_res = (|| -> Result<String, String> {
                let out = audio_path(&task.book_id, &task.cfi_range)?;
                if out.exists() {
                    return Ok(out.to_string_lossy().to_string());
                }
                let proxy = std::env::var("RISHI_TTS_PROXY")
                    .map_err(|_| "RISHI_TTS_PROXY not set".to_string())?;
                let client = reqwest::blocking::Client::new();
                let mut body = serde_json::json!({ "text": task.text });
                if let Some(v) = task.voice.clone() {
                    body["voice"] = serde_json::Value::String(v);
                }
                if let Some(r) = task.rate {
                    body["rate"] = serde_json::Value::from(r);
                }
                let resp = client
                    .post(&proxy)
                    .json(&body)
                    .send()
                    .map_err(|e| e.to_string())?;
                if !resp.status().is_success() {
                    return Err(format!("proxy error: {}", resp.status()));
                }
                let bytes = resp.bytes().map_err(|e| e.to_string())?;
                if let Some(dir) = out.parent() {
                    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                }
                let mut f = File::create(&out).map_err(|e| e.to_string())?;
                f.write_all(&bytes).map_err(|e| e.to_string())?;
                Ok(out.to_string_lossy().to_string())
            })();
            {
                let mut q = QUEUE.lock().unwrap();
                q.active = q.active.saturating_sub(1);
            }
            match path_res {
                Ok(path) => {
                    if let Some(app) = APP_HANDLE.lock().unwrap().clone() {
                        let _ = app.emit(
                            "tts://audioReady",
                            serde_json::json!({
                                "bookId": task.book_id,
                                "cfiRange": task.cfi_range,
                                "audioPath": path,
                            }),
                        );
                    }
                }
                Err(err) => {
                    if let Some(app) = APP_HANDLE.lock().unwrap().clone() {
                        let _ = app.emit(
                            "tts://error",
                            serde_json::json!({
                                "bookId": task.book_id,
                                "cfiRange": task.cfi_range,
                                "error": err,
                            }),
                        );
                    }
                }
            }
        }
    });
}

#[tauri::command]
pub fn tts_enqueue_audio(
    app: tauri::AppHandle,
    book_id: String,
    cfi_range: String,
    text: String,
    priority: Option<u32>,
    voice: Option<String>,
    rate: Option<f32>,
) -> Result<(), String> {
    ensure_worker_started();
    {
        let mut h = APP_HANDLE
            .lock()
            .map_err(|_| "app handle lock".to_string())?;
        *h = Some(app);
    }
    let mut q = QUEUE.lock().map_err(|_| "queue poisoned".to_string())?;
    q.heap.push(TtsTask {
        priority: priority.unwrap_or(0),
        book_id,
        cfi_range,
        text,
        voice,
        rate,
    });
    QUEUE_CV.notify_one();
    Ok(())
}

#[tauri::command]
pub fn tts_cancel(book_id: String, cfi_range: String) -> Result<usize, String> {
    let mut q = QUEUE.lock().map_err(|_| "queue poisoned".to_string())?;
    let mut items: Vec<TtsTask> = q.heap.drain().collect();
    let before = items.len();
    items.retain(|t| !(t.book_id == book_id && t.cfi_range == cfi_range));
    let removed = before - items.len();
    q.heap = items.into_iter().collect();
    Ok(removed)
}

#[tauri::command]
pub fn tts_cancel_all(book_id: String) -> Result<usize, String> {
    let mut q = QUEUE.lock().map_err(|_| "queue poisoned".to_string())?;
    let mut items: Vec<TtsTask> = q.heap.drain().collect();
    let before = items.len();
    items.retain(|t| t.book_id != book_id);
    let removed = before - items.len();
    q.heap = items.into_iter().collect();
    Ok(removed)
}
