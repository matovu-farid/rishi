import { atom } from "jotai";
import type Rendition from "epubjs/types/rendition";
import {
  getCurrentViewParagraphs,
  getNextViewParagraphs,
  getPreviousViewParagraphs,
} from "@/epubwrapper";
import { ParagraphWithIndex } from "@/models/player_control";
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

export const getEpubNextViewParagraphsAtom = atom(async (get) => {
  // Depend on version to trigger refetch

  const rendition = get(renditionAtom);
  get(currentEpubLocationAtom);
  if (rendition) {
    return await getNextViewParagraphs(rendition).then((paragraphs) =>
      paragraphs.map((paragraph) => ({
        text: paragraph.text,
        index: paragraph.cfiRange,
      }))
    );
  }
  return [] as ParagraphWithIndex[];
});
getEpubNextViewParagraphsAtom.debugLabel = "getEpubNextViewParagraphsAtom";

export const getEpubPreviousViewParagraphsAtom = atom(async (get) => {
  // Depend on version to trigger refetch

  const rendition = get(renditionAtom);
  get(currentEpubLocationAtom);
  if (rendition) {
    return await getPreviousViewParagraphs(rendition).then((paragraphs) =>
      paragraphs.map((paragraph) => ({
        text: paragraph.text,
        index: paragraph.cfiRange,
      }))
    );
  }
  return [] as ParagraphWithIndex[];
});
getEpubPreviousViewParagraphsAtom.debugLabel =
  "getEpubPreviousViewParagraphsAtom";
