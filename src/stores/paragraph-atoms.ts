import { ParagraphWithIndex } from "@/models/player_control";

import { atomWithImmer } from "jotai-immer";
import { atom } from "jotai";
import { updateBookLocation } from "@/modules/books";

export const currentParagraphAtom = atom<ParagraphWithIndex>({
  index: "",
  text: "",
});
export type Paragraph = ParagraphWithIndex & {
  dimensions: {
    top: number;
    bottom: number;
  };
};
export const pageNumberAtom = atom(1);
export const isDualPageAtom = atom(true);
export const currentViewPagesAtom = atom<number[]>([]);
export const previousViewPagesAtom = atom<number[]>([]);
export const nextViewPagesAtom = atom<number[]>([]);
export const pageCountAtom = atom(0);
export const paragraphsAtom = atomWithImmer<{
  [pageNumber: number]: Paragraph[];
}>({});

export const getCurrentViewParagraphsAtom = atom((get) => {
  return get(currentViewPagesAtom)
    .map((pageNumber) => get(paragraphsAtom)[pageNumber])
    .flat();
});

export const highlightedParagraphArrayIndexAtom = atom(0);
export const isHighlightingAtom = atom(false);
export const highlightedParagraphGlobalIndexAtom = atom(
  (get) => {
    return get(getCurrentViewParagraphsAtom)[
      get(highlightedParagraphArrayIndexAtom)
    ].index;
  },
  (get, set, newGlobalIndex: string) => {
    const currentViewParagraphs = get(getCurrentViewParagraphsAtom);
    const newArrayIndex = currentViewParagraphs.findIndex(
      (paragraph) => paragraph.index === newGlobalIndex
    );

    if (newArrayIndex !== -1) {
      set(highlightedParagraphArrayIndexAtom, newArrayIndex);
      set(isHighlightingAtom, true);
    } else {
      set(isHighlightingAtom, false);
    }
  }
);

export const highlightedParagraphAtom = atom((get) => {
  return get(getCurrentViewParagraphsAtom)[
    get(highlightedParagraphArrayIndexAtom)
  ];
});


export const highlightedPageAtom = atom((get) => {
  const highlightedParagraph = get(highlightedParagraphAtom);
  const paragraphs = get(paragraphsAtom);
  const hasParagraph = (paragraphs: ParagraphWithIndex[]) =>
    paragraphs.some(
      (paragraph) => paragraph.index === highlightedParagraph.index
    );
  const pageNumber = Object.entries(paragraphs)
    .filter(([_, paragraphs]) => hasParagraph(paragraphs))
    .map(([pageNumber, _]) => parseInt(pageNumber));
  if (pageNumber.length === 0) {
    if (get(currentViewPagesAtom).length > 0) {
      return get(currentViewPagesAtom)[0];
    }
    return 1;
  }
  return pageNumber[0];
});

export const getNextViewParagraphsAtom = atom((get) => {
  return get(nextViewPagesAtom)
    .map((pageNumber) => get(paragraphsAtom)[pageNumber])
    .flat();
});
export const getPreviousViewParagraphsAtom = atom((get) => {
  return get(previousViewPagesAtom)
    .map((pageNumber) => get(paragraphsAtom)[pageNumber])
    .flat();
});

export const setParagraphsAtom = atom(
  null,
  (get, set, pageNumber: number, newParagraphs: Paragraph[]) => {
    set(paragraphsAtom, {
      ...get(paragraphsAtom),
      [pageNumber]: newParagraphs,
    });
  }
);
export const changePageAtom = atom(
  null,
  async (get, set, offset: number, bookId: string) => {
    const newPageNumber = get(pageNumberAtom) + offset;
    const numPages = get(pageCountAtom);
    if (newPageNumber >= 1 && newPageNumber <= numPages) {
      set(pageNumberAtom, newPageNumber);
      await updateBookLocation(bookId, newPageNumber.toString());
    }
  }
);
export const pageIncrementAtom = atom((get) => {
  return get(isDualPageAtom) ? 2 : 1;
});

export const previousPageAtom = atom(null, async (get, set, bookId: string) => {
  const pageIncrement = get(pageIncrementAtom);
  await set(changePageAtom, -pageIncrement, bookId);
});
export const nextPageAtom = atom(null, async (get, set, bookId: string) => {
  const pageIncrement = get(pageIncrementAtom);
  await set(changePageAtom, pageIncrement, bookId);
});
export const renderedAtom = atom(false);
const isRenderedPageStateAtom = atom<{ [pageNumber: number]: boolean }>({});
export const isRenderedPageAtom = atom(
  (get) => {
    const state = get(isRenderedPageStateAtom);
    return get(currentViewPagesAtom).reduce(
      (acc, pageNumber) => {
        acc[pageNumber] = state[pageNumber] ?? false;
        return acc;
      },
      {} as { [pageNumber: number]: boolean }
    );
  },
  (get, set, pageNumber: number, isRendered: boolean) => {
    const current = get(isRenderedPageStateAtom);
    set(isRenderedPageStateAtom, {
      ...current,
      [pageNumber]: isRendered,
    });
  }
);
export const isRenderedAtom = atom((get) => {
  return get(currentViewPagesAtom)
    .map((pageNumber) => get(isRenderedPageAtom)[pageNumber])
    .every((rendered) => rendered);
});

// debug label
highlightedParagraphArrayIndexAtom.debugLabel =
  "highlightedParagraphArrayIndexAtom";
currentParagraphAtom.debugLabel = "currentParagraphAtom";
pageNumberAtom.debugLabel = "pageNumberAtom";
isDualPageAtom.debugLabel = "isDualPageAtom";
currentViewPagesAtom.debugLabel = "currentViewPagesAtom";
previousViewPagesAtom.debugLabel = "previousViewPagesAtom";
nextViewPagesAtom.debugLabel = "nextViewPagesAtom";
pageCountAtom.debugLabel = "pageCountAtom";
paragraphsAtom.debugLabel = "paragraphsAtom";
getCurrentViewParagraphsAtom.debugLabel = "getCurrentViewParagraphsAtom";
getNextViewParagraphsAtom.debugLabel = "getNextViewParagraphsAtom";
getPreviousViewParagraphsAtom.debugLabel = "getPreviousViewParagraphsAtom";
setParagraphsAtom.debugLabel = "setParagraphsAtom";
isHighlightingAtom.debugLabel = "isHighlightingAtom";
highlightedParagraphGlobalIndexAtom.debugLabel =
  "highlightedParagraphGlobaolIndexAtom";
highlightedParagraphAtom.debugLabel = "highlightedParagraphAtom";
highlightedPageAtom.debugLabel = "highlightedPageAtom";
changePageAtom.debugLabel = "changePageAtom";
pageIncrementAtom.debugLabel = "pageIncrementAtom";
previousPageAtom.debugLabel = "previousPageAtom";
nextPageAtom.debugLabel = "nextPageAtom";
renderedAtom.debugLabel = "renderedAtom";
isRenderedPageStateAtom.debugLabel = "isRenderedPageStateAtom";
isRenderedPageAtom.debugLabel = "isRenderedPageAtom";
isRenderedAtom.debugLabel = "isRenderedAtom";
