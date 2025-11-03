use pdf::enc::StreamFilter;
use pdf::object::*;

use std::path::Path;

use pdf::{
    content::{Op, TextDrawAdjusted},
    file::FileOptions,
    object::Resolve,
};

use crate::shared::types::{BookData, BookKind};

pub fn get_bookData(filePath: &Path) -> Result<BookData, Box<dyn std::error::Error>> {
    let path = std::path::Path::new(filePath);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()).into());
    }

    // Open PDF with lazy loading using pdf crate
    let file = &FileOptions::cached().open(path)?;
    let dict = file
        .trailer
        .info_dict
        .as_ref()
        .ok_or("PDF file missing info dictionary")?;
    println!("{:#?}", dict);
    let title = dict
        .title
        .as_ref()
        .map(|s| s.to_string().unwrap_or_default());
    let author = dict
        .author
        .as_ref()
        .map(|s| s.to_string().unwrap_or_default());
    let publisher = dict
        .creator
        .as_ref()
        .map(|s| s.to_string().unwrap_or_default());
    let cover = get_cover(filePath)?;
    let pdfPath = filePath.to_str().unwrap_or_default().to_string();
    let digest = md5::compute(filePath.to_string_lossy().to_string());
    let id = format!("{:x}", digest);
    let kind = BookKind::Pdf.to_string();
    let current_location = "".to_string();

    Ok(BookData::new(
        id,
        kind,
        cover,
        title,
        author,
        publisher,
        pdfPath,
        current_location,
    ))
}

pub fn get_paragraphs(
    filePath: &Path,
    pageNumber: u32,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let path = std::path::Path::new(filePath);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()).into());
    }

    // Open PDF with lazy loading using pdf crate
    let file = FileOptions::cached().open(path)?;
    let resolver = file.resolver();

    // Get first page
    let page = file.get_page(pageNumber)?;

    // Get text from first page
    let content = page.contents.as_ref().ok_or("No content found")?;
    let ops = content.operations(&resolver)?;

    // Paragraph array to collect results
    let mut paragraphs: Vec<String> = Vec::new();
    let mut current_paragraph = String::new();

    // Track position to detect paragraph breaks
    let mut last_y_position: Option<f32> = None;
    let mut current_y_position: Option<f32> = None;

    // Extract and print actual text content
    for op in ops {
        // Update position tracking for formatting
        match op {
            Op::SetTextMatrix { matrix } => {
                // Check if we moved to a significantly different Y position (new line or paragraph)
                if let Some(last_y) = last_y_position {
                    let y_delta = matrix.f - last_y;
                    // If we moved down by more than 1 unit, it's likely a new line
                    if y_delta < -1.0 {
                        // Check if it's a paragraph break (more than 1.5x the normal line spacing)
                        if y_delta < -15.0 {
                            // Paragraph break: finalize current paragraph and start a new one
                            if !current_paragraph.trim().is_empty() {
                                paragraphs.push(current_paragraph.trim().to_string());
                                current_paragraph = String::new();
                            }
                        } else {
                            // Regular line break within paragraph: add space
                            if !current_paragraph.is_empty() && !current_paragraph.ends_with(' ') {
                                current_paragraph.push(' ');
                            }
                        }
                    }
                }
                current_y_position = Some(matrix.f);
            }
            Op::MoveTextPosition { translation } => {
                // Moving position without text usually indicates a new line
                if translation.y < -1.0 {
                    if translation.y < -15.0 {
                        // Paragraph break
                        if !current_paragraph.trim().is_empty() {
                            paragraphs.push(current_paragraph.trim().to_string());
                            current_paragraph = String::new();
                        }
                    } else {
                        // Regular line break within paragraph: add space
                        if !current_paragraph.is_empty() && !current_paragraph.ends_with(' ') {
                            current_paragraph.push(' ');
                        }
                    }
                }
                current_y_position = Some(current_y_position.unwrap_or(0.0) + translation.y);
            }
            Op::TextNewline => {
                // Regular line break within paragraph: add space
                if !current_paragraph.is_empty() && !current_paragraph.ends_with(' ') {
                    current_paragraph.push(' ');
                }
                if let Some(curr_y) = current_y_position {
                    last_y_position = Some(curr_y);
                }
            }
            Op::BeginText => {
                // Check if we moved to a new Y position and need formatting
                if let Some(curr_y) = current_y_position {
                    if let Some(last_y) = last_y_position {
                        let y_delta = curr_y - last_y;
                        if y_delta < -1.0 {
                            if y_delta < -15.0 {
                                // Paragraph break
                                if !current_paragraph.trim().is_empty() {
                                    paragraphs.push(current_paragraph.trim().to_string());
                                    current_paragraph = String::new();
                                }
                            } else {
                                // Regular line break within paragraph: add space
                                if !current_paragraph.is_empty()
                                    && !current_paragraph.ends_with(' ')
                                {
                                    current_paragraph.push(' ');
                                }
                            }
                        }
                    }
                }
            }
            Op::TextDraw { text } => {
                // Simple text drawing operation
                let text_content = text.to_string_lossy();
                current_paragraph.push_str(&text_content);
                if let Some(curr_y) = current_y_position {
                    last_y_position = Some(curr_y);
                }
            }
            Op::TextDrawAdjusted { array } => {
                // Text with spacing adjustments
                for item in array {
                    match item {
                        TextDrawAdjusted::Text(text) => {
                            current_paragraph.push_str(&text.to_string_lossy());
                        }
                        TextDrawAdjusted::Spacing(spacing) => {
                            // Handle spacing adjustments
                            if spacing < -50.0 {
                                // Large negative spacing might indicate word break
                                if !current_paragraph.is_empty()
                                    && !current_paragraph.ends_with(' ')
                                {
                                    current_paragraph.push(' ');
                                }
                            }
                        }
                    }
                }
                if let Some(curr_y) = current_y_position {
                    last_y_position = Some(curr_y);
                }
            }
            _ => {
                // Ignore other operations (drawing commands, etc.)
            }
        }
    }

    // Push the last paragraph if it's not empty
    if !current_paragraph.trim().is_empty() {
        paragraphs.push(current_paragraph.trim().to_string());
    }

    Ok(paragraphs)
}

