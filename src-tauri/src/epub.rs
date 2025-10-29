use epub::doc::EpubDoc;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::path;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BookData {
    id: String,
    cover: Vec<u8>,
    title: Option<String>,
    author: Option<String>,
    publisher: Option<String>,
    epubPath: String,
    current_location: String,
}

pub fn get_bookData(epubPath: &Path) -> Result<BookData, String> {
    let mut doc = EpubDoc::new(epubPath).map_err(|e| e.to_string())?;
    let cover_data = doc.get_cover().ok_or("No cover found")?;
    let cover = cover_data.0;
    let title = doc.get_title();

    let author = doc.mdata("creator").map(|data| data.value.clone());
    let publisher = doc.mdata("publisher").map(|data| data.value.clone());
    // create a unique id by hashing the path
    let digest = md5::compute(epubPath.to_string_lossy().to_string());
    let id = format!("{:x}", digest);

    Ok(BookData {
        current_location: "".to_string(),
        id,
        cover,
        title,
        author,
        publisher,
        epubPath: epubPath.to_string_lossy().to_string(),
    })
}
