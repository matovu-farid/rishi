import { invoke } from "@tauri-apps/api/core";

export const getTTSAudioPath = async (bookId: string, cfiRange: string) => {
  try {
    return await invoke<string | null>("tts_get_audio_path", {
      bookId,
      cfiRange,
    });
  } catch (error) {
    console.error("Failed to get audio path:", error);
    return null;
  }
};

export const getTtsQueueStatus = () => {
  try {
    return invoke<{ pending: number; isProcessing: boolean; active: number }>(
      "tts_queue_status"
    );
  } catch (error) {
    console.error("Failed to get queue status:", error);
    return { pending: 0, isProcessing: false, active: 0 };
  }
};

export const ttsClearBookCache = async (bookId: string) => {
  try {
    await invoke("tts_clear_book_cache", { bookId });
  } catch (error) {
    console.error("Failed to clear book cache:", error);
    throw error;
  }
};
export const ttsGetBookCacheSize = async (bookId: string) => {
  try {
    return await invoke<number>("tts_get_book_cache_size", { bookId });
  } catch (error) {
    console.error("Failed to get book cache size:", error);
    return 0;
  }
};

export const requestTTSAudio = async (
  bookId: string,
  cfiRange: string,
  text: string,
  priority = 0,
  voice?: string,
  rate?: number
) => {
  try {
    return await invoke<string>("tts_request_audio", {
      bookId,
      cfiRange,
      text,
      priority,
      voice,
      rate,
    });
  } catch (error) {
    console.error("TTS request failed:", error);
    throw error;
  }
};
