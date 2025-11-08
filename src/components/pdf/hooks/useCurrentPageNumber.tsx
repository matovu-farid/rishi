import { useAtomValue, useSetAtom } from "jotai";
import {
  isPdfRenderedAtom,
  pageNumberAtom,
  setPageNumberAtom,
} from "../atoms/paragraph-atoms";
import { useCallback, useEffect } from "react";
import { getCurrrentPageNumber } from "../utils/getCurrentPageNumbers";
import { throttle } from "throttle-debounce";

export function useCurrentPageNumber(
  scrollRef: React.RefObject<HTMLDivElement | null>
) {
  //   const [currentPageNumber, setCurrentPageNumber] = useAtom(pageNumberAtom);
  const currentPageNumber = useAtomValue(pageNumberAtom);
  const setPageNumber = useSetAtom(setPageNumberAtom);
  const scrollDiv = scrollRef.current;
  const isPdfRendered = useAtomValue(isPdfRenderedAtom);
  const setCurrentPageNumberThrottled = useCallback(
    throttle(1000, () => {
      const newPageNumber = getCurrrentPageNumber(window);
      console.log({ newPageNumber });
      if (newPageNumber !== currentPageNumber) {
        setPageNumber(newPageNumber);
      }
    }),
    [setPageNumber]
  );
  useEffect(() => {
    if (!isPdfRendered) return;
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
  }, [setCurrentPageNumberThrottled, scrollDiv, isPdfRendered]);
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
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
) {
  const currentPageNumber = useAtomValue(pageNumberAtom);
  const elementRefValue = scrollContainerRef.current;
  const isPdfRendered = useAtomValue(isPdfRenderedAtom);

  useEffect(() => {
    if (!elementRefValue) return;
    if (!isPdfRendered) return;
    const element = findElementWithPageNumber(
      currentPageNumber,
      elementRefValue
    );
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    } else {
      console.error(
        `>>> Element with page number ${currentPageNumber} not found`
      );
    }
  }, [elementRefValue, currentPageNumber, isPdfRendered]);
}