pub fn get_cover(file_path: &Path) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let path = std::path::Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()).into());
    }

    // Open PDF with lazy loading using pdf crate
    let file = FileOptions::cached().open(path)?;

    // Get first page
    let page = file.get_page(0)?;

    // Get resources from first page
    let resources = page.resources()?;

    let resolver = file.resolver();

    // Extract first image from XObjects
    let images: Vec<_> = resources
        .xobjects
        .iter()
        .filter_map(|(_name, &r)| resolver.get(r).ok())
        .filter(|o| matches!(**o, XObject::Image(_)))
        .collect();

    if images.is_empty() {
        return Err("No images found on first page".into());
    }

    // Process first image
    let xobject = &images[0];
    let img = match **xobject {
        XObject::Image(ref im) => im,
        _ => return Err("Internal error: not an image".into()),
    };

    // Extract image data with filter info
    let (data, filter) = img.raw_image_data(&resolver)?;

    // Get image dimensions
    let width = img.width as usize;
    let height = img.height as usize;

    // Handle different filter types
    let final_data = match filter {
        Some(StreamFilter::DCTDecode(_)) => {
            // JPEG data is already ready
            data.to_vec()
        }
        Some(StreamFilter::FlateDecode(_)) => {
            // Need to decompress FlateDecode
            use flate2::read::ZlibDecoder;
            use std::io::Read;

            let mut decoder = ZlibDecoder::new(&*data);
            let mut decompressed = Vec::new();
            decoder.read_to_end(&mut decompressed)?;

            // Apply predictor if needed (PNG predictor 15)
            let predicted_data = apply_png_predictor(decompressed, width, height, 3)?;
            predicted_data
        }
        _ => {
            // For other filters, try to save as-is
            data.to_vec()
        }
    };

    Ok(final_data)
}

fn apply_png_predictor(
    data: Vec<u8>,
    width: usize,
    height: usize,
    bytes_per_pixel: usize,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut output = Vec::with_capacity(data.len());

    for row in 0..height {
        let row_start = row * (width * bytes_per_pixel + 1);
        if row_start >= data.len() {
            break;
        }

        let predictor = data[row_start];
        let row_data = &data[row_start + 1..];

        if row == 0 {
            // First row: No previous row to reference
            if let Some(end) = row_data.get(..width * bytes_per_pixel) {
                output.extend_from_slice(end);
            }
        } else {
            // Subsequent rows: Apply predictor
            let prev_row_start = (row - 1) * width * bytes_per_pixel;
            let prev_row: Vec<u8> = output[prev_row_start..].to_vec();

            for col in 0..width * bytes_per_pixel {
                if col >= row_data.len() {
                    break;
                }

                match predictor {
                    15 => {
                        // PNG predictor (Paeth)
                        let left = if col >= bytes_per_pixel {
                            row_data[col - bytes_per_pixel]
                        } else {
                            0
                        };
                        let up = prev_row.get(col).copied().unwrap_or(0);
                        let prev = left.wrapping_add(up).wrapping_sub(
                            prev_row
                                .get(col.saturating_sub(bytes_per_pixel))
                                .copied()
                                .unwrap_or(0),
                        );
                        output.push(row_data[col].wrapping_add(prev));
                    }
                    _ => {
                        // Unknown predictor, just copy
                        output.push(row_data[col]);
                    }
                }
            }
        }
    }

    Ok(output)
}
