import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { Link } from "@tanstack/react-router";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { Menu } from "@components/ui/Menu";
import { Radio, RadioGroup } from "@components/ui/Radio";
import { ThemeType } from "@/themes/common";
import { themes } from "@/themes/themes";
import { Palette, Menu as MenuIcon } from "lucide-react";
import { updateBookLocation } from "@/modules/books";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Document, Page, Outline, pdfjs } from "react-pdf";
import type {
  DocumentInitParameters,
  TextContent,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@components/components/ui/sheet";
import { cn } from "@components/lib/utils";

import { BookData } from "@/generated";

// Import required CSS for text and annotation layers
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import createIReactReaderTheme from "@/themes/readerThemes";
import { NavigationArrows } from "./react-reader/components";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import { PlayerControlInterface } from "@/models/player_control";
import {
  currentViewPagesAtom,
  highlightedParagraphAtom,
  isDualPageAtom,
  isHighlightingAtom,
  isRenderedAtom,
  isRenderedPageAtom,
  nextPageAtom,
  nextViewPagesAtom,
  pageCountAtom,
  pageNumberAtom,
  Paragraph,
  previousPageAtom,
  previousViewPagesAtom,
  resetParaphStateAtom,
  setParagraphsAtom,
} from "@/stores/paragraph-atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { TTSControls } from "./TTSControls";
import { PdfPlayerControl } from "@/models/pdf_player_control";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const MIN_PARAGRAPH_LENGTH = 50;

export function usePdfNavigation(bookId: string) {
  const [numPages, setNumPages] = useAtom(pageCountAtom);

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const pdfHeight = windowSize.height - 120; // 60px top + 60px bottom
  // Configure PDF.js options with CDN fallback for better font and image support

  // Track window resize and fullscreen changes
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    const checkFullscreen = async () => {
      try {
        const appWindow = getCurrentWindow();
        const isCurrentlyFullscreen = await appWindow.isFullscreen();
        setIsFullscreen(isCurrentlyFullscreen);
      } catch (error) {
        console.error("Error checking fullscreen status:", error);
        // Fallback to browser detection
        setIsFullscreen(document.fullscreenElement !== null);
      }
    };

    window.addEventListener("resize", handleResize);

    // Check fullscreen on resize as well
    const handleResizeAndFullscreen = () => {
      handleResize();
      checkFullscreen();
    };

    window.addEventListener("resize", handleResizeAndFullscreen);

    // Initial check
    checkFullscreen();

    // Poll for fullscreen changes (Tauri doesn't have an event for this)
    const fullscreenCheckInterval = setInterval(checkFullscreen, 500);

    return () => {
      window.removeEventListener("resize", handleResizeAndFullscreen);
      clearInterval(fullscreenCheckInterval);
    };
  }, []);

  // Determine if we should show dual-page view
  const shouldShowDualPage = () => {
    // Don't show dual-page in fullscreen mode (Books app behavior)
    if (isFullscreen) return false;

    // Show dual-page for medium and large views (>= 768px)
    // This includes 1024x770 (default medium size) and larger
    return windowSize.width >= 768;
  };

  const isDualPage = shouldShowDualPage();
  const setIsDualPage = useSetAtom(isDualPageAtom);
  setIsDualPage(isDualPage);

  const previousPageSetter = useSetAtom(previousPageAtom);
  const previousPage = () => previousPageSetter(bookId);
  const nextPageSetter = useSetAtom(nextPageAtom);
  const nextPage = () => nextPageSetter(bookId);

  return {
    previousPage,
    nextPage,
    setNumPages,
    numPages,
    isDualPage,
    pdfHeight,
  };
}

