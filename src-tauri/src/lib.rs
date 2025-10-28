pub mod epub;
pub mod error_tracking;
pub mod player;
pub mod tts;

mod commads;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commads::greet,
            commads::is_dev,
            commads::unzip,
            commads::epub_open_book,
            commads::epub_get_nav,
            commads::epub_get_packaging,
            commads::epub_compute_locations,
            commads::annotations_list,
            commads::annotations_add,
            commads::annotations_update,
            commads::annotations_remove,
            commads::href_to_page_index_cmd,
            commads::search_text,
            commads::themes_list,
            commads::themes_register,
            commads::themes_register_with_font,
            commads::themes_register_global_font,
            commads::themes_get_font_css,
            commads::themes_register_font_css,
            commads::themes_register_font_css_for_book,
            commads::themes_register_font_from_resource,
            commads::themes_apply,
            commads::resource_set_strategy,
            commads::resource_register_blob,
            commads::resource_get,
            commads::resource_get_html_with_inlined_css,
            commads::epub_get_cover,
            commads::layout_compute,
            commads::map_point_to_cfi_cmd,
            commads::map_cfi_to_rects_cmd,
            commads::rendition_render_plan,
            commads::cfi_page_index,
            commads::offsets_to_cfi,
            commads::epub_paragraphs_current,
            commads::epub_paragraphs_next,
            commads::epub_paragraphs_prev,
            commads::player_create,
            commads::player_play,
            commads::player_pause,
            commads::player_resume,
            commads::player_stop,
            commads::player_next,
            commads::player_prev,
            commads::player_state,
            commads::player_set_page,
            tts::tts_get_audio_path,
            tts::tts_queue_status,
            tts::tts_clear_book_cache,
            tts::tts_get_book_cache_size,
            tts::tts_request_audio,
            tts::tts_enqueue_audio,
            tts::tts_cancel,
            tts::tts_cancel_all,
            commads::map_cfi_range_to_rects_str
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
