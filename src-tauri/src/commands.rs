use std::fs;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use zip::ZipArchive;
// At the top of commands.rs
use crate::embed::EmbedResult;
use crate::embed::{embed_text, EmbedParam};
use crate::epub::Epub;
use crate::pdf::Pdf;
use crate::shared::books::store_book_data;
use crate::shared::books::Extractable;
use crate::shared::types::BookData;
use crate::vectordb::{SearchResult, Vector, VectorStore};

#[tauri::command]
pub fn get_book_data(app: tauri::AppHandle, path: &Path) -> Result<BookData, String> {
    let data = Epub::new(path);
    store_book_data(app, &data).map_err(|e| e.to_string())?;
    data.extract().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_vectors(
    app: tauri::AppHandle,
    name: &str,
    dim: usize,
    vectors: Vec<Vector>,
) -> Result<(), String> {
    if vectors.is_empty() {
        return Err("Vectors cannot be empty".to_string());
    }
    let mut vector_store = VectorStore::new(&app, dim, name).map_err(|e| e.to_string())?;
    vector_store.add_vectors(vectors).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_vectors(
    app: tauri::AppHandle,
    name: &str,
    query: Vec<f32>,
    dim: usize,
    k: usize,
) -> Result<Vec<SearchResult>, String> {
    let vector_store = VectorStore::new(&app, dim, name).map_err(|e| e.to_string())?;
    vector_store.search(query, k).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn get_pdf_data(app: tauri::AppHandle, path: &Path) -> Result<BookData, String> {
    let data = Pdf::new(path);
    store_book_data(app, &data).map_err(|e| e.to_string())?;
    data.extract().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn embed(embedparams: Vec<EmbedParam>) -> Result<Vec<EmbedResult>, String> {
    let res = embed_text(embedparams).await.map_err(|e| e.to_string())?;
    Ok(res)
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
