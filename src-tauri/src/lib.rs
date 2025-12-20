mod commands;
pub mod embed;
mod epub;
mod pdf;
mod shared;
pub mod vectordb;

pub mod db;

pub mod llm;
pub mod models;
pub mod schema;
pub mod speach;
pub mod sql;

mod api;

#[cfg(test)]
pub mod test_fixtures;

#[cfg(test)]
pub mod test_helpers;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_mic_recorder::init())
        .setup(|app| {
            //let _conn = db::init_database(app.handle())?;
            db::setup_database(app.handle())?;
            // You can store this conn somewhere global if needed
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_dev,
            commands::unzip,
            commands::get_book_data,
            commands::get_pdf_data,
            commands::embed,
            commands::save_vectors,
            commands::search_vectors,
            commands::process_job,
            commands::get_context_for_query,
            api::get_realtime_client_secret,
            // SQL commands
            sql::save_page_data_many,
            sql::get_all_page_data_by_book_id,
            sql::save_book,
            sql::get_book,
            sql::get_books,
            sql::delete_book,
            sql::update_book_cover,
            sql::has_saved_epub_data,
            sql::update_book_location,
            sql::get_text_from_vector_id,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
