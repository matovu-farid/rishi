use std::collections::HashMap;
use std::sync::Arc;

use embed_anything::embeddings::embed::{EmbedData, EmbedderBuilder};
use embed_anything::process_chunks;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct EmbedResult {
    pub dim: usize,
    pub embedding: Vec<f32>,
    pub text: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

impl From<EmbedData> for EmbedResult {
    fn from(data: EmbedData) -> Self {
        // let embedding = data.embedding.to_dense().ok_or("Failed to get embedding")?;
        let embedding = data.embedding.to_dense().unwrap();
        Self {
            dim: embedding.len(),
            embedding,
            text: data.text,
            metadata: data.metadata,
        }
    }
}
// pub async fn embed_text(
//     chunks: Vec<String>,
//     metadata: Vec<HashMap<String, String>>,
// ) -> Result<Vec<EmbedResult>, String> {
//     let embedding_model = Arc::new(
//         EmbedderBuilder::new()
//             .model_architecture("bert")
//             .model_id(Some("sentence-transformers/all-MiniLM-L6-v2"))
//             .from_pretrained_hf()
//             .map_err(|e| e.to_string())?,
//     );
//     let metadata = metadata.iter().map(|m| Some(m.clone())).collect::<Vec<_>>();
//     let embeddings = process_chunks(&chunks, &metadata, &embedding_model, None, None)
//         .await
//         .map_err(|e| e.to_string())?;

//     let res = Arc::into_inner(embeddings).ok_or("Failed to get embeddings")?;
//     Ok(res.into_iter().map(EmbedResult::from).collect::<Vec<_>>())
// }

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct EmbedParam {
    pub text: String,
    pub metadata: HashMap<String, String>,
}
pub async fn embed_text(embed_params: Vec<EmbedParam>) -> Result<Vec<EmbedResult>, String> {
    let embedding_model = Arc::new(
        EmbedderBuilder::new()
            .model_architecture("bert")
            .model_id(Some("sentence-transformers/all-MiniLM-L6-v2"))
            .from_pretrained_hf()
            .map_err(|e| e.to_string())?,
    );
    let chunks = embed_params
        .iter()
        .map(|p| p.text.clone())
        .collect::<Vec<_>>();
    let metadata = embed_params
        .iter()
        .map(|p| Some(p.metadata.clone()))
        .collect::<Vec<_>>();
    let embeddings = process_chunks(&chunks, &metadata, &embedding_model, None, None)
        .await
        .map_err(|e| e.to_string())?;

    let res = Arc::into_inner(embeddings).ok_or("Failed to get embeddings")?;
    Ok(res.into_iter().map(EmbedResult::from).collect::<Vec<_>>())
}
