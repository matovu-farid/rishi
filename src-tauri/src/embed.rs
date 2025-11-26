use std::collections::HashMap;
use std::sync::Arc;

use embed_anything::embeddings::embed::{EmbedData, EmbedderBuilder};
use embed_anything::process_chunks;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub id: u32,
    pub page_number: usize,
    pub book_id: u32,
}

impl From<HashMap<String, String>> for Metadata {
    fn from(data: HashMap<String, String>) -> Self {
        Self {
            id: data.get("id").unwrap_or(&"".to_string()).parse().unwrap(),
            page_number: data
                .get("page_number")
                .unwrap_or(&"".to_string())
                .parse()
                .unwrap(),
            book_id: data
                .get("book_id")
                .unwrap_or(&"0".to_string())
                .parse()
                .unwrap(),
        }
    }
}

impl From<Metadata> for HashMap<String, String> {
    fn from(data: Metadata) -> Self {
        HashMap::from([
            ("id".to_string(), data.id.to_string()),
            ("page_number".to_string(), data.page_number.to_string()),
            ("book_id".to_string(), data.book_id.to_string()),
        ])
    }
}
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EmbedResult {
    pub dim: usize,
    pub embedding: Vec<f32>,
    pub text: Option<String>,
    pub metadata: Metadata,
}

impl From<EmbedData> for EmbedResult {
    fn from(data: EmbedData) -> Self {
        // let embedding = data.embedding.to_dense().ok_or("Failed to get embedding")?;
        let embedding = data.embedding.to_dense().unwrap();
        Self {
            dim: embedding.len(),
            embedding,
            text: data.text,
            metadata: data.metadata.unwrap().into(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct EmbedParam {
    pub text: String,
    pub metadata: Metadata,
}

pub async fn embed_text(embedparams: Vec<EmbedParam>) -> Result<Vec<EmbedResult>, String> {
    let embedding_model = Arc::new(
        EmbedderBuilder::new()
            .model_architecture("bert")
            .model_id(Some("sentence-transformers/all-MiniLM-L6-v2"))
            .from_pretrained_hf()
            .map_err(|e| e.to_string())?,
    );
    let chunks = embedparams
        .iter()
        .map(|p| p.text.clone())
        .collect::<Vec<_>>();
    let metadata = embedparams
        .iter()
        .map(|p| Some(p.metadata.clone().into()))
        .collect::<Vec<_>>();

    let embeddings = process_chunks(&chunks, &metadata, &embedding_model, None, None)
        .await
        .map_err(|e| {
            println!("error: {:#?}", e.to_string());
            e.to_string()
        })?;

    let res = Arc::into_inner(embeddings).ok_or("Failed to get embeddings")?;
    Ok(res.into_iter().map(EmbedResult::from).collect::<Vec<_>>())
}
