use pdf::enc::StreamFilter;
use pdf::object::*;

use std::path::Path;

use crate::shared::types::{BookData, BookKind};
use pdf::{
    content::{Op, TextDrawAdjusted},
    file::FileOptions,
    object::Resolve,
};
use serde_json::json;
use tauri_plugin_store::StoreExt;

pub fn store_book_data(
    app: tauri::AppHandle,
    book_data: &BookData,
) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.store("store.json")?;
    match store.get("books") {
        Some(value) => {
            let mut current_books: Vec<BookData> = serde_json::from_value(value.clone())?;
            current_books.push(book_data.clone());
            let books_value = serde_json::to_value(current_books)?;
            store.set("books", json!(books_value));
            store.save()?;
        }
        None => {
            // No existing books, create new array
            let current_books = vec![book_data.clone()];
            let books_value = serde_json::to_value(current_books)?;
            store.set("books", json!(books_value));
            store.save()?;
        }
    }
    Ok(())
}

pub fn get_bookData(filePath: &Path) -> Result<BookData, Box<dyn std::error::Error>> {
    let path = std::path::Path::new(filePath);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()).into());
    }

    // Open PDF with lazy loading using pdf crate
    let file = &FileOptions::cached().open(path)?;

    // Info dictionary is optional in PDFs - extract metadata if available
    let title = file
        .trailer
        .info_dict
        .as_ref()
        .and_then(|dict| dict.title.as_ref())
        .and_then(|s| s.to_string().ok());
    let author = file
        .trailer
        .info_dict
        .as_ref()
        .and_then(|dict| dict.author.as_ref())
        .and_then(|s| s.to_string().ok());
    let publisher = file
        .trailer
        .info_dict
        .as_ref()
        .and_then(|dict| dict.creator.as_ref())
        .and_then(|s| s.to_string().ok());
    let cover = get_cover(filePath)?;
    let pdf_path = filePath.to_str().unwrap_or_default().to_string();
    let digest = md5::compute(filePath.to_string_lossy().to_string());
    let id = format!("{:x}", digest);
    let kind = BookKind::Pdf.to_string();
    let current_location = "".to_string();
    let cover_kind = Some(get_kind(&cover));

    match cover {
        Cover::Fallback(cover) => Ok(BookData::new(
            id,
            kind,
            cover,
            title,
            author,
            publisher,
            pdf_path,
            current_location,
            cover_kind,
        )),
        Cover::Normal(cover) => Ok(BookData::new(
            id,
            kind,
            cover,
            title,
            author,
            publisher,
            pdf_path,
            current_location,
            cover_kind,
        )),
    }
}

fn get_kind(cover: &Cover) -> String {
    match cover {
        Cover::Normal(_) => "normal".to_string(),
        Cover::Fallback(_) => "fallback".to_string(),
    }
}

pub fn get_paragraphs(
    file_path: &Path,
    page_number: u32,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let path = std::path::Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()).into());
    }

    // Open PDF with lazy loading using pdf crate
    let file = FileOptions::cached().open(path)?;
    let resolver = file.resolver();

    // Get first page
    let page = file.get_page(page_number)?;

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

pub enum Cover {
    Normal(Vec<u8>),
    Fallback(Vec<u8>),
}
pub fn get_cover(file_path: &Path) -> Result<Cover, Box<dyn std::error::Error>> {
    let path = std::path::Path::new(file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()).into());
    }

    eprintln!("Extracting cover for PDF: {:?}", path);

    // Open PDF with lazy loading using pdf crate
    let file = FileOptions::cached().open(path)?;
    let resolver = file.resolver();

    // Strategy 1: Try finding images on the first few pages
    let num_pages = file.num_pages();
    let max_pages_to_check = num_pages.min(3); // Check up to first 3 pages
    eprintln!(
        "PDF has {} pages, checking first {} pages for images",
        num_pages, max_pages_to_check
    );

    for page_num in 0..max_pages_to_check {
        let Ok(page) = file.get_page(page_num) else {
            continue;
        };
        let Ok(resources) = page.resources() else {
            continue;
        };

        let images: Vec<_> = resources
            .xobjects
            .iter()
            .filter_map(|(_name, &r)| resolver.get(r).ok())
            .filter(|o| matches!(**o, XObject::Image(_)))
            .collect();

        eprintln!("Page {} has {} images", page_num, images.len());

        // Try all images on this page, prioritizing JPEG images
        let mut best_image: Option<Vec<u8>> = None;
        let mut best_image_info = String::new();

        for (img_index, image) in images.iter().enumerate() {
            eprintln!("Processing image {} on page {}", img_index, page_num);
            match process_image(image, &resolver) {
                Ok(image_data) => {
                    // Validate that we got actual image data
                    if image_data.len() > 100 {
                        let is_jpeg =
                            image_data.len() >= 2 && image_data[0] == 0xFF && image_data[1] == 0xD8;
                        let is_png = image_data.len() >= 8
                            && image_data[0] == 0x89
                            && image_data[1] == 0x50
                            && image_data[2] == 0x4E
                            && image_data[3] == 0x47;

                        let format = if is_jpeg {
                            "JPEG"
                        } else if is_png {
                            "PNG"
                        } else {
                            "Unknown"
                        };

                        eprintln!(
                            "Successfully extracted {} image {} from page {} ({} bytes)",
                            format,
                            img_index,
                            page_num,
                            image_data.len()
                        );

                        // Prioritize JPEG images, but accept any valid image
                        if is_jpeg {
                            // JPEG found - return immediately as it's preferred
                            return Ok(Cover::Normal(image_data));
                        } else if best_image.is_none() {
                            // Store the first valid image as backup
                            best_image = Some(image_data);
                            best_image_info =
                                format!("{} image {} from page {}", format, img_index, page_num);
                        }
                    } else {
                        eprintln!(
                            "Image {} on page {} too small ({} bytes), trying next",
                            img_index,
                            page_num,
                            image_data.len()
                        );
                    }
                }
                Err(e) => {
                    eprintln!(
                        "Failed to process image {} on page {}: {}",
                        img_index, page_num, e
                    );
                }
            }
        }

        // If we found a valid non-JPEG image, use it
        if let Some(image_data) = best_image {
            eprintln!("Using best available image: {}", best_image_info);
            return Ok(Cover::Normal(image_data));
        }
    }

    create_placeholder_cover()
}

