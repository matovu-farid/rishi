import { Link } from "@tanstack/react-router";
import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { ThemeType } from "@/themes/common";
import { Loader2, Menu as MenuIcon } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Menu as TauriMenu,
  Submenu,
  CheckMenuItem,
} from "@tauri-apps/api/menu";
import { Document, Outline, pdfjs } from "react-pdf";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";

import { cn } from "@components/lib/utils";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";

import { BookData } from "@/generated";

// Import required CSS for text and annotation layers
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import {
  getCurrentViewParagraphsAtom,
  getNextViewParagraphsAtom,
  getPreviousViewParagraphsAtom,
  highlightedParagraphAtom,
  highlightedParagraphIndexAtom,
  isPdfRenderedAtom,
  pageCountAtom,
  pageNumberAtom,
  paragraphsAtom,
  resetParaphStateAtom,
  setPageNumberAtom,
} from "@components/pdf/atoms/paragraph-atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { TTSControls } from "../../TTSControls";
import { playerControl } from "@/models/pdf_player_control";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { useUpdateCoverIMage } from "../hooks/useUpdateCoverIMage";
import { useChuncking } from "../hooks/useChunking";
import { usePdfNavigation } from "../hooks/usePdfNavigation";
import { PageComponent } from "./pdf-page";
import { useSetupMenu } from "../hooks/useSetupMenu";
import { useCurrentPageNumber } from "../hooks/useCurrentPageNumber";
import { useMutation } from "@tanstack/react-query";
import { synchronizedUpdateBookLocation } from "@/modules/sync_books";
import { toast } from "react-toastify";
import { customStore } from "@/stores/jotai";
import { queryClient } from "@components/providers";
import { debounce } from "throttle-debounce";
import { PDFDocumentProxy } from "pdfjs-dist";
import { elementScroll } from "@tanstack/react-virtual";
import type { VirtualizerOptions } from "@tanstack/react-virtual";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();
function easeInOutQuint(t: number) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;
}

