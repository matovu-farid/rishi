import { EventEmitter } from "events";
import { ttsCache } from "./ttsCache";
import { ttsQueue } from "./ttsQueue";
import { TTS_EVENTS, TTSQueueEvents } from "./ipc_handles";

export interface AudioReadyEvent {
  bookId: string;
  cfiRange: string;
  audioPath: string;
}

export interface TTSErrorEvent {
  bookId: string;
  cfiRange: string;
  error: string;
}

/**
 * TTS Service
 * Main service that coordinates cache and queue operations
 */
export class TTSService extends EventEmitter {
  private readonly activeRequests = new Set<string>();
  private readonly pendingListeners = new Map<
    string,
    {
      timeout: NodeJS.Timeout;
      listeners: {
        onAudioReady: (event: AudioReadyEvent) => void;
        onError: (event: TTSErrorEvent) => void;
      };
    }
  >();
  private readonly LISTENER_TIMEOUT_MS = 30000; // 30 seconds timeout for listeners

  constructor() {
    super();
    this.setMaxListeners(50); // Allow more concurrent requests

    // Forward audio-ready events from queue
    ttsQueue.on(TTSQueueEvents.AUDIO_READY, (event: AudioReadyEvent) => {
      this.activeRequests.delete(`${event.bookId}-${event.cfiRange}`);
      this.emit(TTS_EVENTS.AUDIO_READY, event);
    });

    // Forward error events from queue
    ttsQueue.on(TTSQueueEvents.AUDIO_ERROR, (event: TTSErrorEvent) => {
      this.activeRequests.delete(`${event.bookId}-${event.cfiRange}`);
      this.emit(TTS_EVENTS.ERROR, event);
    });
  }

  /**
   * Request audio for a paragraph
   * Checks cache first, then queues for generation if not cached
   *
   */
  async requestAudio(
    bookId: string,
    cfiRange: string,
    text: string,
    priority = 0 // 0 is normal priority, 1 is high priority, 2 is highest priority
  ): Promise<string> {
    const requestId = `${bookId}-${cfiRange}`;

    try {
      // Check if request is already active
      if (this.activeRequests.has(requestId)) {
        console.log(`Request already active: ${requestId}`);
        // Return a promise that will resolve when the active request completes
        return new Promise((resolve, reject) => {
          const onAudioReady = (event: AudioReadyEvent) => {
            if (event.bookId === bookId && event.cfiRange === cfiRange) {
              this.cleanupPendingListener(requestId);
              resolve(event.audioPath);
            }
          };

          const onError = (event: TTSErrorEvent) => {
            if (event.bookId === bookId && event.cfiRange === cfiRange) {
              this.cleanupPendingListener(requestId);
              reject(new Error(event.error));
            }
          };

          // Setup timeout to prevent memory leaks
          const timeout = setTimeout(() => {
            this.cleanupPendingListener(requestId);
            reject(new Error("Request timeout"));
          }, this.LISTENER_TIMEOUT_MS);

          // Store listener info for cleanup
          this.pendingListeners.set(requestId, {
            timeout,
            listeners: { onAudioReady, onError },
          });

          this.on(TTS_EVENTS.AUDIO_READY, onAudioReady);
          this.on(TTS_EVENTS.ERROR, onError);
        });
      }

      // Check cache first
      const cached = await ttsCache.getCachedAudio(bookId, cfiRange);
      if (cached.exists) {
        return cached.path;
      }

      // Track active request
      this.activeRequests.add(requestId);

      // Queue for generation
      const audioPath = await ttsQueue.requestAudio(
        bookId,
        cfiRange,
        text,
        priority
      );
      return audioPath;
    } catch (error) {
      this.activeRequests.delete(requestId);
      console.error(`TTS request failed for ${requestId}:`, error);

      // Emit error event
      this.emit("error", {
        bookId,
        cfiRange,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  }

  /**
   * Get audio path if cached
   */
  async getAudioPath(bookId: string, cfiRange: string): Promise<string | null> {
    const cached = await ttsCache.getCachedAudio(bookId, cfiRange);
    return cached.exists ? cached.path : null;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { pending: number; isProcessing: boolean; active: number } {
    return ttsQueue.getQueueStatus();
  }

  /**
   * Cancel a specific request
   */
  cancelRequest(bookId: string, cfiRange: string): boolean {
    const requestId = `${bookId}-${cfiRange}`;
    this.activeRequests.delete(requestId);
    return ttsQueue.cancelRequest(requestId);
  }

  /**
   * Cancel all requests for a book
   */
  cancelBookRequests(bookId: string): void {
    const requestsToCancel = Array.from(this.activeRequests).filter((id) =>
      id.startsWith(`${bookId}-`)
    );
    for (const requestId of requestsToCancel) {
      this.activeRequests.delete(requestId);
      ttsQueue.cancelRequest(requestId);
    }
    console.log(
      `Cancelled ${requestsToCancel.length} requests for book ${bookId}`
    );
  }

  /**
   * Clear book cache
   */
  async clearBookCache(bookId: string): Promise<void> {
    await ttsCache.clearBookCache(bookId);
  }

  /**
   * Get book cache size
   */
  getBookCacheSize(bookId: string): Promise<number> {
    return ttsCache.getBookCacheSize(bookId);
  }

  /**
   * Clear all pending requests
   */
  clearQueue(): void {
    // Cleanup all pending listeners
    for (const [requestId] of this.pendingListeners) {
      this.cleanupPendingListener(requestId);
    }
    this.pendingListeners.clear();
    this.activeRequests.clear();

    ttsQueue.clearQueue();
  }

  /**
   * Cleanup pending listener for a request
   */
  private cleanupPendingListener(requestId: string): void {
    const pendingListener = this.pendingListeners.get(requestId);
    if (pendingListener) {
      clearTimeout(pendingListener.timeout);
      this.removeListener(
        TTS_EVENTS.AUDIO_READY,
        pendingListener.listeners.onAudioReady
      );
      this.removeListener(TTS_EVENTS.ERROR, pendingListener.listeners.onError);
      this.pendingListeners.delete(requestId);
    }
  }
}

// Export singleton instance
export const ttsService = new TTSService();
