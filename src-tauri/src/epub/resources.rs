use base64::{engine::general_purpose, Engine as _};
use crate::epub::replacements::{ReplacementMode, ReplacementStrategy};
use std::collections::HashMap;

pub fn bytes_to_data_uri(mime: &str, bytes: &[u8]) -> String {
    let b64 = general_purpose::STANDARD.encode(bytes);
    format!("data:{};base64,{}", mime, b64)
}

#[derive(Debug, Clone)]
pub struct ResourceManager {
    /// Blob URL registry: resource_path -> blob_url
    blob_registry: HashMap<String, String>,
    /// Replacement strategy
    pub strategy: ReplacementStrategy,
}

impl ResourceManager {
    pub fn new(strategy: ReplacementStrategy) -> Self {
        Self {
            blob_registry: HashMap::new(),
            strategy,
        }
    }
    
    pub fn with_default() -> Self {
        Self::new(ReplacementStrategy::default())
    }
    
    pub fn set_strategy(&mut self, strategy: ReplacementStrategy) {
        self.strategy = strategy;
    }
    
    pub fn register_blob(&mut self, path: String, blob_url: String) {
        self.blob_registry.insert(path, blob_url);
    }
    
    pub fn get_blob_url(&self, path: &str) -> Option<&str> {
        self.blob_registry.get(path).map(|s| s.as_str())
    }
    
    pub fn transform_resource(&self, path: &str, mime: &str, bytes: &[u8]) -> String {
        let mode = self.strategy.get_mode_for_mime(mime);
        
        match mode {
            ReplacementMode::None => path.to_string(),
            ReplacementMode::Base64 => bytes_to_data_uri(mime, bytes),
            ReplacementMode::BlobUrl => {
                // If blob URL is registered, use it; otherwise fall back to base64
                self.get_blob_url(path)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| bytes_to_data_uri(mime, bytes))
            }
        }
    }
    
    pub fn should_inline(&self, mime: &str) -> bool {
        let mode = self.strategy.get_mode_for_mime(mime);
        matches!(mode, ReplacementMode::Base64 | ReplacementMode::BlobUrl)
    }
}
