import { ParagraphWithIndex, PlayerControlInterface } from "./player_control";

import type Rendition from "epubjs/types/rendition";

// @ts-ignore
import { EVENTS } from "epubjs/src/utils/constants";

import {
  getCurrentViewParagraphs,
  getNextViewParagraphs,
  getPreviousViewParagraphs,
  highlightRange,
  removeHighlight,
} from "@/epubwrapper";
export class EpubPlayerControl implements PlayerControlInterface {
  private rendition: Rendition;

  constructor({ rendition }: { rendition: Rendition }) {
    this.rendition = rendition;

    // this.rendition.once(EVENTS.RENDITION.RENDERED, () => {
    //   //   this.audioElement = new Audio();
    //   //   this.audioElement.addEventListener("ended", this.handleEnded);
    //   //   this.audioElement.addEventListener("error", this.handleError);
    //   onRender();
    // });
    // this.rendition.on(EVENTS.RENDITION.LOCATION_CHANGED, () => {
    //   void onLocationChanged();
    // });
  }
  async highlightParagraph(index: string): Promise<void> {
    await highlightRange(this.rendition, index);
  }
  onRender(callback: () => void): void {
    this.rendition.on(EVENTS.RENDITION.RENDERED, () => {
      callback();
    });
  }
  onLocationChanged(callback: () => void): void {
    this.rendition.on(EVENTS.RENDITION.LOCATION_CHANGED, () => {
      callback();
    });
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
