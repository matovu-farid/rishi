import { customStore } from "@/stores/jotai";
import {
  ParagraphWithIndex,
  PlayerControlEvent,
  PlayerControlEventMap,
  PlayerControlInterface,
} from "./player_control";
import {
  currentBookDataAtom,
  getCurrentViewParagraphsAtom,
  getNextViewParagraphsAtom,
  getPreviousViewParagraphsAtom,
  highlightedParagraphGlobalIndexAtom,
  isHighlightingAtom,
  nextPageAtom,
  pageNumberAtom,
  previousPageAtom,
} from "@/stores/paragraph-atoms";
import { EventEmitter } from "eventemitter3";

//TODO: Implement the methods
class PdfPlayerControl
  extends EventEmitter<PlayerControlEventMap>
  implements PlayerControlInterface
{
  constructor() {
    super();
    void this.initialize();
  }
  async initialize(): Promise<void> {
    customStore.sub(pageNumberAtom, () => {
      this.emit(PlayerControlEvent.PAGE_CHANGED);
    });
    customStore.sub(getCurrentViewParagraphsAtom, () => {
      this.emit(
        PlayerControlEvent.NEW_PARAGRAPHS_AVAILABLE,
        customStore.get(getCurrentViewParagraphsAtom)
      );
    });

    customStore.sub(getNextViewParagraphsAtom, () => {
      this.emit(
        PlayerControlEvent.NEXT_VIEW_PARAGRAPHS_AVAILABLE,
        customStore.get(getNextViewParagraphsAtom)
      );
    });
    customStore.sub(getPreviousViewParagraphsAtom, () => {
      this.emit(
        PlayerControlEvent.PREVIOUS_VIEW_PARAGRAPHS_AVAILABLE,
        customStore.get(getPreviousViewParagraphsAtom)
      );
    });
    // listen
    this.on(PlayerControlEvent.REMOVE_HIGHLIGHT, (index: string) => {
      void this.removeHighlight(index);
    });
    this.on(PlayerControlEvent.HIGHLIGHT_PARAGRAPH, (index: string) => {
      void this.highlightParagraph(index);
    });
    this.on(PlayerControlEvent.MOVE_TO_NEXT_PAGE, () => {
      void this.moveToNextPage();
      this.emit(PlayerControlEvent.PAGE_CHANGED);
    });
    this.on(PlayerControlEvent.MOVE_TO_PREVIOUS_PAGE, () => {
      void this.moveToPreviousPage();
      this.emit(PlayerControlEvent.PAGE_CHANGED);
    });
  }
  // async getCurrentViewParagraphs(): Promise<ParagraphWithIndex[]> {
  //   const currentViewParagraphs = customStore.get(getCurrentViewParagraphsAtom);

  //   return currentViewParagraphs;
  // }
  // async getNextViewParagraphs(): Promise<ParagraphWithIndex[]> {
  //   return customStore.get(getNextViewParagraphsAtom);
  // }
  // async getPreviousViewParagraphs(): Promise<ParagraphWithIndex[]> {
  //   return customStore.get(getPreviousViewParagraphsAtom);
  // }
  async removeHighlight(index: string): Promise<void> {
    customStore.set(isHighlightingAtom, false);
  }
  async highlightParagraph(index: string): Promise<void> {
    return customStore.set(highlightedParagraphGlobalIndexAtom, index);
  }
  async moveToNextPage() {
    const book = customStore.get(currentBookDataAtom);
    if (book) await customStore.set(nextPageAtom, book.id);
  }
  async moveToPreviousPage() {
    const book = customStore.get(currentBookDataAtom);
    if (book) await customStore.set(previousPageAtom, book.id);
  }
}

export const playerControl = new PdfPlayerControl();
