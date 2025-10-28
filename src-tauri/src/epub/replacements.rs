use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReplacementMode {
    /// No replacement - use original URLs
    None,
    /// Convert to base64 data URIs
    Base64,
    /// Use blob URLs (requires runtime blob registration)
    BlobUrl,
}

impl ReplacementMode {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "none" => Some(Self::None),
            "base64" => Some(Self::Base64),
            "blobUrl" | "blob" => Some(Self::BlobUrl),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Base64 => "base64",
            Self::BlobUrl => "blobUrl",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplacementStrategy {
    /// Default mode for all resources
    pub default: ReplacementMode,
    /// Override for images
    pub images: Option<ReplacementMode>,
    /// Override for fonts
    pub fonts: Option<ReplacementMode>,
    /// Override for stylesheets
    pub stylesheets: Option<ReplacementMode>,
    /// Override for scripts
    pub scripts: Option<ReplacementMode>,
}

impl Default for ReplacementStrategy {
    fn default() -> Self {
        Self {
            default: ReplacementMode::Base64,
            images: None,
            fonts: None,
            stylesheets: None,
            scripts: None,
        }
    }
}

impl ReplacementStrategy {
    pub fn get_mode_for_mime(&self, mime: &str) -> ReplacementMode {
        let mime_lower = mime.to_lowercase();

        if mime_lower.starts_with("image/") {
            return self.images.unwrap_or(self.default);
        }

        if mime_lower.contains("font")
            || mime_lower.ends_with("/woff")
            || mime_lower.ends_with("/woff2")
            || mime_lower.ends_with("/ttf")
            || mime_lower.ends_with("/otf")
        {
            return self.fonts.unwrap_or(self.default);
        }

        if mime_lower == "text/css" || mime_lower.contains("stylesheet") {
            return self.stylesheets.unwrap_or(self.default);
        }

        if mime_lower.contains("javascript") || mime_lower.contains("ecmascript") {
            return self.scripts.unwrap_or(self.default);
        }

        self.default
    }
}
