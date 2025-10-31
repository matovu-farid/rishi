use epub::doc::EpubDoc;
use lopdf::Document;
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
    pdfPath: String,
    current_location: String,
}

pub fn get_bookData(pdfPath: &Path) -> Result<BookData, String> {
    todo!()
    // let mut extractor = Extractor::new().set_extract_string_max_length(1000);
    // // can also perform conditional configuration
    // let custom_pdf_config = true;
    // if custom_pdf_config {
    //     extractor =
    //         extractor.set_pdf_config(PdfParserConfig::new().set_extract_annotation_text(false));
    // }
    // let doc = Document::load(pdfPath).map_err(|e| e.to_string())?;
    // doc.build_outline();

    // let mut doc = EpubDoc::new(pdfPath).map_err(|e| e.to_string())?;
    // let cover_data = doc.get_cover().ok_or("No cover found")?;
    // let cover = cover_data.0;
    // let title = doc.get_title();

    // let author = doc.mdata("creator").map(|data| data.value.clone());
    // let publisher = doc.mdata("publisher").map(|data| data.value.clone());
    // // create a unique id by hashing the path
    // let digest = md5::compute(pdfPath.to_string_lossy().to_string());
    // let id = format!("{:x}", digest);

    // Ok(BookData {
    //     current_location: "".to_string(),
    //     id,
    //     cover,
    //     title,
    //     author,
    //     publisher,
    //     pdfPath: pdfPath.to_string_lossy().to_string(),
    // })
}
