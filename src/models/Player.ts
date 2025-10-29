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
  private handleError = (e: ErrorEvent) => {
    console.error("Audio error:", e);
    this.errors.push("Audio playback failed");

    this.setPlayingState(PlayingState.Stopped);
  };
  private getCurrentParagraph() {
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

  public async play() {
    if (this.playingState === PlayingState.Playing) return;
    this.setPlayingState(PlayingState.Playing);

    if (this.paragraphs.length === 0) {
      console.error("🎵 No paragraphs available");
      this.errors.push("No paragraphs available to play");
      return;
    }

    const currentParagraph = this.getCurrentParagraph();
    if (!currentParagraph) {
      console.error("🎵 No current paragraph available");
      this.errors.push("No current paragraph available to play");
      return;
    }
    // Highlight current paragraph and store reference

    await this.highlightParagraph(currentParagraph);

    // Request audio with high priority

    const audioPath = await this.requestAudio(
      currentParagraph,
      this.getNextPriority()
    );

    if (!audioPath) {
      console.error("🎵 Failed to get audio path");
      this.errors.push("Failed to request audio");
      return;
    }

    this.audioElement.pause();
    this.audioElement.currentTime = 0;

    // Set new source and wait for it to be ready
    this.audioElement.src = convertFileSrc(audioPath);
    this.audioElement.load();

    try {
      await new Promise((resolve, reject) => {
        const handleCanPlay = () => {
          this.audioElement?.removeEventListener(
            "canplaythrough",
            handleCanPlay
          );
          this.audioElement?.removeEventListener("error", handleError);
          resolve(undefined);
        };
        const handleError = (e: Event) => {
          console.error("🎵 Audio load error:", e);
          this.audioElement?.removeEventListener(
            "canplaythrough",
            handleCanPlay
          );
          this.audioElement?.removeEventListener("error", handleError);
          reject(e);
        };
        this.audioElement?.addEventListener("canplaythrough", handleCanPlay, {
          once: true,
        });
        this.audioElement?.addEventListener("error", handleError, {
          once: true,
        });
      });

      await this.audioElement.play();
      this.setPlayingState(PlayingState.Playing);

      // Prefetch next paragraphs

      void this.prefetchAudio(this.currentParagraphIndex + 1, 3);
      void this.prefetchAudio(this.currentParagraphIndex - 3, 3);
    } catch (error) {
      console.log("🎵 Playback failed:", error);
      this.errors.push(
        `Playback failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      this.setPlayingState(PlayingState.Stopped);
    }
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
  private async requestAudio(paragraph: ParagraphWithCFI, priority: number) {
    console.log(">>> Player: Request audio");
    if (!paragraph.text.trim()) return null;

    // Check Zustand cache first
    const cached = this.audioCache.get(paragraph.cfiRange);
    if (cached) return cached;

    // Check disk cache via direct API call
    try {
      const diskCached = await getTTSAudioPath(this.bookId, paragraph.cfiRange);
      console.log(">>> Player: Disk cached audio");
      console.log({ diskCached });
      if (diskCached) {
        this.addToAudioCache(paragraph.cfiRange, diskCached);
        return diskCached;
      }
    } catch (error) {
      console.log(">>> Player: Cache check failed:", error);
    }

    // Request new audio via React Query mutation
    console.log(">>> Player: Request audio");

    const audioPath = await requestTTSAudio(
      this.bookId,
      paragraph.cfiRange,
      paragraph.text,
      priority
    );

    console.log(">>> Player: Requested audio");
    console.log({ audioPath });

    // Update cache
    this.addToAudioCache(paragraph.cfiRange, audioPath);

    return audioPath;
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
