use crate::shared::types::{BookData, BookKind};
use epub::doc::EpubDoc;

use std::path::Path;

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
    let filePath = epubPath.to_string_lossy().to_string();
    let kind = BookKind::Epub.to_string();
    let current_location = "".to_string();

    Ok(BookData::new(
        id,
        kind,
        cover,
        title,
        author,
        publisher,
        filePath,
        current_location,
        None,
    ))
}
