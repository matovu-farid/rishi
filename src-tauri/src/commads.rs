use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use zip::ZipArchive;

use crate::epub::annotations::Annotation;
use crate::epub::cfi::try_parse_cfi_range_to_offsets;
use crate::epub::docs::EpubDoc;
use crate::epub::layout::{compute_layout, LayoutOptions, LayoutPlan};
use crate::epub::locations::{compute_locations, LocationsResult};
use crate::epub::mapping::{cfi_to_page_index, offset_to_cfi};
use crate::epub::mapping::{
    map_point_to_cfi, map_range_to_rects, CFIRangeRectsRequest, PointToCFIRequest,
};
use crate::epub::replacements::ReplacementMode;
use crate::epub::resources::bytes_to_data_uri;
use crate::epub::store::{load_json, save_json, AnnotationsPayload, LocationsPayload};
use crate::epub::themes::Theme;
use crate::player::{player_emit_paragraph, PlayerCore, PlayingState, PLAYERS};
use base64::{engine::general_purpose, Engine as _};
use std::io::BufReader;
use tauri::Emitter;

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

// ---------------- EPUB commands ----------------

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static BOOKS: Lazy<Mutex<HashMap<u64, EpubDoc<BufReader<File>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static ANNOTATIONS: Lazy<Mutex<HashMap<u64, Vec<crate::epub::annotations::Annotation>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static THEME_REGISTRY: Lazy<Mutex<crate::epub::themes::ThemeRegistry>> =
    Lazy::new(|| Mutex::new(crate::epub::themes::ThemeRegistry::new()));
static ACTIVE_THEME: Lazy<Mutex<HashMap<u64, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static LAYOUTS: Lazy<Mutex<HashMap<u64, LayoutPlan>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static THEME_FONTS: Lazy<Mutex<HashMap<u64, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static RESOURCE_MANAGERS: Lazy<Mutex<HashMap<u64, crate::epub::resources::ResourceManager>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn annotations_default_path(book_id: u64) -> PathBuf {
    let dir = std::env::temp_dir().join("rishi_store");
    let _ = fs::create_dir_all(&dir);
    dir.join(format!("{}_annotations.json", book_id))
}

#[derive(Serialize)]
pub struct SpineEntry {
    pub idref: String,
    pub id: Option<String>,
    pub properties: Option<String>,
    pub linear: bool,
}

#[derive(Serialize)]
pub struct ResourceEntry {
    pub id: String,
    pub path: String,
    pub mime: String,
    pub properties: Option<String>,
}

#[derive(Serialize)]
pub struct OpenBookResponse {
    pub book_id: u64,
    pub title: Option<String>,
    pub spine: Vec<SpineEntry>,
    pub resources: Vec<ResourceEntry>,
}

#[tauri::command]
pub fn epub_open_book(path: &str) -> Result<OpenBookResponse, String> {
    #[cfg(debug_assertions)]
    eprintln!("[DEBUG:BOOK_OPEN] Opening file: {}", path);

    let file = File::open(path).map_err(|e| {
        #[cfg(debug_assertions)]
        eprintln!("[ERROR:BOOK_OPEN] Failed to open file: {}", e);
        e.to_string()
    })?;

    let doc = EpubDoc::from_reader(BufReader::new(file)).map_err(|e| {
        #[cfg(debug_assertions)]
        eprintln!("[ERROR:BOOK_OPEN] Failed to parse EPUB: {}", e);
        e.to_string()
    })?;

    let title = doc.get_title();
    let spine_len = doc.spine.len();
    let resources_len = doc.resources.len();

    let spine = doc
        .spine
        .iter()
        .cloned()
        .map(|s| SpineEntry {
            idref: s.idref,
            id: s.id,
            properties: s.properties,
            linear: s.linear,
        })
        .collect();
    let resources = doc
        .resources
        .iter()
        .map(|(rid, r)| ResourceEntry {
            id: rid.clone(),
            path: r.path.to_string_lossy().to_string(),
            mime: r.mime.clone(),
            properties: r.properties.clone(),
        })
        .collect();

    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    {
        let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
        books.insert(id, doc);
    }

    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:BOOK_OPEN] Successfully opened book_id: {}, spine_length: {}, resources: {}, title: {:?}",
        id, spine_len, resources_len, title
    );

    // Load autosaved annotations if present
    let auto_path = annotations_default_path(id);
    if auto_path.exists() {
        if let Ok(payload) = load_json::<_, AnnotationsPayload>(&auto_path) {
            let mut anns = ANNOTATIONS
                .lock()
                .map_err(|_| "registry poisoned".to_string())?;
            anns.insert(id, payload.annotations);
        }
    }

    Ok(OpenBookResponse {
        book_id: id,
        title,
        spine,
        resources,
    })
}

#[derive(Serialize)]
pub struct GetNavResponse {
    pub toc: Vec<crate::epub::nav::NavItem>,
    pub page_list: Vec<crate::epub::nav::NavItem>,
    pub landmarks: Vec<crate::epub::nav::NavItem>,
    pub page_list_spine_indices: Vec<Option<usize>>, // same order as page_list
}

#[tauri::command]
pub fn epub_get_nav(book_id: u64) -> Result<GetNavResponse, String> {
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    if let Some(nav) = doc.get_nav_data() {
        let indices: Vec<Option<usize>> = nav
            .page_list
            .iter()
            .map(|item| doc.href_to_spine_index(&item.href))
            .collect();
        Ok(GetNavResponse {
            toc: nav.toc,
            page_list: nav.page_list,
            landmarks: nav.landmarks,
            page_list_spine_indices: indices,
        })
    } else {
        Ok(GetNavResponse {
            toc: vec![],
            page_list: vec![],
            landmarks: vec![],
            page_list_spine_indices: vec![],
        })
    }
}

