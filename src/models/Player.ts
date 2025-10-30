import type Rendition from "epubjs/types/rendition";
import type { ParagraphWithCFI } from "@/types";
import EventEmitter from "events";
// @ts-ignore
import { EVENTS } from "epubjs/src/utils/constants";
import {
  getTTSAudioPath,
  requestTTSAudio,
} from "@/modules/ipc_handel_functions";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  getCurrentViewParagraphs,
  getNextViewParagraphs,
  getPreviousViewParagraphs,
  highlightRange,
  removeHighlight,
} from "@/epubwrapper";
export enum PlayingState {
  Playing = "playing",
  Paused = "paused",
  Stopped = "stopped",
  Loading = "loading",
}
export enum Direction {
  Forward = "forward",
  Backward = "backward",
}
export enum PlayerEvent {
  PARAGRAPH_INDEX_CHANGED = "paragraphIndexChanged",
  PLAYING_STATE_CHANGED = "playingStateChanged",
  ERRORS_CHANGED = "errorsChanged",
}
export type PlayerEventMap = {
  [PlayerEvent.PARAGRAPH_INDEX_CHANGED]: [ParagraphIndexChangedEvent];
  [PlayerEvent.PLAYING_STATE_CHANGED]: [PlayingState];
  [PlayerEvent.ERRORS_CHANGED]: [ErrorsChangedEvent];
};

export interface ParagraphIndexChangedEvent {
  index: number;
  paragraph: ParagraphWithCFI | null;
}
export type PlayingStateChangedEvent = [PlayingState];

export interface ErrorsChangedEvent {
  errors: string[];
}

export class Player extends EventEmitter<PlayerEventMap> {
  private rendition: Rendition;
  private playingState: PlayingState = PlayingState.Stopped;
  private currentParagraphIndex: number = 0;
  private paragraphs: ParagraphWithCFI[] = [];
  private bookId: string;
  private audioCache: Map<string, string>;
  private priority: number;
  private errors: string[] = [];
  private audioElement: HTMLAudioElement = new Audio();
  private direction: Direction = Direction.Forward;
  private nextPageParagraphs: ParagraphWithCFI[];
  private previousPageParagraphs: ParagraphWithCFI[];
  constructor(rendition: Rendition, bookId: string) {
    super();
    this.rendition = rendition;
    this.setPlayingState(PlayingState.Stopped);
    this.setParagraphIndex(0);

    this.bookId = bookId;

    // this.paragraphs = rendition.getCurrentViewParagraphs() || []
    rendition.on(EVENTS.RENDITION.RENDERED, () => {
      this.paragraphs = getCurrentViewParagraphs(rendition) || [];

      void getNextViewParagraphs(rendition).then((nextPageParagraphs) => {
        this.nextPageParagraphs = nextPageParagraphs || [];
      });
      void getPreviousViewParagraphs(rendition).then(
        (previousPageParagraphs) => {
          this.previousPageParagraphs = previousPageParagraphs?.reverse() || [];
        }
      );
    });
    this.rendition.once(EVENTS.RENDITION.RENDERED, () => {
      this.audioElement = new Audio();
      this.audioElement.addEventListener("ended", this.handleEnded);
      this.audioElement.addEventListener("error", this.handleError);
    });
    this.rendition.on(
      EVENTS.RENDITION.LOCATION_CHANGED,
      this.handleLocationChanged
    );
    this.audioCache = new Map();
    this.priority = 3;
    this.errors = [];

    this.nextPageParagraphs = [];
    this.previousPageParagraphs = [];
  }
  private async clearHighlights() {
    for (const paragraph of this.paragraphs) {
      await this.unhighlightParagraph(paragraph);
    }
  }
  private resetParagraphs() {
    this.paragraphs = getCurrentViewParagraphs(this.rendition) || [];
    if (this.direction === Direction.Backward)
      this.setParagraphIndex(this.paragraphs.length - 1);
    else this.setParagraphIndex(0);
    return Promise.all([
      getNextViewParagraphs(this.rendition).then((nextPageParagraphs) => {
        this.nextPageParagraphs = nextPageParagraphs || [];
      }),
      getPreviousViewParagraphs(this.rendition).then(
        (previousPageParagraphs) => {
          this.previousPageParagraphs = previousPageParagraphs?.reverse() || [];
        }
      ),
    ]);
  }

