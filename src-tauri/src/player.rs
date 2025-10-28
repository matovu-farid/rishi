use crate::epub::docs::EpubDoc;
use crate::epub::layout::LayoutPlan;
use crate::epub::mapping::offset_to_cfi;
use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::sync::Mutex;
use tauri::Emitter;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum PlayingState {
    Playing,
    Paused,
    Stopped,
}

#[derive(Debug, Clone)]
pub struct PlayerCore {
    pub book_id: u64,
    pub current_page_index: usize,
    pub current_paragraph_index: usize,
    pub state: PlayingState,
}

pub static PLAYERS: Lazy<Mutex<HashMap<u64, PlayerCore>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

impl PlayerCore {
    pub fn new(book_id: u64) -> Self {
        Self {
            book_id,
            current_page_index: 0,
            current_paragraph_index: 0,
            state: PlayingState::Stopped,
        }
    }
}

#[derive(Serialize, Clone)]
pub struct PlayerParagraphEvent {
    pub book_id: u64,
    pub page_index: usize,
    pub paragraph_index: usize,
    pub text: String,
    pub cfi_range: String,
}

#[derive(Serialize, Clone)]
pub struct ParagraphResp {
    pub text: String,
    pub cfi_range: String,
}

pub(crate) fn paragraphs_for_page_internal(
    doc: &mut EpubDoc<BufReader<File>>,
    plan: &LayoutPlan,
    page_index: usize,
) -> Vec<ParagraphResp> {
    // Use internal helper from commands module is private; duplicate minimal logic here if needed.
    // For simplicity, call the same paragraphs_current command through shared function would be ideal.
    // Here we rebuild quickly using mapping and docs helpers.
    let p = match plan.pages.get(page_index) {
        Some(p) => p,
        None => return vec![],
    };
    let idref = match doc.spine.get(p.spine_index) {
        Some(s) => s.idref.clone(),
        None => return vec![],
    };
    let Some((content, mime)) = doc.get_resource_str(&idref) else {
        return vec![];
    };
    if !mime.contains("html") {
        return vec![];
    }
    // naive paragraph split (same as in commands)
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
    let parts: Vec<String> = out
        .split('\n')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    let mut res = Vec::new();
    let mut cum = 0usize;
    for part in parts {
        let len = part.chars().count();
        let start = cum;
        let end = cum + len;
        cum = end + 1;
        if end <= p.start_char || start >= p.end_char {
            continue;
        }
        let s_off = start.max(p.start_char);
        let e_off = end.min(p.end_char);
        let s_cfi = offset_to_cfi(p.spine_index, s_off);
        let e_cfi = offset_to_cfi(p.spine_index, e_off);
        let cfi_range = format!(
            "epubcfi(range({},{}))",
            s_cfi.trim_start_matches("epubcfi(").trim_end_matches(")"),
            e_cfi.trim_start_matches("epubcfi(").trim_end_matches(")")
        );
        res.push(ParagraphResp {
            text: part,
            cfi_range,
        });
    }
    res
}

pub fn player_emit_paragraph(app: &tauri::AppHandle, payload: PlayerParagraphEvent) {
    let _ = app.emit("player://play", payload);
}
