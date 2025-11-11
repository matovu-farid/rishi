import React, { useEffect, useRef, useCallback, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";

// Import required CSS for text and annotation layers
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { elementScroll } from "@tanstack/react-virtual";
import type { VirtualizerOptions } from "@tanstack/react-virtual";
import { BookData } from "@/generated";
import {
  hasNavigatedToPageAtom,
  pageCountAtom,
} from "../atoms/paragraph-atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { usePdfNavigation } from "./usePdfNavigation";
function easeInOutQuint(t: number) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;
}
export function useVirualization(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  book: BookData
) {
  const initialPageIndexRef = useRef(
    Math.max(0, Number.parseInt(book.location, 10) - 1)
  );
  const numPages = useAtomValue(pageCountAtom);
  const setHasNavigatedToPage = useSetAtom(hasNavigatedToPageAtom);
  const estimatedPageHeight = 1900;
  const scrollingRef = useRef<number | null>(null);
  const initialOffsetRef = useRef(
    initialPageIndexRef.current * estimatedPageHeight
  );
  const { isDualPage, pdfWidth, pdfHeight, dualPageWidth } = usePdfNavigation();

  const pageWidth = isDualPage ? dualPageWidth : pdfWidth;
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const measurementTimeouts = useRef(new Map<number, number>());
  const hasRequestedInitialScroll = useRef(false);
  const hasFinalizedInitialScroll = useRef(false);
  const scrollToFn: VirtualizerOptions<any, any>["scrollToFn"] =
    React.useCallback((offset, canSmooth, instance) => {
      const duration = 1000;
      const start = scrollContainerRef.current?.scrollTop || 0;
      const startTime = (scrollingRef.current = Date.now());

      const run = () => {
        if (scrollingRef.current !== startTime) return;
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = easeInOutQuint(Math.min(elapsed / duration, 1));
        const interpolated = start + (offset - start) * progress;

        if (elapsed < duration) {
          elementScroll(interpolated, canSmooth, instance);
          requestAnimationFrame(run);
        } else {
          elementScroll(interpolated, canSmooth, instance);
        }
      };

      requestAnimationFrame(run);
    }, []);

  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimatedPageHeight,
    overscan: 5,
    enabled: numPages > 0,
    initialOffset: initialOffsetRef.current,
    scrollToFn,
  });
  useEffect(() => {
    pageRefs.current.forEach((element) => {
      virtualizer.measureElement(element);
    });
  }, [virtualizer, pageWidth, pdfHeight]);
  const handlePageRendered = useCallback(
    (index: number) => {
      const existingTimeout = measurementTimeouts.current.get(index);
      if (existingTimeout !== undefined) {
        window.clearTimeout(existingTimeout);
      }

      const timeoutId = window.setTimeout(() => {
        const element = pageRefs.current.get(index);
        if (element) {
          virtualizer.measureElement(element);
          if (
            index === initialPageIndexRef.current &&
            hasRequestedInitialScroll.current &&
            !hasFinalizedInitialScroll.current
          ) {
            hasFinalizedInitialScroll.current = true;

            virtualizer.scrollToIndex(initialPageIndexRef.current, {
              align: "start",
              behavior: "auto",
            });
            setHasNavigatedToPage(true);
          }
        }
        measurementTimeouts.current.delete(index);
      }, 120);

      measurementTimeouts.current.set(index, timeoutId);
    },
    [virtualizer]
  );

  useEffect(() => {
    return () => {
      measurementTimeouts.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      measurementTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (hasRequestedInitialScroll.current) return;
    if (numPages === 0) return;
    if (!scrollContainerRef.current) return;

    hasRequestedInitialScroll.current = true;
    virtualizer.scrollToIndex(initialPageIndexRef.current, {
      align: "start",
      behavior: "auto",
    });
  }, [numPages, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  return { virtualizer, virtualItems, pageRefs, handlePageRendered };
}
