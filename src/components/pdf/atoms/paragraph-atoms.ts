import { ParagraphWithIndex } from "@/models/player_control";

import { atomWithStorage } from 'jotai/utils'
import { withImmer } from "jotai-immer";
import { atom } from "jotai";

import type { TextContent } from "react-pdf";

import { freezeAtom } from "jotai/utils";
import { customStore } from "@/stores/jotai";
import { observe } from "jotai-effect";

export const virtualizerAtom = atom<any | null>(null);

export const pageNumberToPageDataStoredAtom = atomWithStorage<{
  [pageNumber: number]: TextContent;
}>('pageNumberToPageData', {});
export const pageNumberToPageDataAtom = withImmer(pageNumberToPageDataStoredAtom)
pageNumberToPageDataAtom.debugLabel = "pageNumberToPageDataAtom";
export const setPageNumberToPageDataAtom = atom(
  null,
  (
    _,
    set,
    { pageNumber, pageData }: { pageNumber: number; pageData: TextContent }
  ) => {
    set(pageNumberToPageDataAtom, (draft) => {
      draft[pageNumber] = pageData;
    });
  }
);
setPageNumberToPageDataAtom.debugLabel = "setPageNumberToPageDataAtom";
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

export enum BookNavigationState {
  Idle,
  Navigating,
  Navigated,
}

export const bookNavigationStateAtom = atom<BookNavigationState>(
  BookNavigationState.Idle
);

const mutablePageNumberAtom = freezeAtom(atom(0));
mutablePageNumberAtom.debugLabel = "mutablePageNumberAtom";
export const pageNumberAtom = freezeAtom(
  atom((get) => get(mutablePageNumberAtom))
);

export const scrollPageNumberAtom = freezeAtom(atom(0));
scrollPageNumberAtom.debugLabel = "scrollPageNumberAtom";
// sync the scroll page number to the mutable page number
observe((get, set) => {
  const scrollPageNumber = get(scrollPageNumberAtom);
  set(mutablePageNumberAtom, scrollPageNumber);
}, customStore);
// TODO: Pull the current scroll page state before modification
export const setPageNumberAtom = freezeAtom(
  atom(null, (get, set, newPageNumber: number) => {
    const state = get(bookNavigationStateAtom);
    if (state === BookNavigationState.Navigating) {
      return;
    }
    if (state === BookNavigationState.Idle) {
      set(bookNavigationStateAtom, BookNavigationState.Navigating);
    }
    set(mutablePageNumberAtom, newPageNumber);
  })
);
export const isDualPageAtom = atom(false);
// export const currentViewPagesAtom = atom<number[]>((get) => {
//   const pageNumber = get(pageNumberAtom);
//   const isDualPage = get(isDualPageAtom);
//   if (isDualPage) {
//     return [pageNumber, pageNumber + 1];
//   }
//   return [pageNumber];
// });

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
// export const pageNumberToPageDataAtom = atomWithImmer<{
//   [pageNumber: number]: TextContent;
// }>({});
// export const setPageNumberToPageData = atom(
//   null,
//   (
//     _,
//     set,
//     { pageNumber, pageData }: { pageNumber: number; pageData: TextContent }
//   ) => {
//     set(pageNumberToPageDataAtom, (draft) => {
//       draft[pageNumber] = pageData;
//     });
//   }
// );
// export const paragraphsAtom = atom((get) => {
//   return (pageNumber: number) => {
//     const pageData = get(pageNumberToPageDataAtom)[pageNumber];
//     if (!pageData) {
//       return [];
//     }
//     return pageDataToParagraphs(pageNumber, pageData);
//   };
// });

export const resetParaphStateAtom = atom(null, (_get, set) => {
  set(isDualPageAtom, false);
  set(pageCountAtom, 0);

  set(highlightedParagraphIndexAtom, "");
  set(isHighlightingAtom, false);
  set(isRenderedPageStateAtom, {});
});
export const getCurrentViewParagraphsAtom = atom<Paragraph[]>([]);

export const isHighlightingAtom = atom(false);

export const highlightedParagraphIndexAtom = atom("");
export const highlightedParagraphAtom = atom((get) => {
  const currentViewParagraphs = get(getCurrentViewParagraphsAtom);
  const index = get(highlightedParagraphIndexAtom);
  const currentParagraph = currentViewParagraphs.find(
    (paragraph) => paragraph.index === index
  );

  return currentParagraph;
});

// export const highlightedPageAtom = atom((get) => {
//   const highlightedParagraph = get(highlightedParagraphAtom);
//   const paragraphs = get(paragraphsAtom);
//   const hasParagraph = (paragraphs: ParagraphWithIndex[]) =>
//     paragraphs.some(
//       (paragraph) => paragraph.index === highlightedParagraph?.index
//     );
//   const pageNumber = Object.entries(paragraphs)
//     .filter(([_, paragraphs]) => hasParagraph(paragraphs))
//     .map(([pageNumber, _]) => parseInt(pageNumber));
//   if (pageNumber.length === 0) {
//     if (get(currentViewPagesAtom).length > 0) {
//       return get(currentViewPagesAtom)[0];
//     }
//     return 1;
//   }
//   return pageNumber[0];
// });

