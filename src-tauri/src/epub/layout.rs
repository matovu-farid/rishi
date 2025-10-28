use crate::epub::docs::EpubDoc;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;

// Strip HTML tags to get plain text (used for validation only)
fn strip_tags(mut s: String) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.drain(..) {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlowMode {
    Paginated,
    Scrolled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpreadMode {
    Auto,
    None,
    Always,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutOptions {
    pub viewport_width: f32,
    pub viewport_height: f32,
    pub flow: FlowMode,
    pub spread: SpreadMode,
    pub avg_char_width: Option<f32>,
    pub line_height: Option<f32>,
    pub column_gap: Option<f32>,
    pub min_spread_width: Option<f32>,
}

impl Default for LayoutOptions {
    fn default() -> Self {
        Self {
            viewport_width: 1024.0,
            viewport_height: 768.0,
            flow: FlowMode::Paginated,
            spread: SpreadMode::Auto,
            avg_char_width: Some(8.0),
            line_height: Some(20.0),
            column_gap: Some(32.0),
            min_spread_width: Some(900.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRef {
    pub global_index: usize,
    pub spine_index: usize,
    pub start_char: usize,
    pub end_char: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutPlan {
    pub pages: Vec<PageRef>,
    pub pages_per_spine: Vec<usize>,
    pub total_pages: usize,
    pub spreads: Vec<SpreadEntry>,
    pub spread_mode: SpreadMode,
    pub reading_direction: Option<String>,
    pub is_fixed_layout: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadEntry {
    pub left: Option<usize>,
    pub right: Option<usize>,
}

/// Compute layout plan for the EPUB
///
/// This function creates a layout plan that maps spine items (chapters/sections) to "page references".
/// Unlike character-based pagination, this approach matches epub.js behavior:
/// - Each spine item gets ONE PageRef (representing the section)
/// - The frontend applies CSS columns to create actual visual pages
/// - Page counts are determined dynamically by the browser after rendering
///
/// This approach is superior because:
/// 1. The browser handles text layout (fonts, line-height, etc.)
/// 2. CSS columns create accurate pagination
/// 3. Responsive to viewport changes
/// 4. Matches how epub.js works
pub fn compute_layout(doc: &mut EpubDoc<BufReader<File>>, opts: &LayoutOptions) -> LayoutPlan {
    // Determine if fixed-layout
    let is_fixed_layout = doc
        .rendition_layout
        .as_ref()
        .map(|s| s.eq_ignore_ascii_case("pre-paginated"))
        .unwrap_or(false);

    let min_spread_width = opts.min_spread_width.unwrap_or(900.0);
    let spread_mode = match opts.spread {
        SpreadMode::None => SpreadMode::None,
        SpreadMode::Always => SpreadMode::Always,
        SpreadMode::Auto => {
            if opts.viewport_width >= min_spread_width {
                SpreadMode::Always
            } else {
                SpreadMode::None
            }
        }
    };

    // Create one "section reference" per spine item
    // The frontend will measure actual pages after rendering with CSS columns
    let mut pages: Vec<PageRef> = Vec::new();
    let mut pages_per_spine: Vec<usize> = Vec::with_capacity(doc.spine.len());
    let mut global_index = 0usize;

    let spine_ids: Vec<(usize, String)> = doc
        .spine
        .iter()
        .enumerate()
        .map(|(i, it)| (i, it.idref.clone()))
        .collect();

    for (spine_index, idref) in spine_ids.into_iter() {
        // Check if this spine item has content
        if let Some((content, mime)) = doc.get_resource_str(&idref) {
            if !mime.contains("html") {
                pages_per_spine.push(0);
                continue;
            }
            let text = strip_tags(content);
            let len = text.chars().count();
            if len == 0 {
                pages_per_spine.push(0);
                continue;
            }

            // Create ONE page reference per spine item
            // The frontend will determine actual page count dynamically
            pages.push(PageRef {
                global_index,
                spine_index,
                start_char: 0,
                end_char: len, // Store full content length for reference
            });
            global_index += 1;
            pages_per_spine.push(1); // One "section" per spine item
        } else {
            pages_per_spine.push(0);
        }
    }

    // Build spreads
    let mut spreads: Vec<SpreadEntry> = Vec::new();
    match spread_mode {
        SpreadMode::Always => {
            let mut i = 0usize;
            while i < global_index {
                let left = Some(i);
                let right = if i + 1 < global_index {
                    Some(i + 1)
                } else {
                    None
                };
                spreads.push(SpreadEntry { left, right });
                i += 2;
            }
        }
        _ => {
            for i in 0..global_index {
                spreads.push(SpreadEntry {
                    left: None,
                    right: Some(i),
                });
            }
        }
    }

    LayoutPlan {
        total_pages: global_index,
        pages,
        pages_per_spine,
        spreads,
        spread_mode,
        reading_direction: doc.page_progression_direction.clone(),
        is_fixed_layout,
    }
}
