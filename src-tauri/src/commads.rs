use std::fs;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

use crate::epub;
use crate::pdf;
use crate::shared::types::BookData;

#[tauri::command]
pub fn get_book_data(epubPath: &Path) -> Result<BookData, String> {
    epub::get_bookData(epubPath)
}

#[tauri::command]
pub fn get_pdf_data(app: tauri::AppHandle, pdfPath: &Path) -> Result<BookData, String> {
    let res = pdf::get_bookData(pdfPath);
    if let Ok(book_data) = &res {
        pdf::store_book_data(app, book_data);
    }
    return res.map_err(|e| e.to_string());
}

#[tauri::command]
pub fn get_paragraphs(pdfPath: &Path, pageNumber: u32) -> Result<Vec<String>, String> {
    pdf::get_paragraphs(pdfPath, pageNumber).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn is_dev() -> bool {
    tauri::is_dev()
}

#[tauri::command]
pub fn unzip(file_path: &str, out_dir: &str) -> Result<PathBuf, String> {
    println!(
        "unzip called with file_path: {:?}, out_dir: {:?}",
        file_path, out_dir
    );
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let output_dir = Path::new(out_dir);
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    // Extract all files (like AdmZip's `extractAllTo`)
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = output_dir.join(file.name());

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    // Copy the original zip file into the extracted folder (AdmZip analog)
    let zip_filename = Path::new(file_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let new_zip_file_path = output_dir.join(zip_filename);
    fs::copy(file_path, &new_zip_file_path).map_err(|e| e.to_string())?;

    // println!("File was copied to {:?}", new_zip_file_path);

    Ok(output_dir.to_path_buf())
}
