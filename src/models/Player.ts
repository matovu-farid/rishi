import EventEmitter from "events";
// @ts-ignore
import {
  getTTSAudioPath,
  requestTTSAudio,
} from "@/modules/ipc_handel_functions";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ParagraphWithIndex, PlayerControlInterface } from "./player_control";
import { customStore } from "@/stores/jotai";
import { paragraphsForCurrentViewPlayerReceivedAtom } from "@/stores/paragraph-atoms";
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
  paragraph: ParagraphWithIndex | null;
}
export type PlayingStateChangedEvent = [PlayingState];

export interface ErrorsChangedEvent {
  errors: string[];
}

export class Player extends EventEmitter<PlayerEventMap> {
  private playingState: PlayingState = PlayingState.Stopped;
  private currentParagraphIndex: number = 0;
  private bookId: string;
  private audioCache: Map<string, string>;
  private priority: number;
  private errors: string[] = [];
  private audioElement: HTMLAudioElement = new Audio();
  private direction: Direction = Direction.Forward;
  private nextPageParagraphs: ParagraphWithIndex[] = [];
  private previousPageParagraphs: ParagraphWithIndex[] = [];
  private playerControl: PlayerControlInterface;
  constructor(playerControl: PlayerControlInterface, bookId: string) {
    super();

    this.playerControl = playerControl;
    this.setPlayingState(PlayingState.Stopped);
    void this.setParagraphIndex(0);

    this.bookId = bookId;

    this.playerControl.onRender(() => {
      this.audioElement = new Audio();
      (window as any).audioElement = this.audioElement;

      console.log("🔴 onRender", { audioElement: this.audioElement });
      void this.resetParagraphs();
    });

    this.audioCache = new Map();
    this.priority = 3;
    this.errors = [];


  }
  private async clearHighlights() {
    for (const paragraph of await this.playerControl.getCurrentViewParagraphs()) {
      await this.unhighlightParagraph(paragraph);
    }
  }
  private async resetParagraphs() {
    if (this.direction === Direction.Backward)
      await this.setParagraphIndex(
        (await this.playerControl.getCurrentViewParagraphs()).length - 1
      );
    else await this.setParagraphIndex(0);
    return Promise.all([
      this.playerControl.getNextViewParagraphs().then((nextPageParagraphs) => {
        this.nextPageParagraphs = nextPageParagraphs || [];
      }),
      this.playerControl
        .getPreviousViewParagraphs()
        .then((previousPageParagraphs) => {
          this.previousPageParagraphs = previousPageParagraphs?.reverse() || [];
        }),
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
    await this.clearHighlights();
    await this.next();
  };
  private handleError = async (e: Event) => {
    const audioElement = e.target as HTMLAudioElement;
    const mediaError = audioElement.error;
    const currentParagraph = await this.getCurrentParagraph();
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
      currentParagraph: currentParagraph
        ? {
            index: this.currentParagraphIndex,
            text: currentParagraph?.text.substring(0, 100) + "...",
            cfiRange: currentParagraph?.index,
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
  public async getCurrentParagraph() {
    if (this.currentParagraphIndex < 0) {
      this.currentParagraphIndex = 0;
    }
    if (
      this.currentParagraphIndex >=
      (await this.playerControl.getCurrentViewParagraphs()).length
    ) {
      this.currentParagraphIndex =
        (await this.playerControl.getCurrentViewParagraphs()).length - 1;
    }
    return (await this.playerControl.getCurrentViewParagraphs())[
      this.currentParagraphIndex
    ];
  }

  public async play(maxRetries: number = 3): Promise<void> {
    // Remove any existing listeners first to prevent accumulation
    this.audioElement.removeEventListener("ended", this.handleEnded);
    this.audioElement.removeEventListener("error", this.handleError);

    // Add listeners using the bound method references directly
    this.audioElement.addEventListener("ended", this.handleEnded);
    this.audioElement.addEventListener("error", this.handleError);

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
        const currentParagraph = await this.getCurrentParagraph();
        if (currentParagraph) this.audioCache.delete(currentParagraph.index);
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

    if ((await this.playerControl.getCurrentViewParagraphs()).length === 0) {
      console.log(
        "🎵 No paragraphs on page (likely an image page) - pausing briefly then moving to next page"
      );
      // Give user 2 seconds to view the image, then move to next page
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.moveToNextPage();
      return;
    }

    const currentParagraph = await this.getCurrentParagraph();
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
      const handleError = async (e: Event) => {
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
            cfiRange: currentParagraph.index,
          },
        };

        console.error("🔴 Audio load error - Full details:", errorDetails);
        console.error("🔴 Load error event:", e);

        this.audioElement?.removeEventListener("canplaythrough", handleCanPlay);
        this.audioElement?.removeEventListener("error", handleError);
        const p = await this.getCurrentParagraph();
        if (p) this.audioCache.delete(p.index);
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
  private async getCurrentViewParagraphs() {
    return await this.playerControl.getCurrentViewParagraphs();
  }

  public async setParagraphIndex(index: number) {
    const currentViewParagraphsLength = (await this.getCurrentViewParagraphs())
      .length;

    if (index < 0) {
      index = 0;
    }
    if (index >= currentViewParagraphsLength) {
      index = currentViewParagraphsLength - 1;
    }
    this.currentParagraphIndex = index;
    this.emit(PlayerEvent.PARAGRAPH_INDEX_CHANGED, {
      index,
      paragraph: await this.getCurrentParagraph(),
    });
  }
  public async stop() {
    if (this.playingState === PlayingState.Stopped) return;
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    await this.setParagraphIndex(0);

    const currentParagraph = await this.getCurrentParagraph();
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
    await this.playerControl.moveToNextPage();
    await this.handleLocationChanged();
  };
  private moveToPreviousPage = async () => {
    await this.playerControl.moveToPreviousPage();
    await this.handleLocationChanged();
  };
  private updateParagaph = async (index: number) => {
    // bounds checks
    if (index < 0) {
      await this.moveToPreviousPage();
      return;
    }
    console.log(`>>> Player: updateParagaph`, {
      index,
      paragraphsLength: (await this.playerControl.getCurrentViewParagraphs())
        .length,
    });
    if (index >= (await this.playerControl.getCurrentViewParagraphs()).length) {
      await this.moveToNextPage();
      return;
    }
    if (
      index ==
      (await this.playerControl.getCurrentViewParagraphs()).length - 1
    ) {
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

    await this.setParagraphIndex(index);

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

  public async getDetailedErrorInfo() {
    const currentParagraph = await this.getCurrentParagraph();
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
        totalParagraphs: (await this.playerControl.getCurrentViewParagraphs())
          .length,
        currentParagraph: currentParagraph
          ? {
              text: currentParagraph?.text.substring(0, 100) + "...",
              cfiRange: currentParagraph?.index,
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

  private highlightParagraph(paragraph: ParagraphWithIndex) {
    return this.playerControl.highlightParagraph(paragraph.index);
  }
  private async unhighlightParagraph(paragraph: ParagraphWithIndex) {
    return await this.playerControl.removeHighlight(paragraph.index);
  }
  public async requestAudio(
    paragraph: ParagraphWithIndex,
    priority: number,
    skipCache = false
  ) {
    console.log(">>> Player: Request audio", {
      paragraphIndex: this.currentParagraphIndex,
      cfiRange: paragraph.index,
      textPreview: paragraph.text.substring(0, 50) + "...",
      priority,
    });

    if (skipCache === false) {
      if (!paragraph.text.trim()) {
        console.log(">>> Player: Empty paragraph text, skipping audio request");
        return null;
      }

      const cached = this.audioCache.get(paragraph.index);
      if (cached) {
        console.log(">>> Player: Using memory cached audio", { cached });
        return cached;
      }

      // Check disk cache via direct API call
      try {
        const diskCached = await getTTSAudioPath(this.bookId, paragraph.index);
        console.log(">>> Player: Disk cache result", {
          diskCached,
          exists: !!diskCached,
        });

        if (diskCached) {
          this.addToAudioCache(paragraph.index, diskCached);
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
            cfiRange: paragraph.index,
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
        paragraph.index,
        paragraph.text,
        priority
      );

      console.log(">>> Player: Received audio path from TTS service", {
        audioPath,
        cfiRange: paragraph.index,
      });

      // Update cache
      this.addToAudioCache(paragraph.index, audioPath);
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
          cfiRange: paragraph.index,
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
      if (
        index < (await this.playerControl.getCurrentViewParagraphs()).length &&
        index >= 0
      ) {
        const paragraph = (await this.playerControl.getCurrentViewParagraphs())[
          index
        ];
        await this.requestAudio(paragraph, this.priority - 1).catch((error) => {
          console.warn(`Prefetch failed for paragraph ${index}:`, error);
        }); // Fix: Add error logging for prefetch failures
      }
    }
  }
}
