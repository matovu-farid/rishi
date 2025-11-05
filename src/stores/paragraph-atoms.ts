import { ParagraphWithIndex } from "@/models/player_control";

import { atomWithImmer } from "jotai-immer";
import { atom } from "jotai";
import { updateBookLocation } from "@/modules/books";
import { BookData } from "@/generated";

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

export const currentBookDataAtom = atomWithImmer<BookData | null>(null);

export const pageNumberAtom = atom(
  (get) => {
    try {
      // block when no page data yet
      const book = get(currentBookDataAtom);
      if (book) {
        const pageNumber = parseInt(book.current_location, 10);
        if (isNaN(pageNumber) || pageNumber < 1) {
          return 1;
        }
        return pageNumber;
      }
    } catch (error) {
      console.error("Error getting page number:", error);
    }
    return 1;
  },
  (get, set, newPageNumber: number) => {
    const book = get(currentBookDataAtom);
    if (book) {
      // Use Immer draft updater for atomWithImmer
      set(currentBookDataAtom, (draft) => {
        if (draft) {
          draft.current_location = newPageNumber.toString();
        }
      });
    }
  }
);
export const isDualPageAtom = atom(false);
export const currentViewPagesAtom = atom<number[]>((get) => {
  const pageNumber = get(pageNumberAtom);
  const isDualPage = get(isDualPageAtom);
  if (isDualPage) {
    return [pageNumber, pageNumber + 1];
  }
  return [pageNumber];
});
export const previousViewPagesAtom = atom<number[]>((get) => {
  const pageNumber = get(pageNumberAtom);
  const isDualPage = get(isDualPageAtom);
  if (isDualPage) {
    return [pageNumber - 1, pageNumber - 2];
  }
  return [pageNumber - 1];
});
export const nextViewPagesAtom = atom<number[]>((get) => {
  const pageNumber = get(pageNumberAtom);
  const isDualPage = get(isDualPageAtom);
  if (isDualPage) {
    return [pageNumber + 2, pageNumber + 3];
  }
  return [pageNumber + 1];
});
export const pageCountAtom = atom(0);

export const paragraphsAtom = atomWithImmer<{
  [pageNumber: number]: Paragraph[];
}>({});

export const resetParaphStateAtom = atom(null, (_get, set) => {
  set(pageNumberAtom, 1);
  set(isDualPageAtom, false);
  set(pageCountAtom, 0);
  set(paragraphsAtom, {});
  set(highlightedParagraphArrayIndexAtom, 0);
  set(highlightedParagraphGlobalIndexAtom, "");
  set(isHighlightingAtom, false);
  set(isRenderedPageStateAtom, {});
});
export const getCurrentViewParagraphsAtom = atom((get) => {
  const paragraphs = get(currentViewPagesAtom)
    .map((pageNumber) => get(paragraphsAtom)[pageNumber])
    .flat()
    .filter((p): p is Paragraph => p !== undefined);

  // Deduplicate by index, keeping the first occurrence as a safety measure
  const seen = new Set<string>();
  return paragraphs.filter((paragraph) => {
    if (seen.has(paragraph.index)) {
      return false;
    }
    seen.add(paragraph.index);
    return true;
  });
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
  const paragraphs = get(nextViewPagesAtom)
    .map((pageNumber) => get(paragraphsAtom)[pageNumber])
    .flat()
    .filter((p): p is Paragraph => p !== undefined);

  // Deduplicate by index, keeping the first occurrence as a safety measure
  const seen = new Set<string>();
  return paragraphs.filter((paragraph) => {
    if (seen.has(paragraph.index)) {
      return false;
    }
    seen.add(paragraph.index);
    return true;
  });
});
export const getPreviousViewParagraphsAtom = atom((get) => {
  const paragraphs = get(previousViewPagesAtom)
    .map((pageNumber) => get(paragraphsAtom)[pageNumber])
    .flat()
    .filter((p): p is Paragraph => p !== undefined);

  // Deduplicate by index, keeping the first occurrence as a safety measure
  const seen = new Set<string>();
  return paragraphs.filter((paragraph) => {
    if (seen.has(paragraph.index)) {
      return false;
    }
    seen.add(paragraph.index);
    return true;
  });
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
    set(isRenderedPageStateAtom, {});
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
currentBookDataAtom.debugLabel = "currentBookDataAtom";
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
isRenderedPageStateAtom.debugLabel = "isRenderedPageStateAtom";
isRenderedPageAtom.debugLabel = "isRenderedPageAtom";
isRenderedAtom.debugLabel = "isRenderedAtom";
