import { useAtomValue, useSetAtom } from "jotai";
import {
  highlightedParagraphArrayIndexAtom,
  isPdfRenderedAtom,
  pageNumberAtom,
  setPageNumberAtom,
} from "../atoms/paragraph-atoms";
import { useCallback, useEffect, useState } from "react";
import { getCurrrentPageNumber } from "../utils/getCurrentPageNumbers";
import { throttle } from "throttle-debounce";
import { playerControl } from "@/models/pdf_player_control";

export function useCurrentPageNumber(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  bookId: string
) {
  const currentPageNumber = useAtomValue(pageNumberAtom);
  const setPageNumber = useSetAtom(setPageNumberAtom);
  const scrollDiv = scrollRef.current;
  const setPageIndex = useSetAtom(highlightedParagraphArrayIndexAtom);

  const setCurrentPageNumberThrottled = useCallback(
    throttle(1000, () => {
      const newPageNumber = getCurrrentPageNumber(window);
      if (newPageNumber !== currentPageNumber) {
        setPageNumber(newPageNumber);
      }
    }),
    [setPageNumber]
  );
  const isPdfRendered = useAtomValue(isPdfRenderedAtom);
  useEffect(() => {
    if (!isPdfRendered(bookId)) return;
    void playerControl.initialize();
    const handleResize = () => {
      setCurrentPageNumberThrottled();
    };
    const handleScroll = () => {
      setCurrentPageNumberThrottled();
    };
    scrollDiv?.addEventListener("resize", handleResize);
    scrollDiv?.addEventListener("scroll", handleScroll);

    return () => {
      scrollDiv?.removeEventListener("resize", handleResize);
      scrollDiv?.removeEventListener("scroll", handleScroll);
    };
  }, [scrollDiv, currentPageNumber, isPdfRendered]);
  return currentPageNumber;
}
export function findElementWithPageNumber(
  pageNumber: number,
  scrollContainerRef: HTMLDivElement
) {
  return scrollContainerRef.querySelector<HTMLElement>(
    `[data-page-number="${pageNumber}"]`
  );
}

export function useCurrentPageNumberNavigation(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  bookId: string
) {
  const currentPageNumber = useAtomValue(pageNumberAtom);
  const elementRefValue = scrollContainerRef.current;
  const isPdfRendered = useAtomValue(isPdfRenderedAtom);
  const [hasNavigatedToPage, setHasNavigatedToPage] = useState(false);

  useEffect(() => {
    if (!elementRefValue) return;
    if (!isPdfRendered(bookId)) return;
    if (hasNavigatedToPage) return;
    void playerControl.initialize();
    const element = findElementWithPageNumber(
      currentPageNumber,
      elementRefValue
    );
    if (element) {
      element.scrollIntoView({ behavior: "instant" });
      setHasNavigatedToPage(true);
    } else {
      console.error(
        `>>> Element with page number ${currentPageNumber} not found`
      );
    }
  }, [elementRefValue, currentPageNumber, isPdfRendered]);
  return { hasNavigatedToPage };
}
