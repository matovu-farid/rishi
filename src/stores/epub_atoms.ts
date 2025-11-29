import { atom } from "jotai";
import type Rendition from "epubjs/types/rendition";
import {
  getCurrentViewParagraphs,
  getNextViewParagraphs,
  getPreviousViewParagraphs,
} from "@/epubwrapper";
import { ParagraphWithIndex } from "@/models/player_control";
import { observe } from "jotai-effect";
import { customStore } from "./jotai";
import { eventBus, EventBusEvent } from "@/utils/bus";
import { loadable } from "jotai/utils";
export const renditionAtom = atom<Rendition | null>(null);
renditionAtom.debugLabel = "renditionAtom";

export const currentEpubLocationAtom = atom<string>("");
currentEpubLocationAtom.debugLabel = "currentEpubLocationAtom";

// Write-only atoms to trigger refetch (increment version)

export const getEpubCurrentViewParagraphsAtom = atom(async (get) => {
  // Depend on the version - when it changes, this will refetch
  const rendition = get(renditionAtom);
  get(currentEpubLocationAtom);

  if (rendition) {
    const paragraphs = getCurrentViewParagraphs(rendition);
    return paragraphs.map((paragraph) => ({
      text: paragraph.text,
      index: paragraph.cfiRange,
    }));
  }
  return [] as ParagraphWithIndex[];
});
getEpubCurrentViewParagraphsAtom.debugLabel =
  "getEpubCurrentViewParagraphsAtom";
observe((get) => {
  void get(getEpubCurrentViewParagraphsAtom).then((paragraphs) => {
    eventBus.publish(EventBusEvent.NEW_PARAGRAPHS_AVAILABLE, paragraphs);
  });
}, customStore);
export const getEpubNextViewParagraphsAtom = atom(async (get) => {
  // Depend on version to trigger refetch

  const rendition = get(renditionAtom);
  get(currentEpubLocationAtom);
  if (rendition) {
    return getNextViewParagraphs(rendition).map((paragraph) => ({
      text: paragraph.text,
      index: paragraph.cfiRange,
    }));
  }
  return [] as ParagraphWithIndex[];
});
getEpubNextViewParagraphsAtom.debugLabel = "getEpubNextViewParagraphsAtom";
// observe((get) => {
//   void get(getEpubNextViewParagraphsAtom).then((paragraphs) => {
//     eventBus.publish(EventBusEvent.NEXT_VIEW_PARAGRAPHS_AVAILABLE, paragraphs);
//   });
// }, customStore);
export const getEpubPreviousViewParagraphsAtom = atom(async (get) => {
  // Depend on version to trigger refetch

  const rendition = get(renditionAtom);
  get(currentEpubLocationAtom);
  if (rendition) {
    return getPreviousViewParagraphs(rendition).map((paragraph) => ({
      text: paragraph.text,
      index: paragraph.cfiRange,
    }));
  }
  return [] as ParagraphWithIndex[];
});
getEpubPreviousViewParagraphsAtom.debugLabel =
  "getEpubPreviousViewParagraphsAtom";
export const loadableEpubNextViewParagraphsAtom = loadable(
  getEpubNextViewParagraphsAtom
);
loadableEpubNextViewParagraphsAtom.debugLabel =
  "loadableEpubNextViewParagraphsAtom";
observe((get) => {
  const loadableEpubNextViewParagraphs = get(
    loadableEpubNextViewParagraphsAtom
  );
  if (loadableEpubNextViewParagraphs.state === "hasData") {
    eventBus.publish(
      EventBusEvent.NEXT_VIEW_PARAGRAPHS_AVAILABLE,
      loadableEpubNextViewParagraphs.data
    );
  }
}, customStore);

const loadableEpubPreviousViewParagraphsAtom = loadable(
  getEpubPreviousViewParagraphsAtom
);
loadableEpubPreviousViewParagraphsAtom.debugLabel =
  "loadableEpubPreviousViewParagraphsAtom";
observe((get) => {
  const loadableEpubPreviousViewParagraphs = get(
    loadableEpubPreviousViewParagraphsAtom
  );
  if (loadableEpubPreviousViewParagraphs.state === "hasData") {
    eventBus.publish(
      EventBusEvent.PREVIOUS_VIEW_PARAGRAPHS_AVAILABLE,
      loadableEpubPreviousViewParagraphs.data
    );
  }
}, customStore);
