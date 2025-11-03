import { customStore } from "@/stores/jotai";
import { ParagraphWithIndex, PlayerControlInterface } from "./player_control";
import {
  getCurrentViewParagraphsAtom,
  getNextViewParagraphsAtom,
  getPreviousViewParagraphsAtom,
  highlightedParagraphGlobalIndexAtom,
  isHighlightingAtom,
  isRenderedAtom,
  nextPageAtom,
  pageNumberAtom,
  previousPageAtom,
} from "@/stores/paragraph-atoms";

//TODO: Implement the methods
export class PdfPlayerControl implements PlayerControlInterface {
  private bookId: string;
  constructor(bookId: string) {
    this.bookId = bookId;
  }
  async waitUntilRendered(): Promise<void> {
    return new Promise((resolve) => {
      customStore.sub(isRenderedAtom, () => {
        const isRendered = customStore.get(isRenderedAtom);
        if (isRendered) {
          resolve();
        }
      });
    });
  }
  async getCurrentViewParagraphs(): Promise<ParagraphWithIndex[]> {
    await this.waitUntilRendered();
    const currentViewParagraphs = customStore.get(getCurrentViewParagraphsAtom);
    console.log({ currentViewParagraphs });

    return currentViewParagraphs;
  }
  async getNextViewParagraphs(): Promise<ParagraphWithIndex[]> {
    await this.waitUntilRendered();
    return customStore.get(getNextViewParagraphsAtom);
  }
  async getPreviousViewParagraphs(): Promise<ParagraphWithIndex[]> {
    await this.waitUntilRendered();
    return customStore.get(getPreviousViewParagraphsAtom);
  }
  async removeHighlight(index: string): Promise<void> {
    return customStore.set(isHighlightingAtom, false);
  }
  async highlightParagraph(index: string): Promise<void> {
    return customStore.set(highlightedParagraphGlobalIndexAtom, index);
  }
  async moveToNextPage() {
    await customStore.set(nextPageAtom, this.bookId);
  }
  async moveToPreviousPage() {
    await customStore.set(previousPageAtom, this.bookId);
  }
  onRender(callback: () => void) {
    customStore.sub(isRenderedAtom, callback);
  }
  onLocationChanged(callback: () => void) {
    customStore.sub(pageNumberAtom, callback);
  }
}