#[derive(Serialize)]
pub struct PackagingResponse {
    pub page_progression_direction: Option<String>,
    pub guides: Vec<GuideResponse>,
    pub rendition_layout: Option<String>,
    pub rendition_flow: Option<String>,
    pub rendition_orientation: Option<String>,
    pub rendition_spread: Option<String>,
    pub bindings: Vec<BindingResponse>,
    pub collections: Vec<CollectionResponse>,
}

#[derive(Serialize)]
pub struct GuideResponse {
    pub r#type: Option<String>,
    pub title: Option<String>,
    pub href: Option<String>,
}

#[derive(Serialize)]
pub struct BindingResponse {
    pub media_type: String,
    pub handler: String,
}

#[derive(Serialize)]
pub struct CollectionLinkResponse {
    pub href: Option<String>,
    pub rel: Option<String>,
}

#[derive(Serialize)]
pub struct CollectionResponse {
    pub role: Option<String>,
    pub links: Vec<CollectionLinkResponse>,
}

#[tauri::command]
pub fn epub_get_packaging(book_id: u64) -> Result<PackagingResponse, String> {
    let books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    let guides = doc
        .guides
        .iter()
        .cloned()
        .map(|g| GuideResponse {
            r#type: g.r#type,
            title: g.title,
            href: g.href,
        })
        .collect();
    let bindings = doc
        .bindings
        .iter()
        .cloned()
        .map(|b| BindingResponse {
            media_type: b.media_type,
            handler: b.handler,
        })
        .collect();
    let collections = doc
        .collections
        .iter()
        .cloned()
        .map(|c| CollectionResponse {
            role: c.role,
            links: c
                .links
                .into_iter()
                .map(|l| CollectionLinkResponse {
                    href: l.href,
                    rel: l.rel,
                })
                .collect(),
        })
        .collect();
    Ok(PackagingResponse {
        page_progression_direction: doc.page_progression_direction.clone(),
        guides,
        rendition_layout: doc.rendition_layout.clone(),
        rendition_flow: doc.rendition_flow.clone(),
        rendition_orientation: doc.rendition_orientation.clone(),
        rendition_spread: doc.rendition_spread.clone(),
        bindings,
        collections,
    })
}

#[tauri::command]
pub fn epub_compute_locations(
    book_id: u64,
    chars_per_location: Option<u32>,
) -> Result<LocationsResult, String> {
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    let cpl = chars_per_location.unwrap_or(1200) as usize;
    Ok(compute_locations(doc, cpl))
}

#[derive(Serialize)]
pub struct LayoutComputeResponse {
    pub total_pages: usize,
    pub pages_per_spine: Vec<usize>,
    pub spread_mode: String,
    pub spreads: Vec<crate::epub::layout::SpreadEntry>,
    pub reading_direction: Option<String>,
}

#[tauri::command]
pub fn layout_compute(
    app: tauri::AppHandle,
    book_id: u64,
    opts: Option<LayoutOptions>,
) -> Result<LayoutComputeResponse, String> {
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    let opts = opts.unwrap_or_default();
    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:LAYOUT] book_id: {}, viewport: {}x{}, flow: {:?}, spine length: {}",
        book_id,
        opts.viewport_width,
        opts.viewport_height,
        opts.flow,
        doc.spine.len()
    );
    let plan = compute_layout(doc, &opts);
    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:LAYOUT] Computed {} pages, pages_per_spine: {:?}",
        plan.total_pages, plan.pages_per_spine
    );
    let spread_mode = match plan.spread_mode {
        crate::epub::layout::SpreadMode::Auto => "auto",
        crate::epub::layout::SpreadMode::None => "none",
        crate::epub::layout::SpreadMode::Always => "always",
    }
    .to_string();
    let resp = LayoutComputeResponse {
        total_pages: plan.total_pages,
        pages_per_spine: plan.pages_per_spine.clone(),
        spread_mode,
        spreads: plan.spreads.clone(),
        reading_direction: plan.reading_direction.clone(),
    };
    drop(books);
    let mut layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    layouts.insert(book_id, plan);
    let _ = app.emit(
        "rendition://rendered",
        serde_json::json!({
            "bookId": book_id,
            "totalPages": resp.total_pages,
            "pagesPerSpine": resp.pages_per_spine,
            "spreadMode": resp.spread_mode,
            "readingDirection": resp.reading_direction,
        }),
    );
    Ok(resp)
}

#[tauri::command]
pub fn map_point_to_cfi_cmd(
    app: tauri::AppHandle,
    book_id: u64,
    req: PointToCFIRequest,
) -> Result<String, String> {
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    let resp = map_point_to_cfi(plan, &req).ok_or_else(|| "no page found".to_string())?;
    let _ = app.emit(
        "rendition://locationChanged",
        serde_json::json!({
            "bookId": book_id,
            "cfi": resp.cfi,
        }),
    );
    Ok(resp.cfi)
}