  private handleLocationChanged = async () => {
    await this.clearHighlights();
    if (this.playingState === PlayingState.Playing) {
      await this.stop();
      await this.resetParagraphs();
      await this.play();
    } else {
      await this.stop();
      await this.resetParagraphs();
    }
  };

  public cleanup() {
    this.audioElement.removeEventListener("ended", this.handleEnded);
    this.audioElement.removeEventListener("error", this.handleError);
    this.audioElement.pause();
    this.audioElement.src = "";
  }
  private handleEnded = async () => {
    try {
      const currentParagraph = this.getCurrentParagraph();
      if (!currentParagraph) return;
      await removeHighlight(this.rendition, currentParagraph.cfiRange);
    } catch (error) {
      console.warn("Failed to remove highlight:", error);
    }

    // advanceToNextParagraphRef.current?.() // Use ref to avoid stale closure
    await this.next();
  };
  private handleError = (e: Event) => {
    const audioElement = e.target as HTMLAudioElement;
    const mediaError = audioElement.error;

    // Detailed error information
    const errorDetails = {
      timestamp: new Date().toISOString(),
      eventType: e.type,
      src: audioElement.src,
      currentTime: audioElement.currentTime,
      duration: audioElement.duration,
      readyState: audioElement.readyState,
      networkState: audioElement.networkState,
      mediaError: mediaError
        ? {
            code: mediaError.code,
            message: mediaError.message,
            errorName: this.getMediaErrorName(mediaError.code),
          }
        : null,
      currentParagraph: this.getCurrentParagraph()
        ? {
            index: this.currentParagraphIndex,
            text: this.getCurrentParagraph()?.text.substring(0, 100) + "...",
            cfiRange: this.getCurrentParagraph()?.cfiRange,
          }
        : null,
    };

    console.error("🔴 Audio playback error - Full details:", errorDetails);
    console.error("🔴 Error event:", e);

    // Create detailed error message
    const errorMsg = mediaError
      ? `Audio error: ${this.getMediaErrorName(mediaError.code)} (${mediaError.message || "No message"})`
      : "Audio playback failed (unknown error)";

    this.errors.push(errorMsg);
    console.error("🔴 Error message added:", errorMsg);

    this.setPlayingState(PlayingState.Stopped);
  };

  private getMediaErrorName(code: number): string {
    const errorNames: Record<number, string> = {
      1: "MEDIA_ERR_ABORTED - Playback aborted by user",
      2: "MEDIA_ERR_NETWORK - Network error while loading",
      3: "MEDIA_ERR_DECODE - Decode error (corrupted or unsupported format)",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED - Media source not supported",
    };
    return errorNames[code] || `UNKNOWN_ERROR (code: ${code})`;
  }

  private getNetworkStateName(state: number): string {
    const stateNames: Record<number, string> = {
      0: "NETWORK_EMPTY - No data loaded",
      1: "NETWORK_IDLE - Media selected but not loading",
      2: "NETWORK_LOADING - Currently loading data",
      3: "NETWORK_NO_SOURCE - No valid source found",
    };
    return stateNames[state] || `UNKNOWN_STATE (${state})`;
  }

  private getReadyStateName(state: number): string {
    const stateNames: Record<number, string> = {
      0: "HAVE_NOTHING - No information available",
      1: "HAVE_METADATA - Metadata loaded",
      2: "HAVE_CURRENT_DATA - Current frame available",
      3: "HAVE_FUTURE_DATA - Future data available",
      4: "HAVE_ENOUGH_DATA - Enough data to play",
    };
    return stateNames[state] || `UNKNOWN_STATE (${state})`;
  }
  public getCurrentParagraph() {
    if (this.currentParagraphIndex < 0) {
      this.currentParagraphIndex = 0;
    }
    if (this.currentParagraphIndex >= this.paragraphs.length) {
      this.currentParagraphIndex = this.paragraphs.length - 1;
    }
    return this.paragraphs[this.currentParagraphIndex];
  }