fn process_image(
    xobject: &XObject,
    resolver: &impl Resolve,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let XObject::Image(ref img) = xobject else {
        return Err("Internal error: not an image".into());
    };

    // Extract image data with filter info
    let (data, filter) = match img.raw_image_data(resolver) {
        Ok(result) => result,
        Err(e) => {
            eprintln!("Failed to extract raw image data: {}", e);
            return Err(e.into());
        }
    };

    // Get image dimensions and validate them
    let width = img.width as usize;
    let height = img.height as usize;

    if width == 0 || height == 0 || width > 10000 || height > 10000 {
        return Err("Invalid image dimensions".into());
    }

    // Handle different filter types and convert to standard format
    eprintln!("Image filter type: {:?}", filter);
    let final_data = match filter {
        Some(StreamFilter::DCTDecode(_)) => {
            // JPEG data is already ready
            let jpeg_data = data.to_vec();
            if jpeg_data.len() < 100 {
                return Err("JPEG data too small".into());
            }

            // Validate JPEG header
            if jpeg_data.len() >= 2 && jpeg_data[0] == 0xFF && jpeg_data[1] == 0xD8 {
                // Valid JPEG header, return as-is
                eprintln!("Valid JPEG data found ({} bytes)", jpeg_data.len());
                jpeg_data
            } else {
                // Not a valid JPEG, try to convert as raw data
                eprintln!(
                    "Invalid JPEG header, converting as raw data ({} bytes)",
                    jpeg_data.len()
                );
                convert_raw_to_png(jpeg_data, width, height)?
            }
        }
        Some(StreamFilter::FlateDecode(_)) => {
            // Need to decompress FlateDecode and convert to PNG
            use flate2::read::ZlibDecoder;
            use std::io::Read;

            let mut decoder = ZlibDecoder::new(&*data);
            let mut decompressed = Vec::new();
            match decoder.read_to_end(&mut decompressed) {
                Ok(_) => {
                    if decompressed.is_empty() {
                        return Err("Decompressed data is empty".into());
                    }
                    // Apply predictor if needed (PNG predictor 15)
                    let predicted_data = match apply_png_predictor(decompressed, width, height, 3) {
                        Ok(data) => data,
                        Err(e) => {
                            eprintln!("Failed to apply PNG predictor: {}", e);
                            return Err(e);
                        }
                    };

                    // Convert raw RGB data to PNG format
                    convert_raw_to_png(predicted_data, width, height)?
                }
                Err(e) => {
                    eprintln!("Failed to decompress FlateDecode data: {}", e);
                    return Err(e.into());
                }
            }
        }
        _ => {
            // For other filters, try to convert raw data to PNG
            let raw_data = data.to_vec();
            if raw_data.len() < 100 {
                return Err("Raw image data too small".into());
            }

            // Try to convert raw data to PNG
            convert_raw_to_png(raw_data, width, height)?
        }
    };

    // Final validation
    if final_data.len() < 100 {
        return Err("Final image data too small".into());
    }

    Ok(final_data)
}

