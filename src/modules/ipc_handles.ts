export enum IPC_HANDLERS {
  FILES_CHOOSE = 'files:choose',
  GET_COVER_IMAGE = 'getCoverImage',
  GET_BOOKS = 'getBooks',
  UPDATE_CURRENT_BOOK_ID = 'updateCurrentBookId',
  DELETE_BOOK = 'deleteBook',
  TTS_REQUEST_AUDIO = 'tts:request-audio',
  TTS_GET_AUDIO_PATH = 'tts:get-audio-path',
  TTS_GET_API_KEY_STATUS = 'tts:get-api-key-status',
  TTS_SHOULD_DEBUG = 'tts:should-debug',
  TTS_GET_QUEUE_STATUS = 'tts:get-queue-status',
  TTS_CLEAR_BOOK_CACHE = 'tts:clear-book-cache',
  TTS_GET_BOOK_CACHE_SIZE = 'tts:get-book-cache-size',
  TTS_AUDIO_READY = 'tts:audio-ready',
  TTS_ERROR = 'tts:error'
}
export enum TTS_EVENTS {
  AUDIO_READY = 'audio-ready',
  ERROR = 'error'
}
export enum TTSQueueEvents {
  REQUEST_AUDIO = 'request-audio',
  AUDIO_READY = 'audio-ready',
  AUDIO_ERROR = 'audio-error'
}
