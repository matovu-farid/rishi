use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct AnnotationsPayload {
    pub annotations: Vec<crate::epub::annotations::Annotation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocationsPayload {
    pub total: usize,
    pub by_spine: Vec<usize>,
}

pub fn save_json<P: AsRef<Path>, T: Serialize>(path: P, data: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn load_json<P: AsRef<Path>, T: for<'de> Deserialize<'de>>(path: P) -> Result<T, String> {
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str::<T>(&data).map_err(|e| e.to_string())
}
