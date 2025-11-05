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

export const getEpubCurrentViewParagraphsAtom = atom(async (get) => {
  const rendition = get(renditionAtom);
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
  const rendition = get(renditionAtom);
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
  const rendition = get(renditionAtom);
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