#[tauri::command]
pub fn map_cfi_to_rects_cmd(
    book_id: u64,
    req: CFIRangeRectsRequest,
) -> Result<serde_json::Value, String> {
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    let rects = map_range_to_rects(plan, &req);
    serde_json::to_value(rects).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn map_cfi_range_to_rects_str(
    book_id: u64,
    cfi_range: String,
    viewport: crate::epub::mapping::Viewport,
) -> Result<serde_json::Value, String> {
    let ((start_spine_index, start_char_offset), (end_spine_index, end_char_offset)) =
        try_parse_cfi_range_to_offsets(&cfi_range)
            .ok_or_else(|| "invalid cfi range".to_string())?;
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    let req = CFIRangeRectsRequest {
        start_spine_index,
        start_char_offset,
        end_spine_index,
        end_char_offset,
        viewport,
    };
    let rects = map_range_to_rects(plan, &req);
    serde_json::to_value(rects).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct PageInfo {
    pub page_index: usize,
    pub spine_index: usize,
    pub start_char: usize,
    pub end_char: usize,
    pub href: Option<String>,
    pub base_path: Option<String>,
}

#[derive(Serialize)]
pub struct AnnotationRect {
    pub id: String,
    pub kind: String,
    pub page_index: usize,
    pub rects: Vec<crate::epub::mapping::RectF32>,
}

#[derive(Serialize)]
pub struct RenderPlanResponse {
    pub total_pages: usize,
    pub pages: Vec<PageInfo>,
    pub theme_css: Option<String>,
    pub annotations: Vec<AnnotationRect>,
    pub page_progression_direction: Option<String>,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub cfi: String,
    pub excerpt: String,
}

#[tauri::command]
pub fn search_text(
    book_id: u64,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let max_results = max_results.unwrap_or(50);
    let mut results: Vec<SearchResult> = Vec::new();
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    let q = query.to_lowercase();
    let spine_idrefs: Vec<(usize, String)> = doc
        .spine
        .iter()
        .enumerate()
        .map(|(i, s)| (i, s.idref.clone()))
        .collect();
    for (spine_index, idref) in spine_idrefs {
        if let Some((content, mime)) = doc.get_resource_str(&idref) {
            if !mime.contains("html") {
                continue;
            }
            // normalize text
            let t = content
                .replace("</p>", "\n\n")
                .replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<br />", "\n");
            let mut out = String::with_capacity(t.len());
            let mut in_tag = false;
            for ch in t.chars() {
                match ch {
                    '<' => in_tag = true,
                    '>' => in_tag = false,
                    _ if !in_tag => out.push(ch),
                    _ => {}
                }
            }
            let out_chars: Vec<char> = out.chars().collect();
            let hay = out_chars
                .iter()
                .map(|c| c.to_lowercase().to_string())
                .collect::<String>();
            let needle = q.chars().collect::<Vec<char>>();
            let needle_lower = needle
                .iter()
                .map(|c| c.to_lowercase().to_string())
                .collect::<String>();
            let mut i = 0usize;
            while i + needle_lower.len() <= hay.len() {
                if &hay[i..i + needle_lower.len()] == needle_lower {
                    // map byte index i in hay to char index in out
                    // Build mapping of hay byte offsets to char indices
                    let mut bytes = 0usize;
                    let mut char_idx = 0usize;
                    for c in &out_chars {
                        bytes += c.to_lowercase().to_string().len();
                        if bytes > i {
                            break;
                        }
                        char_idx += 1;
                    }
                    let abs_char = char_idx;
                    let start_char = abs_char.saturating_sub(30);
                    let end_char = (abs_char + needle.len() + 30).min(out_chars.len());
                    let excerpt: String = out_chars[start_char..end_char].iter().collect();
                    let cfi = offset_to_cfi(spine_index, abs_char);
                    results.push(SearchResult { cfi, excerpt });
                    if results.len() >= max_results {
                        return Ok(results);
                    }
                }
                i += 1;
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn rendition_render_plan(
    app: tauri::AppHandle,
    book_id: u64,
    start_page: usize,
    page_count: usize,
) -> Result<serde_json::Value, String> {
    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:RENDER_PLAN] book_id: {}, requesting page {}-{}",
        book_id,
        start_page,
        start_page + page_count
    );
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts.get(&book_id).ok_or_else(|| {
        #[cfg(debug_assertions)]
        eprintln!(
            "[ERROR:RENDER_PLAN] Layout not found for book_id: {}",
            book_id
        );
        "layout not computed".to_string()
    })?;
    let total = plan.total_pages;
    let from = start_page.min(total);
    let to = (from + page_count).min(total);
    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:RENDER_PLAN] total_pages: {}, plan.pages.len(): {}, from: {}, to: {}",
        total,
        plan.pages.len(),
        from,
        to
    );

    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;

    // build page infos with hrefs
    let mut pages: Vec<PageInfo> = Vec::new();
    for page in plan.pages.iter().skip(from).take(to - from) {
        let idref_str = doc.spine[page.spine_index].idref.clone();
        let idref = idref_str.as_str();
        let resource = doc.resources.get(idref);
        let href = resource.map(|r| r.path.to_string_lossy().to_string());
        let base_path =
            resource.and_then(|r| r.path.parent().map(|p| p.to_string_lossy().to_string()));

        // Detailed page content logging (only in debug builds)
        #[cfg(debug_assertions)]
        {
            eprintln!(
                "[DEBUG:PAGE_CONTENT] page_index: {}, spine_index: {}, idref: {}, href: {:?}, char_range: {}-{}",
                page.global_index, page.spine_index, idref, href, page.start_char, page.end_char
            );

            // Validate spine index matches
            eprintln!(
                "[DEBUG:SPINE_VALIDATION] Expected idref from spine[{}]: {}, actual idref from page: {}",
                page.spine_index, idref, idref
            );

            // Log content preview
            if let Some((content, _)) = doc.get_resource_str(idref) {
                let preview = content.chars().take(200).collect::<String>();
                eprintln!("[DEBUG:PAGE_CONTENT] Content preview: {}", preview);
            } else {
                eprintln!(
                    "[WARNING:PAGE_CONTENT] No content found for idref: {}",
                    idref
                );
            }
        }

        pages.push(PageInfo {
            page_index: page.global_index,
            spine_index: page.spine_index,
            start_char: page.start_char,
            end_char: page.end_char,
            href,
            base_path,
        });
    }

    // theme css
    let theme_css = {
        let reg = THEME_REGISTRY
            .lock()
            .map_err(|_| "registry poisoned".to_string())?;
        let active = ACTIVE_THEME
            .lock()
            .map_err(|_| "registry poisoned".to_string())?;
        let css = active.get(&book_id).and_then(|name| reg.get_css(name));
        let fonts = THEME_FONTS
            .lock()
            .map_err(|_| "registry poisoned".to_string())?;
        let mut combined = String::new();
        if let Some(global) = fonts.get(&0) {
            if !global.is_empty() {
                combined.push_str(global);
                combined.push('\n');
            }
        }
        if let Some(per_book) = fonts.get(&book_id) {
            if !per_book.is_empty() {
                combined.push_str(per_book);
                combined.push('\n');
            }
        }
        match (css, combined.is_empty()) {
            (Some(mut c), false) => {
                c = format!("{}\n{}", combined, c);
                Some(c)
            }
            (Some(c), true) => Some(c),
            (None, false) => Some(combined),
            (None, true) => None,
        }
    };

    // annotations rects in selected page range
    let mut annotations: Vec<AnnotationRect> = Vec::new();
    if let Ok(anns) = ANNOTATIONS.lock() {
        if let Some(list) = anns.get(&book_id) {
            for ann in list {
                if let Some(((s_sp, s_off), (e_sp, e_off))) =
                    try_parse_cfi_range_to_offsets(&ann.cfi_range)
                {
                    let rects = map_range_to_rects(
                        &plan,
                        &CFIRangeRectsRequest {
                            start_spine_index: s_sp,
                            start_char_offset: s_off,
                            end_spine_index: e_sp,
                            end_char_offset: e_off,
                            viewport: crate::epub::mapping::Viewport {
                                width: 1.0,
                                height: 1.0,
                            },
                        },
                    );
                    for pr in rects {
                        if pr.page_index >= from && pr.page_index < to {
                            annotations.push(AnnotationRect {
                                id: ann.id.clone(),
                                kind: serde_json::to_string(&ann.kind)
                                    .unwrap_or_else(|_| "\"highlight\"".into())
                                    .trim_matches('"')
                                    .to_string(),
                                page_index: pr.page_index,
                                rects: pr.rects,
                            });
                        }
                    }
                }
            }
        }
    }

    let res = RenderPlanResponse {
        total_pages: total,
        pages,
        theme_css,
        annotations,
        page_progression_direction: doc.page_progression_direction.clone(),
    };
    let _ = app.emit(
        "rendition://rendered",
        serde_json::json!({
            "bookId": book_id,
            "page": from,
            "count": page_count,
        }),
    );
    serde_json::to_value(res).map_err(|e| e.to_string())
}

// ----------- Paragraph extraction ----------

#[derive(Serialize, Clone)]
pub struct ParagraphResp {
    pub text: String,
    pub cfi_range: String,
}

fn split_paragraphs(text: &str) -> Vec<String> {
    let t = text
        .replace("</p>", "\n\n")
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n");
    // naive: strip remaining tags
    let mut out = String::with_capacity(t.len());
    let mut in_tag = false;
    for ch in t.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split('\n')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn paragraphs_for_page(
    doc: &mut EpubDoc<BufReader<File>>,
    spine_index: usize,
    start_char: usize,
    end_char: usize,
    min_len: usize,
) -> Vec<ParagraphResp> {
    let idref = match doc.spine.get(spine_index) {
        Some(s) => s.idref.clone(),
        None => return vec![],
    };
    let Some((content, mime)) = doc.get_resource_str(&idref) else {
        return vec![];
    };
    if !mime.contains("html") {
        return vec![];
    }
    let paras = split_paragraphs(&content);
    // accumulate paragraph offsets over concatenated text
    let mut res = Vec::new();
    let mut cum = 0usize;
    for p in paras {
        let len = p.chars().count();
        let p_start = cum;
        let p_end = cum + len;
        cum = p_end + 1; // account for a newline
                         // page window intersection
        if p_end <= start_char || p_start >= end_char {
            continue;
        }
        if len < min_len {
            continue;
        }
        let s_off = p_start.max(start_char);
        let e_off = p_end.min(end_char);
        // build cfi range using offsets
        let start_cfi = crate::epub::mapping::offset_to_cfi(spine_index, s_off);
        let end_cfi = crate::epub::mapping::offset_to_cfi(spine_index, e_off);
        let cfi_range = format!(
            "epubcfi(range({},{}))",
            start_cfi
                .trim_start_matches("epubcfi(")
                .trim_end_matches(")"),
            end_cfi.trim_start_matches("epubcfi(").trim_end_matches(")")
        );
        res.push(ParagraphResp { text: p, cfi_range });
    }
    res
}

#[tauri::command]
pub fn epub_paragraphs_current(
    book_id: u64,
    page_index: usize,
    min_length: Option<u32>,
) -> Result<Vec<ParagraphResp>, String> {
    let min_len = min_length.unwrap_or(50) as usize;
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    let page = plan
        .pages
        .get(page_index)
        .ok_or_else(|| "page out of range".to_string())?;
    Ok(paragraphs_for_page(
        doc,
        page.spine_index,
        page.start_char,
        page.end_char,
        min_len,
    ))
}

#[tauri::command]
pub fn epub_paragraphs_next(
    book_id: u64,
    page_index: usize,
    min_length: Option<u32>,
) -> Result<Vec<ParagraphResp>, String> {
    epub_paragraphs_current(book_id, page_index.saturating_add(1), min_length)
}

#[tauri::command]
pub fn epub_paragraphs_prev(
    book_id: u64,
    page_index: usize,
    min_length: Option<u32>,
) -> Result<Vec<ParagraphResp>, String> {
    epub_paragraphs_current(book_id, page_index.saturating_sub(1), min_length)
}

// ----------- Store (persistence) ----------

#[tauri::command]
pub fn store_save_annotations(book_id: u64, path: String) -> Result<(), String> {
    let anns = ANNOTATIONS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?
        .get(&book_id)
        .cloned()
        .unwrap_or_default();
    save_json(path, &AnnotationsPayload { annotations: anns })
}

#[tauri::command]
pub fn store_load_annotations(book_id: u64, path: String) -> Result<usize, String> {
    let payload: AnnotationsPayload = load_json(path)?;
    let mut anns = ANNOTATIONS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    anns.insert(book_id, payload.annotations);
    let count = anns.get(&book_id).map(|v| v.len()).unwrap_or(0);
    Ok(count)
}

#[tauri::command]
pub fn store_save_locations(book_id: u64, path: String) -> Result<(), String> {
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    let payload = LocationsPayload {
        total: plan.total_pages,
        by_spine: plan.pages_per_spine.clone(),
    };
    save_json(path, &payload)
}

#[tauri::command]
pub fn store_load_locations() -> Result<(), String> {
    // No-op: layout is computed from content; locations payload is informational for now
    Ok(())
}

// ----------- Player Core (Rust) ----------

#[tauri::command]
pub fn player_create(book_id: u64) -> Result<(), String> {
    let mut players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    players.entry(book_id).or_insert(PlayerCore::new(book_id));
    Ok(())
}

fn player_current_paragraph(app: &tauri::AppHandle, book_id: u64) -> Result<(), String> {
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    let players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let p = players
        .get(&book_id)
        .ok_or_else(|| "player not found".to_string())?
        .clone();
    let paras = crate::player::paragraphs_for_page_internal(doc, plan, p.current_page_index);
    if paras.is_empty() {
        return Err("no paragraphs".to_string());
    }
    let idx = p.current_paragraph_index.min(paras.len() - 1);
    let para = &paras[idx];
    player_emit_paragraph(
        app,
        crate::player::PlayerParagraphEvent {
            book_id,
            page_index: p.current_page_index,
            paragraph_index: idx,
            text: para.text.clone(),
            cfi_range: para.cfi_range.clone(),
        },
    );
    Ok(())
}

#[tauri::command]
pub fn player_play(app: tauri::AppHandle, book_id: u64) -> Result<(), String> {
    player_create(book_id)?;
    {
        let mut players = PLAYERS
            .lock()
            .map_err(|_| "registry poisoned".to_string())?;
        if let Some(core) = players.get_mut(&book_id) {
            core.state = PlayingState::Playing;
        }
    }
    player_current_paragraph(&app, book_id)
}

#[tauri::command]
pub fn player_pause(book_id: u64) -> Result<(), String> {
    let mut players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    if let Some(core) = players.get_mut(&book_id) {
        core.state = PlayingState::Paused;
    }
    Ok(())
}

#[tauri::command]
pub fn player_resume(app: tauri::AppHandle, book_id: u64) -> Result<(), String> {
    let mut players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    if let Some(core) = players.get_mut(&book_id) {
        core.state = PlayingState::Playing;
    }
    drop(players);
    player_current_paragraph(&app, book_id)
}

#[tauri::command]
pub fn player_stop(book_id: u64) -> Result<(), String> {
    let mut players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    if let Some(core) = players.get_mut(&book_id) {
        core.state = PlayingState::Stopped;
        core.current_paragraph_index = 0;
    }
    Ok(())
}

#[tauri::command]
pub fn player_next(app: tauri::AppHandle, book_id: u64) -> Result<(), String> {
    let mut players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    if let Some(core) = players.get_mut(&book_id) {
        core.current_paragraph_index += 1;
        // if beyond current page paragraphs, move to next page
        // we don't know count here cheaply; optimistically try to emit, if error move page
    }
    drop(players);
    if player_current_paragraph(&app, book_id).is_err() {
        // advance page
        let mut players = PLAYERS
            .lock()
            .map_err(|_| "registry poisoned".to_string())?;
        if let Some(core) = players.get_mut(&book_id) {
            core.current_page_index =
                (core.current_page_index + 1).min(plan.total_pages.saturating_sub(1));
            core.current_paragraph_index = 0;
        }
        drop(players);
        player_current_paragraph(&app, book_id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn player_prev(app: tauri::AppHandle, book_id: u64) -> Result<(), String> {
    let mut players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    if let Some(core) = players.get_mut(&book_id) {
        if core.current_paragraph_index == 0 {
            core.current_page_index = core.current_page_index.saturating_sub(1);
            core.current_paragraph_index = 0; // will clamp to last later when emitted
        } else {
            core.current_paragraph_index = core.current_paragraph_index.saturating_sub(1);
        }
    }
    drop(players);
    player_current_paragraph(&app, book_id)
}

#[tauri::command]
pub fn player_set_page(book_id: u64, page_index: usize) -> Result<(), String> {
    let mut players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    if let Some(core) = players.get_mut(&book_id) {
        core.current_page_index = page_index;
        core.current_paragraph_index = 0;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct PlayerStateResp {
    state: String,
    page_index: usize,
    paragraph_index: usize,
}

#[tauri::command]
pub fn player_state(book_id: u64) -> Result<PlayerStateResp, String> {
    let players = PLAYERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let p = players
        .get(&book_id)
        .ok_or_else(|| "player not found".to_string())?;
    let s = match p.state {
        PlayingState::Playing => "playing",
        PlayingState::Paused => "paused",
        PlayingState::Stopped => "stopped",
    }
    .to_string();
    Ok(PlayerStateResp {
        state: s,
        page_index: p.current_page_index,
        paragraph_index: p.current_paragraph_index,
    })
}

// ----------- Annotations ----------

#[tauri::command]
pub fn annotations_list(book_id: u64) -> Result<Vec<Annotation>, String> {
    let anns = ANNOTATIONS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    Ok(anns.get(&book_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn annotations_add(book_id: u64, annotation: Annotation) -> Result<(), String> {
    let mut anns = ANNOTATIONS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let list = anns.entry(book_id).or_default();
    if let Some(pos) = list.iter().position(|a| a.id == annotation.id) {
        list[pos] = annotation;
    } else {
        list.push(annotation);
    }
    // autosave
    let path = annotations_default_path(book_id);
    let payload = AnnotationsPayload {
        annotations: anns.get(&book_id).cloned().unwrap_or_default(),
    };
    let _ = save_json(&path, &payload);
    Ok(())
}

#[tauri::command]
pub fn annotations_update(book_id: u64, annotation: Annotation) -> Result<(), String> {
    let mut anns = ANNOTATIONS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let list = anns.entry(book_id).or_default();
    if let Some(pos) = list.iter().position(|a| a.id == annotation.id) {
        list[pos] = annotation;
        let path = annotations_default_path(book_id);
        let payload = AnnotationsPayload {
            annotations: anns.get(&book_id).cloned().unwrap_or_default(),
        };
        let _ = save_json(&path, &payload);
        Ok(())
    } else {
        Err("annotation not found".to_string())
    }
}

#[tauri::command]
pub fn annotations_remove(book_id: u64, id: String) -> Result<(), String> {
    let mut anns = ANNOTATIONS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    if let Some(list) = anns.get_mut(&book_id) {
        list.retain(|a| a.id != id);
    }
    let path = annotations_default_path(book_id);
    let payload = AnnotationsPayload {
        annotations: anns.get(&book_id).cloned().unwrap_or_default(),
    };
    let _ = save_json(&path, &payload);
    Ok(())
}

#[tauri::command]
pub fn href_to_page_index_cmd(book_id: u64, href: String) -> Result<usize, String> {
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    if let Some(spine_index) = doc.href_to_spine_index(&href) {
        // Sum pages before this spine index
        let mut count_before = 0usize;
        for (idx, &count) in plan.pages_per_spine.iter().enumerate() {
            if idx == spine_index {
                break;
            }
            count_before += count;
        }
        return Ok(count_before);
    }
    Err("no page for href".to_string())
}

// ----------- Themes ----------

#[tauri::command]
pub fn themes_list() -> Result<Vec<Theme>, String> {
    let reg = THEME_REGISTRY
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    Ok(reg.list())
}

#[tauri::command]
pub fn themes_register(name: String, css: String) -> Result<(), String> {
    let mut reg = THEME_REGISTRY
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    reg.register(name, css);
    Ok(())
}

#[tauri::command]
pub fn themes_register_font_css(css: String) -> Result<(), String> {
    let mut fonts = THEME_FONTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let entry = fonts.entry(0).or_default();
    if !entry.is_empty() {
        entry.push_str("\n");
    }
    entry.push_str(&css);
    Ok(())
}

#[tauri::command]
pub fn themes_register_font_css_for_book(book_id: u64, css: String) -> Result<(), String> {
    let mut fonts = THEME_FONTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let entry = fonts.entry(book_id).or_default();
    if !entry.is_empty() {
        entry.push_str("\n");
    }
    entry.push_str(&css);
    Ok(())
}

fn guess_font_format(path: &str, mime: &str) -> &'static str {
    if path.ends_with(".woff2") || mime.contains("font/woff2") {
        return "woff2";
    }
    if path.ends_with(".woff") || mime.contains("font/woff") {
        return "woff";
    }
    if path.ends_with(".otf") || mime.contains("font/otf") {
        return "opentype";
    }
    if path.ends_with(".ttf") || mime.contains("font/ttf") || mime.contains("truetype") {
        return "truetype";
    }
    "opentype"
}

#[tauri::command]
pub fn themes_register_font_from_resource(
    book_id: u64,
    family: String,
    weight: Option<String>,
    style: Option<String>,
    id: Option<String>,
    path: Option<String>,
) -> Result<String, String> {
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    let (bytes, mime, ref_path) = match (id, path) {
        (Some(rid), _) => {
            if let Some((b, m)) = doc.get_resource(&rid) {
                (b, m, rid)
            } else {
                return Err("resource not found".to_string());
            }
        }
        (_, Some(p)) => {
            if let Some(b) = doc.get_resource_by_path(&p) {
                let guess = mime_guess::from_path(&p);
                let m = guess
                    .first_raw()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                (b, m, p)
            } else {
                return Err("resource not found".to_string());
            }
        }
        _ => return Err("id or path required".to_string()),
    };
    let data_uri = bytes_to_data_uri(&mime, &bytes);
    let fmt = guess_font_format(&ref_path, &mime);
    let css = format!(
        "@font-face {{\n  font-family: '{}';\n  src: url('{}') format('{}');\n  {}{}\n}}",
        family,
        data_uri,
        fmt,
        weight
            .as_ref()
            .map(|w| format!("font-weight: {};\n  ", w))
            .unwrap_or_default(),
        style
            .as_ref()
            .map(|s| format!("font-style: {};", s))
            .unwrap_or_default()
    );
    themes_register_font_css(css.clone())?;
    Ok(css)
}

#[tauri::command]
pub fn themes_apply(book_id: u64, name: String) -> Result<Option<String>, String> {
    let reg = THEME_REGISTRY
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let css = reg.get_css(&name);
    drop(reg);
    if css.is_some() {
        let mut act = ACTIVE_THEME
            .lock()
            .map_err(|_| "registry poisoned".to_string())?;
        act.insert(book_id, name);
    }
    Ok(css)
}

#[tauri::command]
pub fn themes_register_with_font(
    name: String,
    css: String,
    font_family: Option<String>,
    font_weight: Option<u16>,
) -> Result<(), String> {
    let mut reg = THEME_REGISTRY
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    reg.register_with_font(name, css, font_family, font_weight);
    Ok(())
}

#[tauri::command]
pub fn themes_register_global_font(
    family: String,
    src: String,
    weight: Option<u16>,
    style: Option<String>,
) -> Result<(), String> {
    use crate::epub::themes::FontFace;
    let mut reg = THEME_REGISTRY
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    reg.register_font(FontFace {
        family,
        src,
        weight,
        style,
    });
    Ok(())
}

#[tauri::command]
pub fn themes_get_font_css() -> Result<String, String> {
    let reg = THEME_REGISTRY
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    Ok(reg.get_font_css())
}

// ----------- Resources ----------

#[derive(Serialize)]
pub struct ResourceGetResponse {
    pub mime: String,
    pub data: String,
    pub mode: String,
}

#[tauri::command]
pub fn resource_get_html_with_inlined_css(book_id: u64, path: String) -> Result<String, String> {
    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:HTML_RETRIEVAL] book_id: {}, path: {}",
        book_id, path
    );

    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books.get_mut(&book_id).ok_or_else(|| {
        #[cfg(debug_assertions)]
        eprintln!("[ERROR:HTML_RETRIEVAL] book not found: {}", book_id);
        "book not found".to_string()
    })?;

    // Get the HTML content
    let html_bytes = doc.get_resource_by_path(&path).ok_or_else(|| {
        #[cfg(debug_assertions)]
        eprintln!("[ERROR:HTML_RETRIEVAL] HTML not found at path: {}", path);
        format!("HTML not found: {}", path)
    })?;
    let html_str =
        String::from_utf8(html_bytes).map_err(|_| "Invalid UTF-8 in HTML".to_string())?;

    #[cfg(debug_assertions)]
    eprintln!("[DEBUG:HTML_RETRIEVAL] HTML size: {} bytes", html_str.len());

    // Get base path for resolving relative URLs
    let base_path = std::path::Path::new(&path)
        .parent()
        .unwrap_or(std::path::Path::new(""));

    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:HTML_RETRIEVAL] Base path for CSS resolution: {}",
        base_path.display()
    );

    // Use more comprehensive regex patterns to match all variations
    use regex::Regex;
    let mut result = html_str.clone();

    // Pattern 1: <link href="..." rel="stylesheet" ...>
    // Pattern 2: <link rel="stylesheet" href="..." ...>
    // Match any <link> tag that has both rel="stylesheet" and href attributes
    let link_re = Regex::new(r#"<link[^>]*?(?:rel=["']stylesheet["'][^>]*?href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*?rel=["']stylesheet["'])[^>]*?>"#)
        .map_err(|e| e.to_string())?;

    // Collect all matches first to avoid borrow issues
    let matches: Vec<(String, String)> = link_re
        .captures_iter(&html_str)
        .filter_map(|cap| {
            let full_match = cap.get(0)?.as_str().to_string();
            let href = cap.get(1).or_else(|| cap.get(2))?.as_str();
            Some((full_match, href.to_string()))
        })
        .collect();

    #[cfg(debug_assertions)]
    eprintln!(
        "[DEBUG:HTML_RETRIEVAL] Found {} CSS link tags to process",
        matches.len()
    );

    for (link_tag, href) in matches {
        #[cfg(debug_assertions)]
        eprintln!("[DEBUG:CSS_INLINE] Processing CSS: {}", href);

        // Skip external URLs
        if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("//") {
            #[cfg(debug_assertions)]
            eprintln!("[DEBUG:CSS_INLINE] Skipping external URL: {}", href);
            continue;
        }

        // Resolve relative path
        let css_path = if href.starts_with('/') {
            href.trim_start_matches('/').to_string()
        } else {
            base_path.join(&href).to_string_lossy().to_string()
        };

        #[cfg(debug_assertions)]
        eprintln!("[DEBUG:CSS_INLINE] Resolved CSS path: {}", css_path);

        // Try to fetch CSS content
        if let Some(css_bytes) = doc.get_resource_by_path(&css_path) {
            if let Ok(css_content) = String::from_utf8(css_bytes) {
                #[cfg(debug_assertions)]
                eprintln!(
                    "[DEBUG:CSS_INLINE] Successfully inlined CSS: {} ({} bytes)",
                    href,
                    css_content.len()
                );
                // Replace link tag with inline style
                let inline_style = format!(
                    "<style>/* Inlined from {} */\n{}</style>",
                    href, css_content
                );
                result = result.replace(&link_tag, &inline_style);
            }
        } else {
            #[cfg(debug_assertions)]
            eprintln!("[DEBUG:CSS_INLINE] CSS not found at path: {}", css_path);
            // CSS not found, replace with empty style to prevent 404
            result = result.replace(&link_tag, &format!("<!-- CSS not found: {} -->", href));
        }
    }

    // Also inject a base tag to help resolve any remaining relative URLs
    // This prevents the asset://localhost/ protocol from being prepended incorrectly
    let base_url = format!("asset://localhost/{}", path);
    if let Some(head_pos) = result.find("<head>") {
        let insert_pos = head_pos + "<head>".len();
        let base_tag = format!("\n  <base href=\"{}\">", base_url);
        result.insert_str(insert_pos, &base_tag);
        #[cfg(debug_assertions)]
        eprintln!("[DEBUG:HTML_RETRIEVAL] Injected base tag: {}", base_url);
    } else if result.find("<html").is_some() {
        // If no <head>, find </html> and insert before it
        if let Some(html_end) = result.find('>') {
            let insert_pos = html_end + 1;
            let base_tag = format!("\n<head>\n  <base href=\"{}\">\n</head>", base_url);
            result.insert_str(insert_pos, &base_tag);
            #[cfg(debug_assertions)]
            eprintln!(
                "[DEBUG:HTML_RETRIEVAL] Created head tag with base: {}",
                base_url
            );
        }
    }

    // Strip XML declaration and processing instructions
    // These cause issues when using dangerouslySetInnerHTML in React
    let xml_decl_re = Regex::new(r"<\?xml[^>]*\?>").map_err(|e| e.to_string())?;
    result = xml_decl_re.replace_all(&result, "").to_string();

    // Also strip any other processing instructions
    let pi_re = Regex::new(r"<\?[^>]*\?>").map_err(|e| e.to_string())?;
    result = pi_re.replace_all(&result, "").to_string();

    // Trim any leading whitespace that might have been left
    result = result.trim_start().to_string();

    #[cfg(debug_assertions)]
    {
        eprintln!(
            "[DEBUG:HTML_RETRIEVAL] Returning HTML with {} bytes (XML declaration stripped)",
            result.len()
        );

        // Verify HTML structure
        let has_html_tag = result.contains("<html") || result.contains("<HTML");
        let has_body_tag = result.contains("<body") || result.contains("<BODY");
        let has_head_tag = result.contains("<head") || result.contains("<HEAD");
        let has_base_tag = result.contains("<base ");

        eprintln!(
            "[DEBUG:HTML_STRUCTURE] has_html: {}, has_head: {}, has_body: {}, has_base: {}",
            has_html_tag, has_head_tag, has_body_tag, has_base_tag
        );

        // Check for potential issues
        if !has_html_tag {
            eprintln!("[WARNING:HTML_STRUCTURE] Missing <html> tag - may not render correctly");
        }
        if !has_body_tag {
            eprintln!("[WARNING:HTML_STRUCTURE] Missing <body> tag - may not render correctly");
        }

        // Log first 500 chars of final HTML for verification
        let preview = result.chars().take(500).collect::<String>();
        eprintln!("[DEBUG:HTML_FINAL] First 500 chars:\n{}", preview);
    }

    Ok(result)
}

#[derive(Serialize)]
pub struct CoverGetResponse {
    pub mime: String,
    pub data: String,
}

#[tauri::command]
pub fn resource_set_strategy(
    book_id: u64,
    strategy: crate::epub::replacements::ReplacementStrategy,
) -> Result<(), String> {
    use crate::epub::resources::ResourceManager;
    let mut managers = RESOURCE_MANAGERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    managers
        .entry(book_id)
        .or_insert_with(ResourceManager::with_default)
        .set_strategy(strategy);
    Ok(())
}

#[tauri::command]
pub fn resource_register_blob(book_id: u64, path: String, blob_url: String) -> Result<(), String> {
    use crate::epub::resources::ResourceManager;
    let mut managers = RESOURCE_MANAGERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    managers
        .entry(book_id)
        .or_insert_with(ResourceManager::with_default)
        .register_blob(path, blob_url);
    Ok(())
}

#[tauri::command]
pub fn resource_get(
    book_id: u64,
    id: Option<String>,
    path: Option<String>,
    replacement: Option<String>,
) -> Result<ResourceGetResponse, String> {
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;

    // Get the resource manager for this book if it exists
    let managers = RESOURCE_MANAGERS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let manager = managers.get(&book_id);

    let mode = if manager.is_some() {
        // If manager exists, ignore the replacement param and use the manager's strategy
        None
    } else {
        replacement.and_then(|s| ReplacementMode::from_str(&s))
    };

    match (id, path) {
        (Some(rid), _) => {
            if let Some((bytes, mime)) = doc.get_resource(&rid) {
                let (data, mode_str) = if let Some(mgr) = manager {
                    let transformed = mgr.transform_resource(&rid, &mime, &bytes);
                    let mode_used = mgr.strategy.get_mode_for_mime(&mime);
                    (transformed, mode_used.as_str().to_string())
                } else {
                    match mode.unwrap_or(ReplacementMode::None) {
                        ReplacementMode::None => {
                            (general_purpose::STANDARD.encode(&bytes), "none".to_string())
                        }
                        ReplacementMode::Base64 => {
                            (bytes_to_data_uri(&mime, &bytes), "base64".to_string())
                        }
                        ReplacementMode::BlobUrl => {
                            (bytes_to_data_uri(&mime, &bytes), "base64".to_string())
                        }
                    }
                };
                Ok(ResourceGetResponse {
                    mime,
                    data,
                    mode: mode_str,
                })
            } else {
                Err("resource not found".to_string())
            }
        }
        (_, Some(p)) => {
            if let Some(bytes) = doc.get_resource_by_path(&p) {
                let guess = mime_guess::from_path(&p);
                let mime = guess
                    .first_raw()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let (data, mode_str) = if let Some(mgr) = manager {
                    let transformed = mgr.transform_resource(&p, &mime, &bytes);
                    let mode_used = mgr.strategy.get_mode_for_mime(&mime);
                    (transformed, mode_used.as_str().to_string())
                } else {
                    match mode.unwrap_or(ReplacementMode::None) {
                        ReplacementMode::None => {
                            (general_purpose::STANDARD.encode(&bytes), "none".to_string())
                        }
                        ReplacementMode::Base64 => {
                            (bytes_to_data_uri(&mime, &bytes), "base64".to_string())
                        }
                        ReplacementMode::BlobUrl => {
                            (bytes_to_data_uri(&mime, &bytes), "base64".to_string())
                        }
                    }
                };
                Ok(ResourceGetResponse {
                    mime,
                    data,
                    mode: mode_str,
                })
            } else {
                Err("resource not found".to_string())
            }
        }
        _ => Err("id or path is required".to_string()),
    }
}

#[tauri::command]
pub fn epub_get_cover(book_id: u64) -> Result<CoverGetResponse, String> {
    let mut books = BOOKS.lock().map_err(|_| "registry poisoned".to_string())?;
    let doc = books
        .get_mut(&book_id)
        .ok_or_else(|| "book not found".to_string())?;
    if let Some((bytes, mime)) = doc.get_cover() {
        Ok(CoverGetResponse {
            mime,
            data: base64::engine::general_purpose::STANDARD.encode(bytes),
        })
    } else {
        Err("cover not found".to_string())
    }
}

// ----------- CFI helpers ----------

#[tauri::command]
pub fn cfi_page_index(book_id: u64, cfi: String) -> Result<usize, String> {
    let layouts = LAYOUTS
        .lock()
        .map_err(|_| "registry poisoned".to_string())?;
    let plan = layouts
        .get(&book_id)
        .ok_or_else(|| "layout not computed".to_string())?;
    cfi_to_page_index(plan, &cfi).ok_or_else(|| "cfi not mappable".to_string())
}

#[tauri::command]
pub fn offsets_to_cfi(
    _book_id: u64,
    spine_index: usize,
    char_offset: usize,
) -> Result<String, String> {
    Ok(offset_to_cfi(spine_index, char_offset))
}