export function PdfView({ book }: { book: BookData }): React.JSX.Element {
  const [theme] = useState<ThemeType>(ThemeType.White);
  const [tocOpen, setTocOpen] = useState(false);
  // const [direction, setDirection] = useState<"left" | "right">("right");

  const setPageNumber = useSetAtom(setPageNumberAtom);
  const { scrollContainerRef } = useChuncking();

  // useCurrentPageNumber(scrollContainerRef);
  useCurrentPageNumber(scrollContainerRef, book.id);

  useUpdateCoverIMage(book);
  useSetupMenu();
  // Set book data only when book prop changes, not on every render
  useEffect(() => {
    setPageNumber(parseInt(book.location, 10));
  }, [book.location, setPageNumber]);

  // Ref for the scrollable container

  const resetParaphState = useSetAtom(resetParaphStateAtom);
  const highlightedParagraph = useAtomValue(highlightedParagraphAtom);

  const currentPageNumber = useAtomValue(pageNumberAtom);
  const paragraphs = useAtomValue(paragraphsAtom);
  const currentParagraphs = paragraphs(currentPageNumber);
  const setHighlightedParagraphIndex = useSetAtom(
    highlightedParagraphIndexAtom
  );
  const firstParagraphIndex =
    currentParagraphs.length > 0 ? currentParagraphs[0].index : "";

  useEffect(() => {
    if (firstParagraphIndex) {
      setHighlightedParagraphIndex(firstParagraphIndex);
    }
  }, [firstParagraphIndex]);

  useEffect(() => {
    return () => {
      resetParaphState();
    };
  }, [resetParaphState]);

  // Configure PDF.js options with CDN fallback for better font and image support
  const pdfOptions = useMemo<DocumentInitParameters>(
    () => ({
      cMapPacked: true,

      verbosity: 0,
    }),
    []
  );
  const { isDualPage, pdfWidth, pdfHeight, dualPageWidth, isFullscreen } =
    usePdfNavigation();

  // Setup View submenu in the app menu for PDF view
  const isDualPageRef = useRef(isDualPage);

  // Keep ref in sync with current value
  useEffect(() => {
    isDualPageRef.current = isDualPage;
  }, [isDualPage]);

  // Update checkbox state when isDualPage changes
  useEffect(() => {
    void (async () => {
      try {
        const defaultMenu = await TauriMenu.default();
        const viewSubmenu = (await defaultMenu.get("view")) as Submenu | null;
        if (viewSubmenu) {
          const twoPagesItem = (await viewSubmenu.get(
            "two_pages"
          )) as CheckMenuItem | null;
          if (twoPagesItem) {
            await twoPagesItem.setChecked(isDualPage);
          }
        }
      } catch {
        // ignore errors
      }
    })();
  }, [isDualPage]);
  // Mount the paragraph atoms so they're available for the player control

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

  function getTextColor() {
    switch (theme) {
      case ThemeType.White:
        return "text-black hover:bg-black/10 hover:text-black";
      case ThemeType.Dark:
        return "text-white hover:bg-white/10 hover:text-white";
      default:
        return "text-black hover:bg-black/10 hover:text-black";
    }
  }

  const [numPages, setPageCount] = useAtom(pageCountAtom);

  function onDocumentLoadSuccess(pdf: PDFDocumentProxy): void {
    setPageCount(pdf.numPages);

    // If book has saved location, restore it
  }

  const initialPageIndexRef = useRef(
    Math.max(0, Number.parseInt(book.location, 10) - 1)
  );
  const estimatedPageHeight = 1900;
  const scrollingRef = useRef<number | null>(null);
  const initialOffsetRef = useRef(
    initialPageIndexRef.current * estimatedPageHeight
  );
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

  const virtualItems = virtualizer.getVirtualItems();
  const pageWidth = isDualPage ? dualPageWidth : pdfWidth;

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, pageWidth, pdfHeight, numPages]);

  useEffect(() => {
    debounce(1000, () => {
      updateBookLocationMutation.mutate({
        bookId: book.id,
        location: currentPageNumber.toString(),
      });
    })();
  }, [currentPageNumber]);

  // useCurrentPageNumberNavigation(scrollContainerRef, book.id, virtualizer);
  function onItemClick({ pageNumber: itemPageNumber }: { pageNumber: number }) {
    // Determine direction based on page number comparison
    virtualizer.scrollToIndex(itemPageNumber - 1, {
      align: "start",
      behavior: "smooth",
    });
    setPageNumber(itemPageNumber);
    setTocOpen(false);
    // Update book location when navigating via TOC
    updateBookLocationMutation.mutate({
      bookId: book.id,
      location: itemPageNumber.toString(),
    });
  }
  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "relative h-screen w-full overflow-y-scroll ",
        !isDualPage && isFullscreen ? "" : "",
        "bg-gray-300"
      )}
    >
      {/** White loading screen */}
      {/* {!hasNavigatedToPage && (
        <div className="w-screen h-screen grid place-items-center bg-white z-100 pointer-events-none">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )} */}
      {/* Fixed Top Bar */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0  z-50 bg-transparent"

          //theme === ThemeType.Dark ? " border-gray-700" : " border-gray-200"
        )}
      >
        <div className="flex items-center justify-between px-4 pt-5">
          <IconButton
            onClick={() => setTocOpen(true)}
            className={cn(
              "hover:bg-black/10 dark:hover:bg-white/10 border-none",
              getTextColor()
            )}
            aria-label="Open table of contents"
          >
            <MenuIcon size={20} />
          </IconButton>

          <div className="flex items-center gap-2">
            <Link to="/">
              <Button
                variant="ghost"
                className={cn("shadow-sm cursor-pointer", getTextColor())}
              >
                Back
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main PDF Viewer Area */}
      <div className="flex items-center justify-center  px-2 py-1">
        <Document
          className="flex items-center justify-center flex-col"
          file={convertFileSrc(book.filepath)}
          options={pdfOptions}
          onLoadSuccess={onDocumentLoadSuccess}
          onItemClick={onItemClick}
          error={
            <div className={cn("p-4 text-center", getTextColor())}>
              <p className="text-red-500">
                Error loading PDF. Please try again.
              </p>
            </div>
          }
          loading={
            <div
              className={cn(
                "w-full h-screen grid place-items-center",
                getTextColor()
              )}
            >
              <Loader2 size={20} className="animate-spin" />
            </div>
          }
          externalLinkTarget="_blank"
          externalLinkRel="noopener noreferrer nofollow"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 flex w-full justify-center"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div
                  className="mb-8 "
                  data-page-number={virtualItem.index + 1}
                  style={{ width: pageWidth ?? "auto" }}
                >
                  <PageComponent
                    key={`page-${virtualItem.index + 1}`}
                    thispageNumber={virtualItem.index + 1}
                    pdfWidth={pageWidth}
                    pdfHeight={pdfHeight}
                    isDualPage={isDualPage}
                    bookId={book.id}
                  />
                </div>
              </div>
            ))}
          </div>
        </Document>
        {/* TTS Controls - Draggable */}
        {
          <TTSControls
            key={book.id}
            bookId={book.id}
            playerControl={playerControl}
          />
        }
      </div>
      {/* TOC Sidebar */}
      <Sheet open={tocOpen} onOpenChange={setTocOpen}>
        <SheetContent
          side="left"
          className={cn(
            "w-[300px] sm:w-[400px] p-0",
            theme === ThemeType.Dark
              ? "bg-gray-900 border-gray-700"
              : "bg-white border-gray-200"
          )}
        >
          <SheetHeader
            className={cn(
              "p-4 border-b sticky top-0 z-10",
              theme === ThemeType.Dark
                ? "border-gray-700 bg-gray-900"
                : "border-gray-200 bg-white"
            )}
          >
            <SheetTitle className={getTextColor()}>
              Table of Contents
            </SheetTitle>
          </SheetHeader>
          <div
            className={cn(
              "overflow-y-auto h-[calc(100vh-73px)]",
              // Enhanced TOC styling with better padding and hover states
              "[&_a]:block [&_a]:py-3 [&_a]:px-4 [&_a]:cursor-pointer",
              "[&_a]:transition-all [&_a]:duration-200",
              "[&_a]:border-b [&_a]:font-medium",
              theme === ThemeType.Dark
                ? "[&_a]:text-gray-300 [&_a:hover]:bg-gray-800 [&_a:hover]:text-white [&_a]:border-gray-800 [&_a:hover]:pl-6"
                : "[&_a]:text-gray-700 [&_a:hover]:bg-gray-100 [&_a:hover]:text-black [&_a]:border-gray-100 [&_a:hover]:pl-6"
            )}
          >
            <Document
              file={convertFileSrc(book.filepath)}
              options={pdfOptions}
              onLoadSuccess={onDocumentLoadSuccess}
            >
              <Outline onItemClick={onItemClick} />
            </Document>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
