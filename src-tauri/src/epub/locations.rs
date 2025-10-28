use crate::epub::docs::EpubDoc;
use serde::Serialize;
use std::fs::File;
use std::io::BufReader;

#[derive(Debug, Clone, Serialize)]
pub struct LocationPoint {
    pub spine_index: usize,
    pub char_offset: usize,
    pub progress_in_spine: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocationsResult {
    pub total: usize,
    pub by_spine: Vec<usize>,
    pub locations: Vec<LocationPoint>,
}

fn strip_tags(mut s: String) -> String {
    // naive tag stripper: removes anything between '<' and '>'
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

pub fn compute_locations(
    doc: &mut EpubDoc<BufReader<File>>,
    chars_per_location: usize,
) -> LocationsResult {
    let mut total = 0usize;
    let mut by_spine: Vec<usize> = Vec::with_capacity(doc.spine.len());
    let mut locations: Vec<LocationPoint> = Vec::new();

    // Avoid aliasing: collect idrefs first, then fetch content mutably
    let spine_ids: Vec<(usize, String)> = doc
        .spine
        .iter()
        .enumerate()
        .map(|(i, it)| (i, it.idref.clone()))
        .collect();

    for (spine_index, idref) in spine_ids.into_iter() {
        if let Some((content, mime)) = doc.get_resource_str(&idref) {
            // only attempt on XHTML/HTML
            if !mime.contains("html") {
                by_spine.push(0);
                continue;
            }
            let text = strip_tags(content);
            let len = text.chars().count();
            if len == 0 || chars_per_location == 0 {
                by_spine.push(0);
                continue;
            }
            let mut count = 0usize;
            let mut offset = 0usize;
            let mut acc = 0usize;
            for (i, _ch) in text.chars().enumerate() {
                acc += 1;
                if acc >= chars_per_location {
                    let progress = (i as f32 + 1.0) / (len as f32);
                    locations.push(LocationPoint {
                        spine_index,
                        char_offset: offset + acc,
                        progress_in_spine: progress,
                    });
                    count += 1;
                    offset += acc;
                    acc = 0;
                }
            }
            by_spine.push(count);
            total += count;
        } else {
            by_spine.push(0);
        }
    }

    LocationsResult {
        total,
        by_spine,
        locations,
    }
}