  public setParagraphs(paragraphs: ParagraphWithCFI[]) {
    this.paragraphs = paragraphs;
  }
  public async play(maxRetries: number = 3): Promise<void> {
    let attempt = 0;
    let skipCache = false;

    while (attempt < maxRetries) {
      try {
        await this.clearHighlights();

        await this.playWithoutRetry(skipCache);
        return; // success
      } catch (err) {
        console.error(">>> Player: Play attempt failed", {
          attempt: attempt + 1,
          skipCache,
          err,
        });

        // Ensure a clean retry
        const currentParagraph = this.getCurrentParagraph();
        if (currentParagraph) this.audioCache.delete(currentParagraph.cfiRange);
        this.audioElement.pause();
        this.audioElement.src = "";
        skipCache = true; // From now on bypass cache
        attempt += 1;
      }
    }
    console.error(">>> Player: All retries failed — skipping paragraph");
    await this.next();
  }

  public async playWithoutRetry(skipCache: boolean = false) {
    if (this.playingState === PlayingState.Playing) return;
    this.setPlayingState(PlayingState.Playing);

    if (this.paragraphs.length === 0) {
      console.log(
        "🎵 No paragraphs on page (likely an image page) - pausing briefly then moving to next page"
      );
      // Give user 2 seconds to view the image, then move to next page
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.moveToNextPage();
      return;
    }

    const currentParagraph = this.getCurrentParagraph();
    if (!currentParagraph) {
      console.error("🎵 No current paragraph available");
      this.errors.push("No current paragraph available to play");
      return;
    }

    // Check if paragraph has no text (e.g., image-only content)
    if (!currentParagraph.text.trim()) {
      console.log(
        "🎵 No text in paragraph (likely an image) - pausing briefly then moving to next paragraph"
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.next();
      return;
    }

    // Highlight current paragraph and store reference

    await this.highlightParagraph(currentParagraph);

    // Request audio with high priority

    const audioPath = await this.requestAudio(
      currentParagraph,
      this.getNextPriority(),
      skipCache
    );

    if (!audioPath) {
      console.error("🎵 Failed to get audio path");
      this.errors.push("Failed to request audio");
      throw new Error("Failed to request audio");
    }

    this.audioElement.pause();
    this.audioElement.currentTime = 0;

    // Set new source and wait for it to be ready
    this.audioElement.src = convertFileSrc(audioPath);
    this.audioElement.load();

    await new Promise((resolve, reject) => {
      const handleCanPlay = () => {
        console.log("✅ Audio ready to play:", {
          src: this.audioElement.src,
          duration: this.audioElement.duration,
          paragraphIndex: this.currentParagraphIndex,
        });
        this.audioElement?.removeEventListener("canplaythrough", handleCanPlay);
        this.audioElement?.removeEventListener("error", handleError);
        resolve(undefined);
      };
      const handleError = (e: Event) => {
        const audioElement = e.target as HTMLAudioElement;
        const mediaError = audioElement.error;

        const errorDetails = {
          timestamp: new Date().toISOString(),
          eventType: e.type,
          src: audioElement.src,
          readyState: audioElement.readyState,
          networkState: audioElement.networkState,
          networkStateName: this.getNetworkStateName(audioElement.networkState),
          readyStateName: this.getReadyStateName(audioElement.readyState),
          mediaError: mediaError
            ? {
                code: mediaError.code,
                message: mediaError.message,
                errorName: this.getMediaErrorName(mediaError.code),
              }
            : null,
          currentParagraph: {
            index: this.currentParagraphIndex,
            text: currentParagraph.text.substring(0, 100) + "...",
            cfiRange: currentParagraph.cfiRange,
          },
        };

        console.error("🔴 Audio load error - Full details:", errorDetails);
        console.error("🔴 Load error event:", e);

        this.audioElement?.removeEventListener("canplaythrough", handleCanPlay);
        this.audioElement?.removeEventListener("error", handleError);
        const p = this.getCurrentParagraph();
        if (p) this.audioCache.delete(p.cfiRange);
        reject(new Error(JSON.stringify(errorDetails)));
      };
      this.audioElement?.addEventListener("canplaythrough", handleCanPlay, {
        once: true,
      });
      this.audioElement?.addEventListener("error", handleError, {
        once: true,
      });
    });

    console.log("▶️ Starting audio playback:", {
      src: this.audioElement.src,
      paragraphIndex: this.currentParagraphIndex,
      paragraphText: currentParagraph.text.substring(0, 100) + "...",
    });

    await this.audioElement.play();
    this.setPlayingState(PlayingState.Playing);

    console.log("✅ Audio playback started successfully");

    // Prefetch next paragraphs

    void this.prefetchAudio(this.currentParagraphIndex + 1, 3);
    void this.prefetchAudio(this.currentParagraphIndex - 3, 3);
  }
  public pause() {
    if (this.audioElement.paused) return;
    this.audioElement.pause();

    this.setPlayingState(PlayingState.Paused);
  }
  public resume() {
    if (this.playingState !== PlayingState.Paused) return;
    this.audioElement.play().catch((error) => {
      console.error("Failed to resume audio:", error);
      this.errors.push(`Failed to resume audio: ${error.message}`);
    });
    this.setPlayingState(PlayingState.Playing);
  }

  public setParagraphIndex(index: number) {
    if (index < 0) {
      index = 0;
    }
    if (index >= this.paragraphs.length) {
      index = this.paragraphs.length - 1;
    }
    this.currentParagraphIndex = index;
    this.emit(PlayerEvent.PARAGRAPH_INDEX_CHANGED, {
      index,
      paragraph: this.getCurrentParagraph(),
    });
  }
  public async stop() {
    if (this.playingState === PlayingState.Stopped) return;
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.setParagraphIndex(0);

    const currentParagraph = this.getCurrentParagraph();
    if (!currentParagraph) return;
    const audioPath = convertFileSrc(
      (await this.requestAudio(currentParagraph, this.getNextPriority())) || ""
    );
    // set the souce to the first paragraph
    this.audioElement.src = audioPath || "";

    this.audioElement.load();

    await this.clearHighlights();
    this.setPlayingState(PlayingState.Stopped);
  }
  private prefetchNextPageAudio = (count: number = 3) => {
    if (this.nextPageParagraphs.length === 0) return;
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < Math.min(count, this.nextPageParagraphs.length); i++) {
      const paragraph = this.nextPageParagraphs[i];

      const promise = this.requestAudio(
        paragraph,
        this.getPrefetchPriority()
      ).catch((error) => {
        console.warn(`Prefetch failed for next page paragraph ${i}:`, error);
      });
      promises.push(promise);
    }
    return Promise.all(promises);
  };
  private prefetchPrevPageAudio = (count: number = 3) => {
    if (this.previousPageParagraphs.length === 0) return;

    for (
      let i = 0;
      i < Math.min(count, this.previousPageParagraphs.length);
      i++
    ) {
      const paragraph = this.previousPageParagraphs[i];
      this.requestAudio(paragraph, this.getPrefetchPriority()).catch(
        (error) => {
          console.warn(`Prefetch failed for next page paragraph ${i}:`, error);
        }
      );
    }
  };
  private moveToNextPage = async () => {
    await this.rendition.next();
  };
  private moveToPreviousPage = async () => {
    await this.rendition.prev();
  };
  private updateParagaph = async (index: number) => {
    // bounds checks
    if (index < 0) {
      return this.moveToPreviousPage();
    }
    if (index >= this.paragraphs.length) {
      return this.moveToNextPage();
    }
    if (index == this.paragraphs.length - 1) {
      // Request audio for the next paragraphs of the next page
      if (this.playingState === PlayingState.Playing) {
        void this.prefetchNextPageAudio(3);
      }
    }
    if (index == 0) {
      // Request audio for the previous paragraphs of the previous page
      if (this.playingState === PlayingState.Playing) {
        this.prefetchPrevPageAudio(3);
      }
    }
    // first remove the current paragraph highlight and pause audio
    await this.stop();

    this.setParagraphIndex(index);

    await this.play();
  };
  public prev = async () => {
    this.direction = Direction.Backward;
    const prevIndex = this.currentParagraphIndex - 1;
    await this.updateParagaph(prevIndex);
  };
  public next = async () => {
    this.direction = Direction.Forward;
    const nextIndex = this.currentParagraphIndex + 1;

    await this.updateParagaph(nextIndex);
  };

