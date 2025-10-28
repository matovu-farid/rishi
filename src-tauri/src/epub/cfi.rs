use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum CFIError {
    #[error("Invalid CFI format")]
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CFIStep {
    pub index: i32,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CFIComponent {
    pub steps: Vec<CFIStep>,
    pub terminal_offset: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CFI {
    pub spine_path: CFIComponent,
    pub content_path: Option<CFIComponent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CFIRange {
    pub start: CFI,
    pub end: CFI,
}

pub fn parse(input: &str) -> Result<CFI, CFIError> {
    // Minimal validator/parser: expects epubcfi( ... ) and a single component path
    let s = input.trim();
    if !s.starts_with("epubcfi(") || !s.ends_with(')') {
        return Err(CFIError::Invalid);
    }
    let inner = &s[8..s.len() - 1];
    // Split on '!' to separate spine vs content paths (optional)
    let mut parts = inner.split('!');
    let spine_str = parts.next().unwrap_or("");
    let content_str = parts.next();

    let spine_path = parse_component(spine_str)?;
    let content_path = match content_str {
        Some(c) if !c.is_empty() => Some(parse_component(c)?),
        _ => None,
    };

    Ok(CFI {
        spine_path,
        content_path,
    })
}

pub fn parse_range(input: &str) -> Result<CFIRange, CFIError> {
    // Supported formats:
    // - epubcfi(range(start,end))
    // - epubcfi(start,end)
    // - start..end (fallback)
    if let Some(range_body) = input
        .strip_prefix("epubcfi(range(")
        .and_then(|s| s.strip_suffix(")"))
    {
        let mut it = range_body.split(',');
        let start = it.next().ok_or(CFIError::Invalid)?;
        let end = it.next().ok_or(CFIError::Invalid)?;
        return Ok(CFIRange {
            start: parse(start)?,
            end: parse(end)?,
        });
    }

    if let Some(inner) = input
        .strip_prefix("epubcfi(")
        .and_then(|s| s.strip_suffix(')'))
    {
        if let Some((lhs, rhs)) = inner.split_once(',') {
            return Ok(CFIRange {
                start: parse(lhs)?,
                end: parse(rhs)?,
            });
        }
    }

    if let Some((lhs, rhs)) = input.split_once("..") {
        return Ok(CFIRange {
            start: parse(lhs)?,
            end: parse(rhs)?,
        });
    }

    Err(CFIError::Invalid)
}

pub fn format_cfi(cfi: &CFI) -> String {
    let mut s = String::from("epubcfi(");
    s.push_str(&format_component(&cfi.spine_path));
    if let Some(content) = &cfi.content_path {
        s.push('!');
        s.push_str(&format_component(content));
    }
    s.push(')');
    s
}

fn parse_component(component: &str) -> Result<CFIComponent, CFIError> {
    // Component like /6/2[id]/4/1:23 - we collect numeric indices and optional ids; terminal offset after ':'
    // Ignore CFI assertions in parentheses e.g., (1:0,0)
    let cleaned = component.split('(').next().unwrap_or(component).trim();
    let (path_part, terminal) = match cleaned.rsplit_once(':') {
        Some((p, off)) => (p, Some(off)),
        None => (cleaned, None),
    };
    // Terminal offset may include assertions like ":123;something" — strip after ';'
    let terminal_offset = match terminal {
        Some(t) => t.split(';').next().unwrap_or("").parse::<i32>().ok(),
        None => None,
    };

    let mut steps: Vec<CFIStep> = Vec::new();
    for seg in path_part.split('/') {
        if seg.is_empty() {
            continue;
        }
        // Strip any per-step assertions in parentheses, e.g. /4(idref)
        let seg = seg.split('(').next().unwrap_or(seg);
        // Possible [id] suffix
        let (num_str, id) = if let Some((n, rest)) = seg.split_once('[') {
            let id = rest.trim_end_matches(']').to_string();
            (n, Some(id))
        } else {
            (seg, None)
        };

        let idx = num_str.parse::<i32>().map_err(|_| CFIError::Invalid)?;
        steps.push(CFIStep { index: idx, id });
    }

    Ok(CFIComponent {
        steps,
        terminal_offset,
    })
}

fn format_component(c: &CFIComponent) -> String {
    let mut out = String::new();
    for step in &c.steps {
        out.push('/');
        out.push_str(&step.index.to_string());
        if let Some(id) = &step.id {
            out.push('[');
            out.push_str(id);
            out.push(']');
        }
    }
    if let Some(off) = c.terminal_offset {
        out.push(':');
        out.push_str(&off.to_string());
    }
    out
}

pub fn try_cfi_to_offset(cfi: &CFI) -> Option<(usize, usize)> {
    // Interpret the first step index as spine index, and terminal_offset as char offset
    let spine_idx = cfi.spine_path.steps.first()?.index.max(0) as usize;
    let char_off = cfi.spine_path.terminal_offset?.max(0) as usize;
    Some((spine_idx, char_off))
}

pub fn try_parse_cfi_to_offset(s: &str) -> Option<(usize, usize)> {
    let cfi = parse(s).ok()?;
    try_cfi_to_offset(&cfi)
}

pub fn try_parse_cfi_range_to_offsets(s: &str) -> Option<((usize, usize), (usize, usize))> {
    let range = parse_range(s).ok()?;
    let start = try_cfi_to_offset(&range.start)?;
    let end = try_cfi_to_offset(&range.end)?;
    Some((start, end))
}

#[allow(dead_code)]
pub fn format_range(range: &CFIRange) -> String {
    let start = format_cfi(&range.start);
    let end = format_cfi(&range.end);
    // Strip outer epubcfi() to avoid nesting
    let start_inner = start.trim_start_matches("epubcfi(").trim_end_matches(')');
    let end_inner = end.trim_start_matches("epubcfi(").trim_end_matches(')');
    format!("epubcfi({},{})", start_inner, end_inner)
}
