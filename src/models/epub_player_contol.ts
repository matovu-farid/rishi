import {
  ParagraphWithIndex,
  PlayerControlEvent,
  PlayerControlEventMap,
  PlayerControlInterface,
} from "./player_control";

import type Rendition from "epubjs/types/rendition";

// @ts-ignore

import {
  getCurrentViewParagraphs,
  getNextViewParagraphs,
  getPreviousViewParagraphs,
  highlightRange,
  removeHighlight,
} from "@/epubwrapper";
import { EventEmitter } from "eventemitter3";

export class EpubPlayerControl
  extends EventEmitter<PlayerControlEventMap>
  implements PlayerControlInterface
{
  private rendition: Rendition;

  constructor({ rendition }: { rendition: Rendition }) {
    super();
    this.rendition = rendition;
    void this.initialize();
  }
  async initialize(): Promise<void> {
    this.on(PlayerControlEvent.HIGHLIGHT_PARAGRAPH, async (index: string) => {
      await this.highlightParagraph(index);
    });
    this.on(PlayerControlEvent.REMOVE_HIGHLIGHT, async (index: string) => {
      await this.removeHighlight(index);
    });
    this.on(PlayerControlEvent.MOVE_TO_NEXT_PAGE, async () => {
      await this.moveToNextPage();
      this.emit(
        PlayerControlEvent.PAGE_CHANGED,
        this.rendition.currentLocation().cfi
      );
    });
    this.on(PlayerControlEvent.MOVE_TO_PREVIOUS_PAGE, async () => {
      await this.moveToPreviousPage();
      this.emit(
        PlayerControlEvent.PAGE_CHANGED,
        this.rendition.currentLocation().cfi
      );
    });
    this.rendition.on("rendered", async () => {
      const currentViewParagraphs = await this.getCurrentViewParagraphs();
      this.emit(
        PlayerControlEvent.NEW_PARAGRAPHS_AVAILABLE,
        currentViewParagraphs
      );
      const nextViewParagraphs = await this.getNextViewParagraphs();
      this.emit(
        PlayerControlEvent.NEXT_VIEW_PARAGRAPHS_AVAILABLE,
        nextViewParagraphs
      );
      const previousViewParagraphs = await this.getPreviousViewParagraphs();
      this.emit(
        PlayerControlEvent.PREVIOUS_VIEW_PARAGRAPHS_AVAILABLE,
        previousViewParagraphs
      );
    });
  }
  async highlightParagraph(index: string): Promise<void> {
    await highlightRange(this.rendition, index);
  }

  async getCurrentViewParagraphs(): Promise<ParagraphWithIndex[]> {
    return getCurrentViewParagraphs(this.rendition).map((paragraph) => ({
      text: paragraph.text,
      index: paragraph.cfiRange,
    }));
  }
  async getNextViewParagraphs(): Promise<ParagraphWithIndex[]> {
    return (await getNextViewParagraphs(this.rendition)).map((paragraph) => ({
      text: paragraph.text,
      index: paragraph.cfiRange,
    }));
  }
  async getPreviousViewParagraphs(): Promise<ParagraphWithIndex[]> {
    return (await getPreviousViewParagraphs(this.rendition)).map(
      (paragraph) => ({
        text: paragraph.text,
        index: paragraph.cfiRange,
      })
    );
  }
  async removeHighlight(index: string): Promise<void> {
    await removeHighlight(this.rendition, index);
  }
  async moveToNextPage(): Promise<void> {
    await this.rendition.next();
  }
  async moveToPreviousPage(): Promise<void> {
    await this.rendition.prev();
  }
}