  public getPlayingState() {
    return this.playingState;
  }
  public setPlayingState(playingState: PlayingState) {
    if (this.playingState === playingState) return;
    this.playingState = playingState;
    this.emit(PlayerEvent.PLAYING_STATE_CHANGED, playingState);
  }

  public getErrors() {
    return this.errors;
  }

  public getDetailedErrorInfo() {
    return {
      errors: this.errors,
      audioElementState: {
        src: this.audioElement.src,
        currentTime: this.audioElement.currentTime,
        duration: this.audioElement.duration,
        readyState: this.audioElement.readyState,
        readyStateName: this.getReadyStateName(this.audioElement.readyState),
        networkState: this.audioElement.networkState,
        networkStateName: this.getNetworkStateName(
          this.audioElement.networkState
        ),
        paused: this.audioElement.paused,
        ended: this.audioElement.ended,
        error: this.audioElement.error
          ? {
              code: this.audioElement.error.code,
              message: this.audioElement.error.message,
              errorName: this.getMediaErrorName(this.audioElement.error.code),
            }
          : null,
      },
      currentState: {
        playingState: this.playingState,
        paragraphIndex: this.currentParagraphIndex,
        totalParagraphs: this.paragraphs.length,
        currentParagraph: this.getCurrentParagraph()
          ? {
              text: this.getCurrentParagraph()?.text.substring(0, 100) + "...",
              cfiRange: this.getCurrentParagraph()?.cfiRange,
            }
          : null,
      },
      cacheInfo: {
        cacheSize: this.audioCache.size,
        cachedRanges: Array.from(this.audioCache.keys()),
      },
    };
  }

