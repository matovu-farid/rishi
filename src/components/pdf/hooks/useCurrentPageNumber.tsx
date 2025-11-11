import { useAtomValue, useSetAtom } from "jotai";
import {
  isPdfRenderedAtom,
  pageNumberAtom,
  setPageNumberAtom,
} from "../atoms/paragraph-atoms";
import { useCallback, useEffect, useState } from "react";
import { getCurrrentPageNumber } from "../utils/getCurrentPageNumbers";
import { debounce, throttle } from "throttle-debounce";
import { playerControl } from "@/models/pdf_player_control";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { synchronizedUpdateBookLocation } from "@/modules/sync_books";
import { toast } from "react-toastify";

export function useCurrentPageNumber(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  bookId: string
) {
  const currentPageNumber = useAtomValue(pageNumberAtom);
  const setPageNumber = useSetAtom(setPageNumberAtom);
  const scrollDiv = scrollRef.current;
// throttle the setCurrentPageNumber to prevent excessive re-renders
  const setCurrentPageNumberThrottled = useCallback(
    throttle(1000, () => {
      const newPageNumber = getCurrrentPageNumber(window);
      if (newPageNumber !== currentPageNumber) {
        setPageNumber(newPageNumber);
      }
    }),
    [currentPageNumber, setPageNumber]
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
    },
  });

// sync the current page number with the book location
  useEffect(() => {
    debounce(1000, () => {
      updateBookLocationMutation.mutate({
        bookId: bookId,
        location: currentPageNumber.toString(),
      });
    })();
  }, [currentPageNumber])
  // 
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
  bookId: string,
  virtualizer?: Virtualizer<HTMLDivElement, Element>
) {
  const currentPageNumber = useAtomValue(pageNumberAtom);
  const isPdfRendered = useAtomValue(isPdfRenderedAtom);
  const [hasNavigatedToPage, setHasNavigatedToPage] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!isPdfRendered(bookId)) return;
    if (hasNavigatedToPage) return;
    void playerControl.initialize();
    const targetIndex = Math.max(0, currentPageNumber - 1);

    if (virtualizer) {
      virtualizer.scrollToIndex(targetIndex, {
        align: "start",
        behavior: "auto",
      });

      setHasNavigatedToPage(true);
      return;
    }

    if (!container) return;

    const element = findElementWithPageNumber(currentPageNumber, container);
    
    if (element) {
      element.scrollIntoView({ behavior: "auto", block: "start" });
      setHasNavigatedToPage(true);
    } else {
      console.error(
        `>>> Element with page number ${currentPageNumber} not found`
      );
    }
  }, [
    bookId,
    currentPageNumber,
    hasNavigatedToPage,
    isPdfRendered,
    scrollContainerRef,
    virtualizer,
  ]);
  return { hasNavigatedToPage };
}
