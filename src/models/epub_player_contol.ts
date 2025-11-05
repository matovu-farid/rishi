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
import { customStore } from "@/stores/jotai";
import { renditionAtom } from "@/stores/epub_atoms";

class EpubPlayerControl
  extends EventEmitter<PlayerControlEventMap>
  implements PlayerControlInterface
{
  private currentlyHighlightedParagraphIndex: string | null = null;

  constructor() {
    super();
    void this.initialize();
  }
  async initialize(): Promise<void> {
    customStore.sub(renditionAtom, () => {
      const rendition = customStore.get(renditionAtom);

      if (rendition) {
        rendition.on("rendered", async () => {
          const currentViewParagraphs = await getCurrentViewParagraphs(
            rendition
          ).map((paragraph) => ({
            text: paragraph.text,
            index: paragraph.cfiRange,
          }));

          this.emit(
            PlayerControlEvent.NEW_PARAGRAPHS_AVAILABLE,
            currentViewParagraphs
          );
          const nextViewParagraphs = (
            await getNextViewParagraphs(rendition)
          ).map((paragraph) => ({
            text: paragraph.text,
            index: paragraph.cfiRange,
          }));
          this.emit(
            PlayerControlEvent.NEXT_VIEW_PARAGRAPHS_AVAILABLE,
            nextViewParagraphs
          );

          const previousViewParagraphs = (
            await getPreviousViewParagraphs(rendition)
          ).map((paragraph) => ({
            text: paragraph.text,
            index: paragraph.cfiRange,
          }));
          this.emit(
            PlayerControlEvent.PREVIOUS_VIEW_PARAGRAPHS_AVAILABLE,
            previousViewParagraphs
          );
        });
        this.on(PlayerControlEvent.MOVE_TO_NEXT_PAGE, async () => {
          await rendition.next();
          this.emit(PlayerControlEvent.PAGE_CHANGED);
        });
        this.on(PlayerControlEvent.MOVE_TO_PREVIOUS_PAGE, async () => {
          await rendition.prev();
          this.emit(PlayerControlEvent.PAGE_CHANGED);
        });
        this.on(
          PlayerControlEvent.HIGHLIGHT_PARAGRAPH,
          async (index: string) => {
            await highlightRange(rendition, index);
          }
        );
        this.on(PlayerControlEvent.REMOVE_HIGHLIGHT, async (index: string) => {
          await removeHighlight(rendition, index);
        });
      }
    });
  }
}

export const epubPlayerControl = new EpubPlayerControl();
