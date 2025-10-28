use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ErrorSeverity {
    Debug,
    Info,
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEvent {
    pub timestamp: String,
    pub stage: String,
    pub book_id: Option<u64>,
    pub message: String,
    pub context: Option<serde_json::Value>,
    pub severity: ErrorSeverity,
}

impl ErrorEvent {
    pub fn new(
        stage: impl Into<String>,
        message: impl Into<String>,
        severity: ErrorSeverity,
    ) -> Self {
        Self {
            timestamp: chrono::Local::now().to_rfc3339(),
            stage: stage.into(),
            book_id: None,
            message: message.into(),
            context: None,
            severity,
        }
    }

    pub fn with_book_id(mut self, book_id: u64) -> Self {
        self.book_id = Some(book_id);
        self
    }

    pub fn with_context(mut self, context: serde_json::Value) -> Self {
        self.context = Some(context);
        self
    }
}

/// Emit an error event to the frontend via Tauri events
/// Only active in debug builds or when EPUB_DEBUG environment variable is set
pub fn emit_error_event(app: &tauri::AppHandle, event: ErrorEvent) {
    // Only emit events in debug mode
    #[cfg(debug_assertions)]
    let is_debug = true;

    #[cfg(not(debug_assertions))]
    let is_debug = std::env::var("EPUB_DEBUG").is_ok();

    if !is_debug {
        return;
    }

    // Log to console
    match event.severity {
        ErrorSeverity::Debug => eprintln!("[DEBUG:{}] {}", event.stage, event.message),
        ErrorSeverity::Info => eprintln!("[INFO:{}] {}", event.stage, event.message),
        ErrorSeverity::Warning => eprintln!("[WARNING:{}] {}", event.stage, event.message),
        ErrorSeverity::Error => eprintln!("[ERROR:{}] {}", event.stage, event.message),
        ErrorSeverity::Critical => eprintln!("[CRITICAL:{}] {}", event.stage, event.message),
    }

    // Write to log file
    if let Err(e) = write_to_log_file(&event) {
        eprintln!("[ERROR:LOG_FILE] Failed to write to log file: {}", e);
    }

    // Emit to frontend
    use tauri::Emitter;
    if let Err(e) = app.emit("epub-error", &event) {
        eprintln!("[ERROR:EVENT_EMIT] Failed to emit error event: {}", e);
    }
}

/// Get the log file path (~/.rishi/logs/epub-reader.log)
fn get_log_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let log_dir = home.join(".rishi").join("logs");

    // Create directory if it doesn't exist
    fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log directory: {}", e))?;

    Ok(log_dir.join("epub-reader.log"))
}

/// Write an error event to the log file
fn write_to_log_file(event: &ErrorEvent) -> Result<(), String> {
    let log_path = get_log_file_path()?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let log_line = format!(
        "[{}] [{:?}:{}] book_id={:?} - {}{}\n",
        event.timestamp,
        event.severity,
        event.stage,
        event.book_id,
        event.message,
        event
            .context
            .as_ref()
            .map(|c| format!(" | context: {}", c))
            .unwrap_or_default()
    );

    file.write_all(log_line.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {}", e))?;

    Ok(())
}

/// Helper function to emit a debug event
pub fn emit_debug(app: &tauri::AppHandle, stage: &str, message: &str, book_id: Option<u64>) {
    let mut event = ErrorEvent::new(stage, message, ErrorSeverity::Debug);
    if let Some(id) = book_id {
        event = event.with_book_id(id);
    }
    emit_error_event(app, event);
}

/// Helper function to emit an error event
pub fn emit_error(app: &tauri::AppHandle, stage: &str, message: &str, book_id: Option<u64>) {
    let mut event = ErrorEvent::new(stage, message, ErrorSeverity::Error);
    if let Some(id) = book_id {
        event = event.with_book_id(id);
    }
    emit_error_event(app, event);
}
