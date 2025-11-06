use serde::{Deserialize, Serialize};

pub enum BookKind {
    Epub = 0,
    Pdf = 1,
}

impl BookKind {
    pub fn to_string(self) -> String {
        match self {
            BookKind::Epub => "epub".to_string(),
            BookKind::Pdf => "pdf".to_string(),
        }
    }
}
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookData {
    id: String,
    kind: String,
    cover: Vec<u8>,
    title: Option<String>,
    author: Option<String>,
    publisher: Option<String>,
    filePath: String,
    current_location: String,
    cover_kind: Option<String>,
    version: u32,
}

impl BookData {
    pub fn new(
        id: String,
        kind: String,
        cover: Vec<u8>,
        title: Option<String>,
        author: Option<String>,
        publisher: Option<String>,
        filePath: String,
        current_location: String,
        cover_kind: Option<String>,
    ) -> Self {
        Self {
            id,
            kind,
            cover,
            title,
            author,
            cover_kind,
            publisher,
            filePath,
            current_location,
            version: 0,
        }
    }
}
