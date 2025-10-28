use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnnotationKind {
    Highlight,
    Underline,
    Mark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: String,
    pub kind: AnnotationKind,
    pub cfi_range: String,
    pub color: Option<String>,
    pub note: Option<String>,
}