fn convert_raw_to_png(
    raw_data: Vec<u8>,
    width: usize,
    height: usize,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    use image::{ImageBuffer, ImageFormat, Rgb};
    use std::io::Cursor;

    eprintln!(
        "Converting raw data to PNG: {} bytes, {}x{}",
        raw_data.len(),
        width,
        height
    );

    // Try to interpret the raw data as RGB
    let bytes_per_pixel = if raw_data.len() == width * height * 3 {
        3 // RGB
    } else if raw_data.len() == width * height * 4 {
        4 // RGBA
    } else if raw_data.len() == width * height {
        1 // Grayscale
    } else {
        // Data size doesn't match expected dimensions, but let's try anyway
        eprintln!(
            "Warning: Data size {} doesn't match expected dimensions {}x{}",
            raw_data.len(),
            width,
            height
        );

        // Try to guess the format based on data size
        let expected_rgb = width * height * 3;
        let expected_rgba = width * height * 4;
        let expected_gray = width * height;

        if raw_data.len() >= expected_rgba {
            4 // Assume RGBA
        } else if raw_data.len() >= expected_rgb {
            3 // Assume RGB
        } else if raw_data.len() >= expected_gray {
            1 // Assume Grayscale
        } else {
            return Err(format!(
                "Raw data size {} is too small for {}x{} image",
                raw_data.len(),
                width,
                height
            )
            .into());
        }
    };

    eprintln!("Detected {} bytes per pixel", bytes_per_pixel);

    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);

    let result = match bytes_per_pixel {
        3 => {
            // RGB data
            let img_buffer =
                ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(width as u32, height as u32, raw_data)
                    .ok_or("Failed to create RGB image buffer")?;
            image::DynamicImage::ImageRgb8(img_buffer).write_to(&mut cursor, ImageFormat::Png)
        }
        4 => {
            // RGBA data
            use image::Rgba;
            let img_buffer =
                ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width as u32, height as u32, raw_data)
                    .ok_or("Failed to create RGBA image buffer")?;
            image::DynamicImage::ImageRgba8(img_buffer).write_to(&mut cursor, ImageFormat::Png)
        }
        1 => {
            // Grayscale data
            use image::Luma;
            let img_buffer =
                ImageBuffer::<Luma<u8>, Vec<u8>>::from_raw(width as u32, height as u32, raw_data)
                    .ok_or("Failed to create grayscale image buffer")?;
            image::DynamicImage::ImageLuma8(img_buffer).write_to(&mut cursor, ImageFormat::Png)
        }
        _ => return Err("Unsupported pixel format".into()),
    };

    match result {
        Ok(_) => {
            eprintln!("Successfully converted to PNG ({} bytes)", png_bytes.len());
            Ok(png_bytes)
        }
        Err(e) => {
            eprintln!("Failed to convert to PNG: {}", e);
            Err(e.into())
        }
    }
}
fn create_placeholder_cover() -> Result<Cover, Box<dyn std::error::Error>> {
    use image::{ImageFormat, Rgba, RgbaImage};
    use std::io::Cursor;

    // Create a book-like placeholder cover (400x600 - typical book aspect ratio)
    let width = 400u32;
    let height = 600u32;

    // Create a more book-like background with a subtle pattern
    let mut img = RgbaImage::new(width, height);

    for (x, y, pixel) in img.enumerate_pixels_mut() {
        // Create a subtle book-like texture
        let gradient_y = (y as f32 / height as f32).min(1.0);
        let _gradient_x = (x as f32 / width as f32).min(1.0);

        // Base colors for a book cover look
        let base_r = 45u8;
        let base_g = 55u8;
        let base_b = 70u8;

        // Add some texture and variation
        let noise = ((x + y) % 7) as u8 * 3;
        let edge_darken = if x < 20 || x > width - 20 || y < 20 || y > height - 20 {
            20
        } else {
            0
        };

        *pixel = Rgba([
            (base_r + (gradient_y * 30.0) as u8 + noise).saturating_sub(edge_darken),
            (base_g + (gradient_y * 35.0) as u8 + noise).saturating_sub(edge_darken),
            (base_b + (gradient_y * 40.0) as u8 + noise).saturating_sub(edge_darken),
            255,
        ]);
    }

    // Add a simple "PDF" text area in the center
    let text_area_y = height / 2 - 40;
    let text_area_height = 80;
    let text_area_x = width / 4;
    let text_area_width = width / 2;

    // Create a lighter rectangle for text area
    for y in text_area_y..(text_area_y + text_area_height).min(height) {
        for x in text_area_x..(text_area_x + text_area_width).min(width) {
            let pixel = img.get_pixel_mut(x, y);
            *pixel = Rgba([200, 210, 220, 255]);
        }
    }

    // Add a simple border around the text area
    for y in text_area_y..(text_area_y + text_area_height).min(height) {
        for x in [text_area_x, text_area_x + text_area_width - 1] {
            if x < width {
                let pixel = img.get_pixel_mut(x, y);
                *pixel = Rgba([100, 110, 120, 255]);
            }
        }
    }
    for x in text_area_x..(text_area_x + text_area_width).min(width) {
        for y in [text_area_y, text_area_y + text_area_height - 1] {
            if y < height {
                let pixel = img.get_pixel_mut(x, y);
                *pixel = Rgba([100, 110, 120, 255]);
            }
        }
    }

    // Encode as PNG
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    image::DynamicImage::ImageRgba8(img).write_to(&mut cursor, ImageFormat::Png)?;

    Ok(Cover::Fallback(buffer))
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