export function PdfView({ book }: { book: BookData }): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  const resetParaphState = useSetAtom(resetParaphStateAtom);

  useEffect(() => {
    return () => {
      resetParaphState();
    };
  }, []);

  // Configure PDF.js options with CDN fallback for better font and image support
  const pdfOptions = useMemo<DocumentInitParameters>(
    () => ({
      cMapPacked: true,

      verbosity: 0,
    }),
    []
  );
  const {
    previousPage,
    nextPage,

    isDualPage,
    pdfHeight,
  } = usePdfNavigation(book.id);

  const handleThemeChange = (newTheme: ThemeType) => {
    setTheme(newTheme);
    setMenuOpen(false);
  };

  const updateBookLocationMutation = useMutation({
    mutationFn: async ({
      bookId,
      location,
    }: {
      bookId: string;
      location: string;
    }) => {
      await updateBookLocation(bookId, location);
    },

    onError(error) {
      toast.error("Can not change book page");
      console.log({ error });
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

  const getBackgroundColor = () => {
    switch (theme) {
      case ThemeType.White:
        return "bg-white";
      case ThemeType.Dark:
        return "bg-gray-900";
      default:
        return "bg-white";
    }
  };

  const [pageNumber, setPageNumber] = useAtom(pageNumberAtom);

  const setCurrentViewPages = useSetAtom(currentViewPagesAtom);
  const setPreviousViewPages = useSetAtom(previousViewPagesAtom);
  const setNextViewPages = useSetAtom(nextViewPagesAtom);
  const [numPages, setPageCount] = useAtom(pageCountAtom);
  const [playerControl, setPlayerControl] = useState<
    PlayerControlInterface | undefined
  >(undefined);
  const isRendered = useAtomValue(isRenderedAtom);
  const bookId = book.id;

  useEffect(() => {
    if (isRendered) {
      setPlayerControl(new PdfPlayerControl(bookId));
    }
    return () => {
      setPlayerControl(undefined);
    };
  }, [isRendered, bookId]);

  useEffect(() => {
    if (isDualPage) {
      setCurrentViewPages([pageNumber, pageNumber + 1]);
      setPreviousViewPages([pageNumber - 1, pageNumber - 2]);
      setNextViewPages([pageNumber + 2, pageNumber + 3]);
    } else {
      setCurrentViewPages([pageNumber]);
      setPreviousViewPages([pageNumber - 1]);
      setNextViewPages([pageNumber + 1]);
    }
  }, [pageNumber]);

  function onItemClick({ pageNumber: itemPageNumber }: { pageNumber: number }) {
    setPageNumber(itemPageNumber);
    setTocOpen(false);
    // Update book location when navigating via TOC
    updateBookLocationMutation.mutate({
      bookId: book.id,
      location: itemPageNumber.toString(),
    });
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setPageCount(numPages);
    // If book has saved location, restore it
    if (book.current_location) {
      const savedPage = parseInt(book.current_location, 10);
      if (!isNaN(savedPage) && savedPage >= 1 && savedPage <= numPages) {
        setPageNumber(savedPage);
      }
    }
  }

  // Calculate available height for PDF (viewport - top bar - bottom bar)

  return (
    <div
      className={cn(
        "relative h-screen w-full overflow-hidden",
        getBackgroundColor()
      )}
    >
      <NavigationArrows
        onPrev={previousPage}
        onNext={nextPage}
        readerStyles={createIReactReaderTheme(themes[theme].readerTheme)}
      />

      {/* Fixed Top Bar */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-50",

          theme === ThemeType.Dark
            ? "bg-gray-900/80  border-gray-700"
            : "bg-white/80  border-gray-200"
        )}
      >
        <div className="flex items-center justify-between px-4 pt-1">
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
            <Menu
              trigger={
                <IconButton
                  className={cn(
                    "hover:bg-transparent border-none",
                    getTextColor()
                  )}
                >
                  <Palette size={20} />
                </IconButton>
              }
              open={menuOpen}
              onOpen={() => setMenuOpen(true)}
              onClose={() => setMenuOpen(false)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              theme={themes[theme]}
            >
              <div className="p-3">
                <RadioGroup
                  value={theme}
                  onChange={(value) => handleThemeChange(value as ThemeType)}
                  name="theme-selector"
                  theme={themes[theme]}
                >
                  {(Object.keys(themes) as Array<keyof typeof themes>).map(
                    (themeKey) => (
                      <Radio
                        key={themeKey}
                        value={themeKey}
                        label={themeKey}
                        theme={themes[theme]}
                      />
                    )
                  )}
                </RadioGroup>
              </div>
            </Menu>

            <Link to="/">
              <Button
                variant="ghost"
                className={cn("shadow-sm", getTextColor())}
              >
                Back
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main PDF Viewer Area */}
      <div
        className="flex items-center justify-center overflow-hidden px-2 py-1"
        style={{ height: "100vh" }}
      >
        <Document
          className="flex items-center justify-center"
          file={convertFileSrc(book.filePath)}
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
            <div className={cn("p-4 text-center", getTextColor())}>
              <p>Loading PDF...</p>
            </div>
          }
          externalLinkTarget="_blank"
          externalLinkRel="noopener noreferrer nofollow"
        >
          {isDualPage && pageNumber < numPages ? (
            // Dual-page view - side by side with gap
            <div className="flex items-center gap-3">
              {/* Hidden pages for previous view */}
              {pageNumber >= 2 && (
                <PageComponent
                  key={pageNumber - 2}
                  thispageNumber={pageNumber - 2}
                  pdfHeight={pdfHeight}
                  isHidden={true}
                />
              )}
              {pageNumber >= 1 && (
                <PageComponent
                  key={pageNumber - 1}
                  thispageNumber={pageNumber - 1}
                  pdfHeight={pdfHeight}
                  isHidden={true}
                />
              )}
              <PageComponent
                key={pageNumber}
                thispageNumber={pageNumber}
                pdfHeight={pdfHeight}
                isHidden={false}
              />
              {pageNumber + 1 <= numPages && (
                <PageComponent
                  key={pageNumber + 1}
                  thispageNumber={pageNumber + 1}
                  pdfHeight={pdfHeight}
                  isHidden={false}
                />
              )}
              {/* Hidden pages for next view */}
              {pageNumber + 2 <= numPages && (
                <PageComponent
                  key={pageNumber + 2}
                  thispageNumber={pageNumber + 2}
                  pdfHeight={pdfHeight}
                  isHidden={true}
                />
              )}
              {pageNumber + 3 <= numPages && (
                <PageComponent
                  key={pageNumber + 3}
                  thispageNumber={pageNumber + 3}
                  pdfHeight={pdfHeight}
                  isHidden={true}
                />
              )}
            </div>
          ) : (
            // Single page view
            <>
              {pageNumber >= 1 && (
                <PageComponent
                  key={pageNumber - 1}
                  thispageNumber={pageNumber - 1}
                  pdfHeight={pdfHeight}
                  isHidden={true}
                />
              )}
              <PageComponent
                key={pageNumber}
                thispageNumber={pageNumber}
                pdfHeight={pdfHeight}
                isHidden={false}
              />
              {pageNumber + 1 <= numPages && (
                <PageComponent
                  key={pageNumber + 1}
                  thispageNumber={pageNumber + 1}
                  pdfHeight={pdfHeight}
                  isHidden={false}
                />
              )}
            </>
          )}
        </Document>
        {/* TTS Controls - Bottom Center */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50">
          {playerControl && (
            <TTSControls bookId={book.id} playerControl={playerControl} />
          )}
        </div>
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
              file={convertFileSrc(book.filePath)}
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

type Transform = [number, number, number, number, number, number];
const getParagraphThreshold = (item: TextItem): number => {
  // If height is available, use 1.5x the height
  if ("height" in item && typeof item.height === "number" && item.height > 0) {
    return item.height * 1.5;
  }
  // Fallback to dynamic calculation or default
  return 12;
};

const PARAGRAPH_INDEX_PER_PAGE = 10000;
export function PageComponent({
  thispageNumber: pageNumber,
  pdfHeight,
  isHidden = false,
}: {
  thispageNumber: number;
  pdfHeight: number;
  isHidden: boolean;
}) {
  const [pageData, setPageData] = useState<TextContent | null>(null);
  const isHighlighting = useAtomValue(isHighlightingAtom);
  const setParagraphs = useSetAtom(setParagraphsAtom);

  const defaultDimensions = {
    bottom: Number.MAX_SAFE_INTEGER,
    top: Number.MIN_SAFE_INTEGER,
  };
  const paragraghSoFar = useRef<Paragraph>({
    index: "",
    text: "",
    dimensions: defaultDimensions,
  });
  const paragraphsSoFarArray = useRef<Paragraph[]>([]);
  function isInsideParagraph(wordTransform: Transform) {
    const highlightedPageNumber = Math.floor(
      Number(highlightedParagraph.index) / PARAGRAPH_INDEX_PER_PAGE
    );
    if (highlightedPageNumber !== pageNumber) return false;
    const isBelowOrEqualTop =
      wordTransform[5] <= highlightedParagraph.dimensions.top;
    const isAboveOrEqualBottom =
      wordTransform[5] >= highlightedParagraph.dimensions.bottom;
    return isBelowOrEqualTop && isAboveOrEqualBottom;
  }
  const setIsRendered = useSetAtom(isRenderedPageAtom);

  const isHiddenClass = isHidden ? " hidden" : "";

  const highlightedParagraph = useAtomValue(highlightedParagraphAtom);

  useEffect(() => {
    if (pageData) {
      // Reset arrays for this page parse
      paragraphsSoFarArray.current = [];
      paragraghSoFar.current = {
        index: "",
        text: "",
        dimensions: defaultDimensions,
      };

      const items = pageData.items;
      let headerGot = false;
      function isTextItem(
        item: TextItem | TextMarkedContent
      ): item is TextItem {
        return "str" in item;
      }

      let previousItem: TextItem | null = null;
      for (let item of items) {
        if (!isTextItem(item)) continue;

        const text = item.str;
        let textSoFar = paragraghSoFar.current?.text || "";

        const isVerticallySpaced =
          previousItem &&
          Math.abs(previousItem.transform[5] - item.transform[5]) >
            getParagraphThreshold(item) &&
          item.hasEOL;
        const isThereText = textSoFar.trim().length > 0;
        const areParagraphsEmpty = paragraphsSoFarArray.current.length === 0;
        const isParagraphTooShort = textSoFar.length < MIN_PARAGRAPH_LENGTH;
        const isHeader =
          areParagraphsEmpty && isParagraphTooShort && !headerGot;

        if (isVerticallySpaced && isThereText) {
          if (isHeader) {
            // Skip the header - don't push it, just reset for next paragraph
            // Next paragraph will get index based on current array length
            const nextIdx = paragraphsSoFarArray.current.length;
            const nextPargraphIdx = (
              pageNumber * PARAGRAPH_INDEX_PER_PAGE +
              nextIdx
            ).toString();
            paragraghSoFar.current = {
              index: nextPargraphIdx,
              text: "",
              dimensions: defaultDimensions,
            };
            headerGot = true;
            continue;
          }

          paragraphsSoFarArray.current.push(paragraghSoFar.current);
          // Calculate index AFTER push, so it's incremented correctly
          const currentIdx = paragraphsSoFarArray.current.length;
          const pargraphIdx = (
            pageNumber * PARAGRAPH_INDEX_PER_PAGE +
            currentIdx
          ).toString();
          // reset the paragraph so far
          paragraghSoFar.current = {
            index: pargraphIdx,
            text: "",
            dimensions: defaultDimensions,
          };
        }
        previousItem = item;

        // Calculate index on each iteration for the accumulating paragraph
        const currentIdx = paragraphsSoFarArray.current.length;
        const pargraphIdx = (
          pageNumber * PARAGRAPH_INDEX_PER_PAGE +
          currentIdx
        ).toString();

        paragraghSoFar.current = {
          index: pargraphIdx,
          text: paragraghSoFar.current.text + text,
          dimensions: {
            top: Math.max(
              item.transform[5],
              paragraghSoFar.current.dimensions.top
            ),
            bottom: Math.min(
              // item.transform[5] - item.height,
              item.transform[5],
              paragraghSoFar.current.dimensions.bottom
            ),
          },
        };
      }

      paragraphsSoFarArray.current.push(paragraghSoFar.current);

      paragraphsSoFarArray.current = paragraphsSoFarArray.current
        .filter((paragraph) => paragraph.text.trim().length > 0)
        // remove paragraphs that are too short
        .reduce<Paragraph[]>((acc, paragraph) => {
          const isParagraphTooShort =
            paragraph.text.trim().length < MIN_PARAGRAPH_LENGTH;
          // if the paragraph is not too short, add it to the accumulator
          if (!isParagraphTooShort) {
            acc.push(paragraph);
            return acc;
          }

          const lastParagraph = acc.pop();
          // if there is no last paragraph, add the paragraph to the accumulator
          if (!lastParagraph) {
            acc.push(paragraph);
            return acc;
          }
          // merge the paragraph with the last paragraph
          lastParagraph.text = lastParagraph.text + "\n" + paragraph.text;
          lastParagraph.dimensions = {
            top: Math.max(
              paragraph.dimensions.top,
              lastParagraph.dimensions.top
            ),
            bottom: Math.min(
              paragraph.dimensions.bottom,
              lastParagraph.dimensions.bottom
            ),
          };
          acc.push(lastParagraph);

          return acc;
        }, []);

      setParagraphs(pageNumber, paragraphsSoFarArray.current);
      setIsRendered(pageNumber, true);
    } else {
      setIsRendered(pageNumber, false);
    }
  }, [pageData]);
  return (
    <Page
      pageNumber={pageNumber}
      key={pageNumber.toString()}
      customTextRenderer={({
        str,

        transform,
      }) => {
        if (
          isHighlighting &&
          // isHighlighedPage() &&
          isInsideParagraph(transform as Transform)
        ) {
          return `<mark>${str}</mark>`;
        }

        return str;
      }}
      height={pdfHeight}
      className={" rounded shadow-lg  " + isHiddenClass}
      renderTextLayer={true}
      renderAnnotationLayer={true}
      canvasBackground="white"
      onGetTextSuccess={(data) => {
        setPageData(data);
      }}
    />
  );
}
