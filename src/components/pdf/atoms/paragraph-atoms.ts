import { ParagraphWithIndex } from "@/models/player_control";

import { atomWithImmer } from "jotai-immer";
import { atom } from "jotai";

import type { TextContent } from "react-pdf";
import { pageDataToParagraphs } from "../utils/getPageParagraphs";

import { freezeAtom } from "jotai/utils";
import { player, PlayerEvent } from "@/models/Player";
import { PlayingState } from "@/utils/bus";
import { customStore } from "@/stores/jotai";
import { observe } from "jotai-effect";

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
export const currentViewPagesAtom = atom<number[]>([]);
observe((get, set) => {
  const pageNumber = get(pageNumberAtom);
  const isDualPage = get(isDualPageAtom);

  if (isDualPage) {
    set(currentViewPagesAtom, [pageNumber, pageNumber + 1]);
  }
  set(currentViewPagesAtom, [pageNumber]);
}, customStore);
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
export const pageNumberToPageDataAtom = atomWithImmer<{
  [pageNumber: number]: TextContent;
}>({});
export const setPageNumberToPageData = atom(
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
export const paragraphsAtom = atom((get) => {
  return (pageNumber: number) => {
    const pageData = get(pageNumberToPageDataAtom)[pageNumber];
    if (!pageData) {
      return [];
    }
    return pageDataToParagraphs(pageNumber, pageData);
  };
});

export const resetParaphStateAtom = atom(null, (_get, set) => {
  set(isDualPageAtom, false);
  set(pageCountAtom, 0);

  set(highlightedParagraphIndexAtom, "");
  set(isHighlightingAtom, false);
  set(isRenderedPageStateAtom, {});
});
export const getCurrentViewParagraphsAtom = atom((get) => {
  get(pageNumberAtom);
  const paragraphs = get(currentViewPagesAtom)
    .map((pageNumber) => get(paragraphsAtom)(pageNumber))
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

// export const highlightedParagraphArrayIndexAtom = freezeAtom(atom(-1));
export const isHighlightingAtom = atom(false);
// export const highlightedParagraphGlobalIndexAtom = atom(
//   (get) => {
//     get(pageNumberAtom);
//     return get(getCurrentViewParagraphsAtom)[
//       get(highlightedParagraphArrayIndexAtom)
//     ].index;
//   },
//   (get, set, newGlobalIndex: string) => {
//     const currentViewParagraphs = get(getCurrentViewParagraphsAtom);
//     const newArrayIndex = currentViewParagraphs.findIndex(
//       (paragraph) => paragraph.index === newGlobalIndex
//     );

//     if (newArrayIndex !== -1) {
//       set(highlightedParagraphArrayIndexAtom, newArrayIndex);
//       set(isHighlightingAtom, true);
//     } else {
//       set(isHighlightingAtom, false);
//     }
//   }
// );
export const highlightedParagraphIndexAtom = atom("");
export const highlightedParagraphAtom = atom((get) => {
  const currentViewParagraphs = get(getCurrentViewParagraphsAtom);
  const index = get(highlightedParagraphIndexAtom);
  const currentParagraph = currentViewParagraphs.find(
    (paragraph) => paragraph.index === index
  );

  return currentParagraph;
});

export const highlightedPageAtom = atom((get) => {
  const highlightedParagraph = get(highlightedParagraphAtom);
  const paragraphs = get(paragraphsAtom);
  const hasParagraph = (paragraphs: ParagraphWithIndex[]) =>
    paragraphs.some(
      (paragraph) => paragraph.index === highlightedParagraph?.index
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
    .map((pageNumber) => get(paragraphsAtom)(pageNumber))
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
    .map((pageNumber) => get(paragraphsAtom)(pageNumber))
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
export const isTextGotAtom = atom((get) => {
  return get(currentViewPagesAtom)
    .map((pageNumber) => get(isRenderedPageAtom)[pageNumber])
    .every((rendered) => rendered);
});
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

player.on(PlayerEvent.PLAYING_STATE_CHANGED, (state) => {
  if (state === PlayingState.Playing) {
    customStore.set(isHighlightingAtom, true);
  } else {
    customStore.set(isHighlightingAtom, false);
  }
});
export const hasNavigatedToPageAtom = atom(false);

// debug label
hasNavigatedToPageAtom.debugLabel = "hasNavigatedToPageAtom";
isPdfRenderedAtom.debugLabel = "isPdfRenderedAtom";
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
isHighlightingAtom.debugLabel = "isHighlightingAtom";
highlightedParagraphIndexAtom.debugLabel = "highlightedParagraphIndexAtom";
highlightedParagraphAtom.debugLabel = "highlightedParagraphAtom";
highlightedPageAtom.debugLabel = "highlightedPageAtom";
changePageAtom.debugLabel = "changePageAtom";
pageIncrementAtom.debugLabel = "pageIncrementAtom";
previousPageAtom.debugLabel = "previousPageAtom";
nextPageAtom.debugLabel = "nextPageAtom";
isRenderedPageStateAtom.debugLabel = "isRenderedPageStateAtom";
isRenderedPageAtom.debugLabel = "isRenderedPageAtom";
isTextGotAtom.debugLabel = "isTextGotAtom";
isPdfRenderedAtom.debugLabel = "isPdfRenderedAtom";

pdfsRenderedAtom.debugLabel = "PdfsRenderedAtom";
booksAtom.debugLabel = "booksAtom";
pageNumberToPageDataAtom.debugLabel = "pageNumberToPageDataAtom";
setPageNumberToPageData.debugLabel = "setPageNumberToPageData";
bookNavigationStateAtom.debugLabel = "bookNavigationStateAtom";