export const getNextViewParagraphsAtom = atom<Paragraph[]>([]);

export const getPreviousViewParagraphsAtom = atom<Paragraph[]>([]);

export const changePageAtom = atom(null, async (get, set, offset: number) => {
  set(isRenderedPageStateAtom, {});
  const newPageNumber = get(pageNumberAtom) + offset;
  const numPages = get(pageCountAtom);
  if (newPageNumber >= 1 && newPageNumber <= numPages) {
    set(setPageNumberAtom, newPageNumber);
  }
});
export const pageIncrementAtom = atom((get) => {
  return get(isDualPageAtom) ? 2 : 1;
});

export const previousPageAtom = atom(null, async (get, set) => {
  const pageIncrement = get(pageIncrementAtom);
  await set(changePageAtom, -pageIncrement);
});
export const nextPageAtom = atom(null, async (get, set) => {
  const pageIncrement = get(pageIncrementAtom);
  await set(changePageAtom, pageIncrement);
});
const isRenderedPageStateAtom = atom<{ [pageNumber: number]: boolean }>({});

export const isTextGotAtom = atom(false);
export const booksAtom = atom<string[]>([]);
export const pdfsRenderedAtom = atom<{ [bookId: string]: boolean }>({});
export const isPdfRenderedAtom = atom(
  (get) => {
    const pdfsRendered = get(pdfsRenderedAtom);
    return (bookId: string) => pdfsRendered[bookId] ?? false;
  },
  (get, set, bookId: string, isRendered: boolean) => {
    const pdfsRendered = get(pdfsRenderedAtom);
    set(pdfsRenderedAtom, {
      ...pdfsRendered,
      [bookId]: isRendered,
    });
  }
);

type ActionOptions =
  | { type: "add"; id: string }
  | { type: "remove"; id: string }
  | { type: "setAll"; ids: string[] };

export const pdfsControllerAtom = atom(
  (get) => get(booksAtom),
  (get, set, action: ActionOptions) => {
    const books = get(booksAtom);
    const isRendered = get(pdfsRenderedAtom);

    switch (action.type) {
      case "add": {
        if (!books.includes(action.id)) {
          set(booksAtom, [...books, action.id]);
          set(pdfsRenderedAtom, { ...isRendered, [action.id]: false }); // default state
        }
        break;
      }

      case "remove": {
        const newBooks = books.filter((id) => id !== action.id);
        const { [action.id]: _, ...rest } = isRendered;

        set(booksAtom, newBooks);
        set(pdfsRenderedAtom, rest);
        break;
      }

      case "setAll": {
        const newBooks = action.ids;
        const newRendered: Record<string, boolean> = {};

        for (const id of newBooks) {
          newRendered[id] = isRendered[id] ?? false;
        }

        set(booksAtom, newBooks);
        set(pdfsRenderedAtom, newRendered);
        break;
      }
    }
  }
);

export const isRenderedAtom = atom<Record<string, boolean>>({});


export const hasNavigatedToPageAtom = atom(false);
export const isLookingForNextParagraphAtom = atom(false);

// debug label
isLookingForNextParagraphAtom.debugLabel = "isLookingForNextParagraphAtom";
hasNavigatedToPageAtom.debugLabel = "hasNavigatedToPageAtom";
isPdfRenderedAtom.debugLabel = "isPdfRenderedAtom";
currentParagraphAtom.debugLabel = "currentParagraphAtom";
pageNumberAtom.debugLabel = "pageNumberAtom";
isDualPageAtom.debugLabel = "isDualPageAtom";
previousViewPagesAtom.debugLabel = "previousViewPagesAtom";
nextViewPagesAtom.debugLabel = "nextViewPagesAtom";
pageCountAtom.debugLabel = "pageCountAtom";
getCurrentViewParagraphsAtom.debugLabel = "getCurrentViewParagraphsAtom";
getNextViewParagraphsAtom.debugLabel = "getNextViewParagraphsAtom";
getPreviousViewParagraphsAtom.debugLabel = "getPreviousViewParagraphsAtom";
isHighlightingAtom.debugLabel = "isHighlightingAtom";
highlightedParagraphIndexAtom.debugLabel = "highlightedParagraphIndexAtom";
highlightedParagraphAtom.debugLabel = "highlightedParagraphAtom";
changePageAtom.debugLabel = "changePageAtom";
pageIncrementAtom.debugLabel = "pageIncrementAtom";
previousPageAtom.debugLabel = "previousPageAtom";
nextPageAtom.debugLabel = "nextPageAtom";
isRenderedPageStateAtom.debugLabel = "isRenderedPageStateAtom";
isTextGotAtom.debugLabel = "isTextGotAtom";
isPdfRenderedAtom.debugLabel = "isPdfRenderedAtom";

pdfsRenderedAtom.debugLabel = "PdfsRenderedAtom";
booksAtom.debugLabel = "booksAtom";
bookNavigationStateAtom.debugLabel = "bookNavigationStateAtom";