  public clearErrors() {
    this.errors = [];
  }

  private getNextPriority() {
    this.priority = this.priority + 1;
    return this.priority;
  }
  private getPrefetchPriority() {
    return this.priority - 1;
  }

  private highlightParagraph(paragraph: ParagraphWithCFI) {
    return highlightRange(this.rendition, paragraph.cfiRange);
  }
  private async unhighlightParagraph(paragraph: ParagraphWithCFI) {
    return await removeHighlight(this.rendition, paragraph.cfiRange);
  }
  public async requestAudio(
    paragraph: ParagraphWithCFI,
    priority: number,
    skipCache = false
  ) {
    console.log(">>> Player: Request audio", {
      paragraphIndex: this.currentParagraphIndex,
      cfiRange: paragraph.cfiRange,
      textPreview: paragraph.text.substring(0, 50) + "...",
      priority,
    });

    if (skipCache === false) {
      if (!paragraph.text.trim()) {
        console.log(">>> Player: Empty paragraph text, skipping audio request");
        return null;
      }

      const cached = this.audioCache.get(paragraph.cfiRange);
      if (cached) {
        console.log(">>> Player: Using memory cached audio", { cached });
        return cached;
      }

      // Check disk cache via direct API call
      try {
        const diskCached = await getTTSAudioPath(
          this.bookId,
          paragraph.cfiRange
        );
        console.log(">>> Player: Disk cache result", {
          diskCached,
          exists: !!diskCached,
        });

        if (diskCached) {
          this.addToAudioCache(paragraph.cfiRange, diskCached);
          console.log(">>> Player: Added disk cached audio to memory cache");
          return diskCached;
        }
      } catch (error) {
        console.error(">>> Player: Cache check failed with error:", {
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                }
              : String(error),
          paragraph: {
            cfiRange: paragraph.cfiRange,
            textPreview: paragraph.text.substring(0, 50) + "...",
          },
        });
      }

      // Request new audio via React Query mutation
      console.log(">>> Player: Requesting new audio from TTS service");
    }
    try {
      const audioPath = await requestTTSAudio(
        this.bookId,
        paragraph.cfiRange,
        paragraph.text,
        priority
      );

      console.log(">>> Player: Received audio path from TTS service", {
        audioPath,
        cfiRange: paragraph.cfiRange,
      });

      // Update cache
      this.addToAudioCache(paragraph.cfiRange, audioPath);
      console.log(">>> Player: Added new audio to memory cache");

      return audioPath;
    } catch (error) {
      console.error(">>> Player: Audio request failed:", {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : String(error),
        paragraph: {
          cfiRange: paragraph.cfiRange,
          textPreview: paragraph.text.substring(0, 50) + "...",
        },
      });
      throw error;
    }
  }
  addToAudioCache(cfiRange: string, audioPath: string) {
    this.audioCache.set(cfiRange, audioPath);
  }

  private async prefetchAudio(startIndex: number, count: number) {
    for (let i = 0; i < count; i++) {
      const index = startIndex + i;
      if (index < this.paragraphs.length && index >= 0) {
        const paragraph = this.paragraphs[index];
        await this.requestAudio(paragraph, this.priority - 1).catch((error) => {
          console.warn(`Prefetch failed for paragraph ${index}:`, error);
        }); // Fix: Add error logging for prefetch failures
      }
    }
  }
}
