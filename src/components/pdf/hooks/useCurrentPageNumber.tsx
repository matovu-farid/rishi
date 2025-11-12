// --------------------------------------------------------------------------------------
// Hook utilities and helpers for tracking and synchronizing the active PDF page.
// --------------------------------------------------------------------------------------
import { useAtomValue, useSetAtom } from "jotai";
import {
  getCurrentViewParagraphsAtom,
  getNextViewParagraphsAtom,
  getPreviousViewParagraphsAtom,
  isPdfRenderedAtom,
  isTextGotAtom,
  pageNumberAtom,
  pageNumberToPageDataAtom,
  scrollPageNumberAtom,
  setPageNumberAtom,
} from "../atoms/paragraph-atoms";
import { useCallback, useEffect, useState } from "react";
import { getCurrrentPageNumber } from "../utils/getCurrentPageNumbers";
import { debounce, throttle } from "throttle-debounce";
// import { playerControl } from "@/models/pdf_player_control";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { synchronizedUpdateBookLocation } from "@/modules/sync_books";
import { toast } from "react-toastify";
import { BookData } from "@/generated";
import { pageDataToParagraphs } from "../utils/getPageParagraphs";
import { customStore } from "@/stores/jotai";
import isEqual from "fast-deep-equal";

// --------------------------------------------------------------------------------------
// Returns and maintains the current page number for the active PDF view. The hook:
// - Seeds state from the persisted `book.location`.
// - Watches scroll/resize events to keep the jotai atom in sync.
// - Debounces writes so the backend location is updated sparingly.
// --------------------------------------------------------------------------------------
export function useCurrentPageNumber(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  book: BookData,
  virtualizer?: Virtualizer<HTMLDivElement, Element>
) {
  const currentPageNumber = useAtomValue(pageNumberAtom);
  const setScrollPageNumber = useSetAtom(scrollPageNumberAtom);
  const setPageNumber = useSetAtom(setPageNumberAtom);
  const bookId = book.id;

  // ------------------------------------------------------------------------------------
  // Dereference the scrolling container once so listeners can be registered cleanly.
  // ------------------------------------------------------------------------------------
  // const scrollDiv = scrollRef.current;
  // Set book data only when book prop changes, not on every render
  useEffect(() => {
    setPageNumber(parseInt(book.location, 10));
  }, []);

  // ------------------------------------------------------------------------------------
  // Debounce the page calculation .
  // ------------------------------------------------------------------------------------
  // const setCurrentPageNumberThrottled = useCallback(
  //   throttle(3000, () => {
  //     const newPageNumber = getCurrrentPageNumber(window);
  //     console.log("newPageNumber", newPageNumber);
  //     if (newPageNumber !== currentPageNumber) {
  //       setScrollPageNumber(newPageNumber);
  //     }
  //   }),
  //   [currentPageNumber]
  // );
  // const isPdfRendered = useAtomValue(isPdfRenderedAtom);
  // useEffect(() => {
  //   if (!isPdfRendered(bookId)) return;
  //   void playerControl.initialize();
  //   const handleResize = () => {
  //     setCurrentPageNumberThrottled();
  //   };
  //   const handleScroll = () => {
  //     setCurrentPageNumberThrottled();
  //   };
  //   scrollDiv?.addEventListener("resize", handleResize);
  //   scrollDiv?.addEventListener("scroll", handleScroll);

  //   return () => {
  //     scrollDiv?.removeEventListener("resize", handleResize);
  //     scrollDiv?.removeEventListener("scroll", handleScroll);
  //   };
  // }, [scrollDiv, currentPageNumber, isPdfRendered]);

  const setCurrentViewParagraphs = useSetAtom(getCurrentViewParagraphsAtom);
  const setIsTextGot = useSetAtom(isTextGotAtom);
  const setNextViewParagraphs = useSetAtom(getNextViewParagraphsAtom);
  const setPreviousViewParagraphs = useSetAtom(getPreviousViewParagraphsAtom);
  useEffect(() => {
    const interval = setInterval(() => {
      const newPageNumber = getCurrrentPageNumber(window);

      if (newPageNumber !== currentPageNumber) {
        setScrollPageNumber(newPageNumber);
      }
      const pageNumberToPageData = customStore.get(pageNumberToPageDataAtom);
      const data = pageNumberToPageData[newPageNumber];
      if (!data) return;

      // TODO: Ceck deep equality of the paragraphs and if not the same, update the paragraphs
      const newCurrentViewParagraphs = pageDataToParagraphs(
        newPageNumber,
        data
      );
      const newNextViewParagraphs = pageDataToParagraphs(
        newPageNumber + 1,
        data
      );
      const newPreviousViewParagraphs = pageDataToParagraphs(
        newPageNumber - 1,
        data
      );
      const currentViewParagraphs = customStore.get(
        getCurrentViewParagraphsAtom
      );
      const nextViewParagraphs = customStore.get(getNextViewParagraphsAtom);
      const previousViewParagraphs = customStore.get(
        getPreviousViewParagraphsAtom
      );

      if (!isEqual(currentViewParagraphs, newCurrentViewParagraphs)) {
        console.log({ currentViewParagraphs, newCurrentViewParagraphs });
        setCurrentViewParagraphs(newCurrentViewParagraphs);
        setIsTextGot(true);
      }
      if (!isEqual(nextViewParagraphs, newNextViewParagraphs)) {
        setNextViewParagraphs(newNextViewParagraphs);
      }
      if (!isEqual(previousViewParagraphs, newPreviousViewParagraphs)) {
        setPreviousViewParagraphs(newPreviousViewParagraphs);
      }

      // setNextViewParagraphs(pageDataToParagraphs(newPageNumber + 1, data));

      // setPreviousViewParagraphs(pageDataToParagraphs(newPageNumber - 1, data));
    }, 500);
    return () => clearInterval(interval);
  }, []);
  const queryClient = useQueryClient();
  const updateBookLocationMutation = useMutation({
    mutationFn: async ({
      bookId,
      location,
    }: {
      bookId: string;
      location: string;
    }) => {
      await synchronizedUpdateBookLocation(bookId, location);
    },

    onError(_error) {
      toast.error("Can not change book page");
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["book", bookId] });
    },
  });

  // ------------------------------------------------------------------------------------
  // Scroll to the current page number
  // ------------------------------------------------------------------------------------
  useEffect(() => {
    if (!virtualizer) return;
    if (currentPageNumber === 0) return;
    const viewedPageNumber = getCurrrentPageNumber(window);
    if (viewedPageNumber === currentPageNumber) return;
    // virtualizer.scrollToIndex(currentPageNumber - 1, {
    //   align: "start",
    //   behavior: "smooth",
    // });
  }, [currentPageNumber, virtualizer]);
  // ------------------------------------------------------------------------------------
  // Persist the latest page to the backend after the user settles on a location.
  // ------------------------------------------------------------------------------------
  useEffect(() => {
    debounce(1000, () => {
      updateBookLocationMutation.mutate({
        bookId: bookId,
        location: currentPageNumber.toString(),
      });
    })();
  }, [currentPageNumber]);
  //
  return currentPageNumber;
}
export function findElementWithPageNumber(
  pageNumber: number,
  scrollContainerRef: HTMLDivElement
) {
  // ------------------------------------------------------------------------------------
  // Locate the DOM element tagged with the desired `data-page-number`.
  // ------------------------------------------------------------------------------------
  return scrollContainerRef.querySelector<HTMLElement>(
    `[data-page-number="${pageNumber}"]`
  );
}

