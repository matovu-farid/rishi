import EventEmitter from "events";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  getTTSAudioPath,
  requestTTSAudio,
} from "@/modules/ipc_handel_functions";
import {
  playerCreate,
  playerPlay,
  playerPause,
  playerResume,
  playerStop,
  playerNext,
  playerPrev,
  playerSetPage,
} from "@/reader/bridge";
import { paragraphsNext } from "@/reader/bridge";
import { ttsEnqueueAudio } from "@/reader/bridge";
import { onTtsAudioReady, onTtsError } from "@/reader/bridge";
import { convertFileSrc } from "@tauri-apps/api/core";

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

export enum RustPlayerEvent {
  PLAYING_STATE_CHANGED = "playingStateChanged",
}

export type RustPlayerEventMap = {
  [RustPlayerEvent.PLAYING_STATE_CHANGED]: [PlayingState];
};

type RustPlayerDeps = {
  bookId: string;
  getPageIndex: () => number;
  goNextPage: () => Promise<void>;
  goPrevPage: () => Promise<void>;
};

export class RustPlayer extends EventEmitter<RustPlayerEventMap> {
  private playingState: PlayingState = PlayingState.Stopped;
  private currentParagraphIndex = 0;
  private errors: string[] = [];
  private audioElement: HTMLAudioElement = new Audio();
  private direction: Direction = Direction.Forward;
  private audioCache = new Map<string, string>();
  private priority = 3;
  private voice: string | undefined;
  private rate: number | undefined;
  private deps: RustPlayerDeps;
  private unlisten: UnlistenFn | null = null;
  private unlistenTtsReady: UnlistenFn | null = null;
  private unlistenTtsError: UnlistenFn | null = null;

  constructor(deps: RustPlayerDeps) {
    super();
    this.deps = deps;
    this.audioElement.addEventListener("ended", this.handleEnded);
    this.audioElement.addEventListener("error", this.handleError);
    // Listen to Rust player paragraph events
    listen("player://play", async (evt) => {
      const payload = evt.payload as any;
      if (!payload || String(payload.book_id) !== this.deps.bookId) return;
      // Play the paragraph we just got from rust core
      try {
        // Sync UI page with Rust core if needed
        const currentPage = this.deps.getPageIndex();
        const targetPage = Number(payload.page_index ?? currentPage);
        if (!Number.isNaN(targetPage) && targetPage !== currentPage) {
          if (targetPage > currentPage) {
            await this.deps.goNextPage();
          } else {
            await this.deps.goPrevPage();
          }
        }
        const audioPath = await this.requestAudio(
          { text: payload.text, cfiRange: payload.cfi_range },
          this.getNextPriority()
        );
        if (!audioPath) throw new Error("no audio path");
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.src = convertFileSrc(audioPath);
        this.audioElement.load();
        await this.audioElement.play();
        this.setPlayingState(PlayingState.Playing);

        // Prefetch next page first paragraph audio (best-effort)
        try {
          const page = this.deps.getPageIndex();
          const nextPageParas = await paragraphsNext(
            Number(this.deps.bookId),
            page,
            50
          );
          const nextPara = nextPageParas?.[0];
          if (nextPara && nextPara.text) {
            await ttsEnqueueAudio(
              Number(this.deps.bookId),
              nextPara.cfi_range,
              nextPara.text,
              this.getPrefetchPriority()
            );
          }
        } catch {}
      } catch (e) {
        this.errors.push("Playback failed");
        this.setPlayingState(PlayingState.Stopped);
      }
    }).then((u) => (this.unlisten = u));

    // Listen for TTS worker events to warm the audio cache
    onTtsAudioReady((p) => {
      if (String(p.bookId) !== this.deps.bookId) return;
      if (!p.audioPath || !p.cfiRange) return;
      this.audioCache.set(p.cfiRange, p.audioPath);
    }).then((u) => (this.unlistenTtsReady = u));

    onTtsError((p) => {
      if (String(p.bookId) !== this.deps.bookId) return;
      this.errors.push(`TTS error: ${p.error}`);
    }).then((u) => (this.unlistenTtsError = u));
  }

  // Rust core drives paragraph selection; no local paragraph cache needed

  private handleEnded = async () => {
    try {
      await this.next();
    } catch {
      // ignore
    }
  };

  private handleError = () => {
    this.errors.push("Audio playback failed");
    this.setPlayingState(PlayingState.Stopped);
  };

  private getCurrentParagraph() {
    return null as any;
  }

  public getPlayingState() {
    return this.playingState;
  }

  public getErrors() {
    return this.errors;
  }

  public cleanup() {
    this.audioElement.removeEventListener("ended", this.handleEnded);
    this.audioElement.removeEventListener("error", this.handleError);
    this.audioElement.pause();
    this.audioElement.src = "";
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    if (this.unlistenTtsReady) {
      this.unlistenTtsReady();
      this.unlistenTtsReady = null;
    }
    if (this.unlistenTtsError) {
      this.unlistenTtsError();
      this.unlistenTtsError = null;
    }
  }

  public async play() {
    if (this.playingState === PlayingState.Playing) return;
    this.setPlayingState(PlayingState.Loading);
    await playerCreate(Number(this.deps.bookId));
    await playerSetPage(Number(this.deps.bookId), this.deps.getPageIndex());
    await playerPlay(Number(this.deps.bookId));
  }

  public pause() {
    playerPause(Number(this.deps.bookId));
    this.setPlayingState(PlayingState.Paused);
  }

  public resume() {
    if (this.playingState !== PlayingState.Paused) return;
    playerResume(Number(this.deps.bookId));
  }

  public async stop() {
    if (this.playingState === PlayingState.Stopped) return;
    await playerStop(Number(this.deps.bookId));
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.currentParagraphIndex = 0;
    this.setPlayingState(PlayingState.Stopped);
    // best-effort cancel queued TTS for this book
    try {
      const { ttsCancelAll } = await import("@/reader/bridge");
      await ttsCancelAll(Number(this.deps.bookId));
    } catch {}
  }

  public setVoice(v?: string) {
    this.voice = v;
  }
  public setRate(r?: number) {
    this.rate = r;
  }

  public async next() {
    this.direction = Direction.Forward;
    await playerNext(Number(this.deps.bookId));
  }

  public async prev() {
    this.direction = Direction.Backward;
    await playerPrev(Number(this.deps.bookId));
  }

  private setPlayingState(s: PlayingState) {
    if (this.playingState === s) return;
    this.playingState = s;
    this.emit(RustPlayerEvent.PLAYING_STATE_CHANGED, s);
  }

  private getNextPriority() {
    this.priority = this.priority + 1;
    return this.priority;
  }
  private getPrefetchPriority() {
    return this.priority - 1;
  }

  private async requestAudio(paragraph: RustParagraph, priority: number) {
    if (!paragraph.text.trim()) return null;
    const cached = this.audioCache.get(paragraph.cfiRange);
    if (cached) return cached;
    try {
      const diskCached = await getTTSAudioPath(
        this.deps.bookId,
        paragraph.cfiRange
      );
      if (diskCached) {
        this.audioCache.set(paragraph.cfiRange, diskCached);
        return diskCached;
      }
    } catch {}
    const audioPath = await requestTTSAudio(
      this.deps.bookId,
      paragraph.cfiRange,
      paragraph.text,
      priority,
      this.voice,
      this.rate
    );
    this.audioCache.set(paragraph.cfiRange, audioPath);
    return audioPath;
  }
}
