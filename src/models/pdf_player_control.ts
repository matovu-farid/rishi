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

class PdfPlayerControl
  extends EventEmitter<PlayerControlEventMap>
  implements PlayerControlInterface
{
  private unsubscribePageNumber: (() => void) | null = null;
  private unsubscribeCurrentViewParagraphs: (() => void) | null = null;
  private unsubscribeNextViewParagraphs: (() => void) | null = null;
  private unsubscribePreviousViewParagraphs: (() => void) | null = null;
  private currentlyHighlightedParagraphIndex: string | null = null;

  constructor() {
    super();
    void this.initialize();
  }

  async initialize(): Promise<void> {
    // Store unsubscribe functions for all subscriptions
    // Note: customStore.sub() returns an unsubscribe function in Jotai
    this.unsubscribePageNumber = customStore.sub(pageNumberAtom, () => {
      this.emit(PlayerControlEvent.PAGE_CHANGED);
    });

    this.unsubscribeCurrentViewParagraphs = customStore.sub(
      getCurrentViewParagraphsAtom,
      () => {
        this.emit(
          PlayerControlEvent.NEW_PARAGRAPHS_AVAILABLE,
          customStore.get(getCurrentViewParagraphsAtom)
        );
      }
    );

    this.unsubscribeNextViewParagraphs = customStore.sub(
      getNextViewParagraphsAtom,
      () => {
        this.emit(
          PlayerControlEvent.NEXT_VIEW_PARAGRAPHS_AVAILABLE,
          customStore.get(getNextViewParagraphsAtom)
        );
      }
    );

    this.unsubscribePreviousViewParagraphs = customStore.sub(
      getPreviousViewParagraphsAtom,
      () => {
        this.emit(
          PlayerControlEvent.PREVIOUS_VIEW_PARAGRAPHS_AVAILABLE,
          customStore.get(getPreviousViewParagraphsAtom)
        );
      }
    );

    // Register event handlers (only called once in constructor, so no need to clean up old ones)
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

  async removeHighlight(index: string): Promise<void> {
    customStore.set(isHighlightingAtom, false);
    if (this.currentlyHighlightedParagraphIndex === index) {
      this.currentlyHighlightedParagraphIndex = null;
    }
  }

  async highlightParagraph(index: string): Promise<void> {
    // Track currently highlighted paragraph to prevent duplicates
    if (this.currentlyHighlightedParagraphIndex === index) {
      return;
    }
    this.currentlyHighlightedParagraphIndex = index;
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

  cleanup(): void {
    // Unsubscribe from all atom subscriptions
    if (this.unsubscribePageNumber) {
      this.unsubscribePageNumber();
      this.unsubscribePageNumber = null;
    }

    if (this.unsubscribeCurrentViewParagraphs) {
      this.unsubscribeCurrentViewParagraphs();
      this.unsubscribeCurrentViewParagraphs = null;
    }

    if (this.unsubscribeNextViewParagraphs) {
      this.unsubscribeNextViewParagraphs();
      this.unsubscribeNextViewParagraphs = null;
    }

    if (this.unsubscribePreviousViewParagraphs) {
      this.unsubscribePreviousViewParagraphs();
      this.unsubscribePreviousViewParagraphs = null;
    }

    // Only remove listeners that this class registered, not all listeners
    // We need to be careful not to remove listeners added by other classes (like Player)
    // Since initialize() is only called once in constructor, we don't need to remove these
    // unless we're doing a full cleanup/teardown

    // Clear current highlight state
    if (this.currentlyHighlightedParagraphIndex) {
      customStore.set(isHighlightingAtom, false);
      this.currentlyHighlightedParagraphIndex = null;
    }
  }
}

export const playerControl = new PdfPlayerControl();