// --------------------------------------------------------------------------------------
// Smoothly scrolls to the active page number the first time the PDF renders. Works with
// both virtualized and non-virtualized layouts.
// --------------------------------------------------------------------------------------
// export function useCurrentPageNumberNavigation(
//   scrollContainerRef: React.RefObject<HTMLDivElement | null>,
//   bookId: string,
//   virtualizer?: Virtualizer<HTMLDivElement, Element>
// ) {
//   const currentPageNumber = useAtomValue(pageNumberAtom);
//   const isPdfRendered = useAtomValue(isPdfRenderedAtom);
//   const [hasNavigatedToPage, setHasNavigatedToPage] = useState(false);

//   useEffect(() => {
//     const container = scrollContainerRef.current;
//     if (!isPdfRendered(bookId)) return;
//     if (hasNavigatedToPage) return;
//     void playerControl.initialize();
//     const targetIndex = Math.max(0, currentPageNumber - 1);

//     if (virtualizer) {
//       virtualizer.scrollToIndex(targetIndex, {
//         align: "start",
//         behavior: "auto",
//       });

//       setHasNavigatedToPage(true);
//       return;
//     }

//     if (!container) return;

//     const element = findElementWithPageNumber(currentPageNumber, container);

//     if (element) {
//       element.scrollIntoView({ behavior: "auto", block: "start" });
//       setHasNavigatedToPage(true);
//     } else {
//       console.error(
//         `>>> Element with page number ${currentPageNumber} not found`
//       );
//     }
//   }, [
//     bookId,
//     currentPageNumber,
//     hasNavigatedToPage,
//     isPdfRendered,
//     scrollContainerRef,
//     virtualizer,
//   ]);
//   return { hasNavigatedToPage };
// }
