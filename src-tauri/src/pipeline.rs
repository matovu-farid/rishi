use std::path::PathBuf;

use crate::{
    llm::get_llm_response_with_context,
    speach::{transcribe, transcribe_audio, tts},
    sql::get_context_for_query,
};

async fn get_text_answer_with_context(
    app_dir: &PathBuf,
    audio_data: Vec<f32>,
    book_id: u32,
) -> anyhow::Result<String> {
    let res = transcribe_audio(app_dir, audio_data)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to transcribe audio: {}", e))?;
    let text = res.first().ok_or(anyhow::anyhow!("Failed to get text"))?;

    let context = get_context_for_query(text.clone(), book_id, app_dir, 3)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get context: {}", e))?
        .join("\n");
    let answer = get_llm_response_with_context(text, &context).await?;
    Ok(answer)
}

// recive audio -> convert it to text -> query the vector db-> query llm
pub async fn get_audio_answer_with_context(
    app_dir: &PathBuf,
    audio_data: Vec<f32>,
    book_id: u32,
) -> anyhow::Result<Vec<u8>> {
    let answer = get_text_answer_with_context(app_dir, audio_data, book_id).await?;
    let audio_data = tts(&answer).await?;
    Ok(audio_data)
}
