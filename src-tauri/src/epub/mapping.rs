use crate::epub::cfi::{format_cfi, try_parse_cfi_to_offset, CFIComponent, CFIStep, CFI};
use crate::epub::layout::LayoutPlan;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Viewport {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointToCFIRequest {
    pub spine_index: usize,
    pub x: f32,
    pub y: f32,
    pub viewport: Viewport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointToCFIResponse {
    pub cfi: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectF32 {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRect {
    pub page_index: usize,
    pub rects: Vec<RectF32>,
}

fn find_page_index_for_point(
    layout: &LayoutPlan,
    spine_index: usize,
    y: f32,
    viewport: &Viewport,
) -> Option<usize> {
    // Assume vertical pagination, page height == viewport.height
    if viewport.height <= 0.0 {
        return None;
    }
    let page_in_spine = (y / viewport.height).floor().max(0.0) as usize;
    let mut count_before = 0usize;
    for (idx, &count) in layout.pages_per_spine.iter().enumerate() {
        if idx == spine_index {
            break;
        }
        count_before += count;
    }
    let global_idx = count_before + page_in_spine;
    if global_idx < layout.pages.len() {
        Some(global_idx)
    } else {
        None
    }
}

pub fn map_point_to_cfi(
    layout: &LayoutPlan,
    req: &PointToCFIRequest,
) -> Option<PointToCFIResponse> {
    let page_index = find_page_index_for_point(layout, req.spine_index, req.y, &req.viewport)?;
    let page = &layout.pages[page_index];
    // proportional offset inside page by x,y; use y proportion for sequential text
    let page_height = req.viewport.height.max(1.0);
    let rel_y = (req.y % page_height) / page_height;
    let page_char_span = page.end_char.saturating_sub(page.start_char).max(1);
    let within = (rel_y * page_char_span as f32).floor() as usize;
    let char_offset = page.start_char + within;

    // Build a simplified CFI that encodes spine index in the path and char offset as terminal
    let spine_path = CFIComponent {
        steps: vec![CFIStep {
            index: req.spine_index as i32,
            id: None,
        }],
        terminal_offset: Some(char_offset as i32),
    };
    let cfi = CFI {
        spine_path,
        content_path: None,
    };
    Some(PointToCFIResponse {
        cfi: format_cfi(&cfi),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CFIRangeRectsRequest {
    pub start_spine_index: usize,
    pub start_char_offset: usize,
    pub end_spine_index: usize,
    pub end_char_offset: usize,
    pub viewport: Viewport,
}

pub fn map_range_to_rects(layout: &LayoutPlan, req: &CFIRangeRectsRequest) -> Vec<PageRect> {
    // generate normalized rects by intersecting range with page char spans
    let mut out: Vec<PageRect> = Vec::new();
    for page in &layout.pages {
        if page.spine_index < req.start_spine_index || page.spine_index > req.end_spine_index {
            continue;
        }
        // resolve range bounds for this page
        let page_len = page.end_char.saturating_sub(page.start_char);
        if layout.is_fixed_layout || page_len == 0 {
            // For fixed-layout (or unknown text spans), return full-page rect
            out.push(PageRect {
                page_index: page.global_index,
                rects: vec![RectF32 {
                    x: 0.0,
                    y: 0.0,
                    width: 1.0,
                    height: 1.0,
                }],
            });
            continue;
        }
        let page_len = page_len.max(1);
        let start_char = if page.spine_index == req.start_spine_index {
            req.start_char_offset
        } else {
            page.start_char
        };
        let end_char = if page.spine_index == req.end_spine_index {
            req.end_char_offset
        } else {
            page.end_char
        };
        if end_char <= page.start_char || start_char >= page.end_char {
            continue;
        }
        let clamped_start = start_char.max(page.start_char);
        let clamped_end = end_char.min(page.end_char);
        if clamped_end <= clamped_start {
            continue;
        }

        // convert char segment to vertical rect in page: y from 0..1
        let start_y = (clamped_start - page.start_char) as f32 / page_len as f32;
        let end_y = (clamped_end - page.start_char) as f32 / page_len as f32;
        let rect = RectF32 {
            x: 0.0,
            y: start_y,
            width: 1.0,
            height: (end_y - start_y).max(0.002),
        };
        out.push(PageRect {
            page_index: page.global_index,
            rects: vec![rect],
        });
    }
    out
}

pub fn offset_to_cfi(spine_index: usize, char_offset: usize) -> String {
    let spine_path = CFIComponent {
        steps: vec![CFIStep {
            index: spine_index as i32,
            id: None,
        }],
        terminal_offset: Some(char_offset as i32),
    };
    let cfi = CFI {
        spine_path,
        content_path: None,
    };
    format_cfi(&cfi)
}

pub fn cfi_to_page_index(layout: &LayoutPlan, cfi: &str) -> Option<usize> {
    let (spine_index, char_offset) = try_parse_cfi_to_offset(cfi)?;
    // sum pages before this spine
    let mut count_before = 0usize;
    for (idx, &count) in layout.pages_per_spine.iter().enumerate() {
        if idx == spine_index {
            break;
        }
        count_before += count;
    }
    // find local page containing this offset
    let pages_in_spine = layout
        .pages_per_spine
        .get(spine_index)
        .cloned()
        .unwrap_or(0);
    for p in layout.pages.iter().skip(count_before).take(
        layout
            .pages_per_spine
            .get(spine_index)
            .cloned()
            .unwrap_or(0),
    ) {
        if layout.is_fixed_layout {
            if p.spine_index == spine_index {
                return Some(p.global_index);
            }
        } else if p.spine_index == spine_index
            && char_offset >= p.start_char
            && char_offset < p.end_char
        {
            return Some(p.global_index);
        }
    }
    // Fallback for fixed layout: if no exact match but pages exist for the spine, return first page in spine
    if layout.is_fixed_layout && pages_in_spine > 0 {
        return layout
            .pages
            .iter()
            .skip(count_before)
            .next()
            .map(|p| p.global_index);
    }
    None
}
