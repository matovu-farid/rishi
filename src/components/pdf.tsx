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
import { motion, AnimatePresence } from "framer-motion";
import { updateBookLocation } from "@/modules/books";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Menu as TauriMenu,
  Submenu,
  CheckMenuItem,
} from "@tauri-apps/api/menu";
import { ensureTray, setTrayMenu, clearTrayMenu } from "@components/lib/tray";
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
import { NavigationArrows, SwipeWrapper } from "./react-reader/components";
import { type SwipeEventData } from "react-swipeable";
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
import { customStore } from "@/stores/jotai";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const MIN_PARAGRAPH_LENGTH = 50;

export function usePdfNavigation(
  bookId: string,
  setDirection?: (dir: "left" | "right") => void
) {
  const [numPages, setNumPages] = useAtom(pageCountAtom);

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Determine if we should show dual-page view
  const isDualPage = useAtomValue(isDualPageAtom);

  const pdfHeight = windowSize.height - 10; // 60px top + 60px bottom
  const pdfWidth = windowSize.width - 10;
  // Calculate page dimensions: in dual-page mode, each page gets half the width
  const dualPageWidth = isDualPage ? (windowSize.width - 10) / 2 - 6 : pdfWidth; // 6px for gap between pages

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
      } catch (_error) {
        // Fallback to browser detection
        setIsFullscreen(document.fullscreenElement !== null);
      }
    };

    window.addEventListener("resize", handleResize);

    // Check fullscreen on resize as well
    const handleResizeAndFullscreen = async () => {
      handleResize();
      await checkFullscreen();
    };

    window.addEventListener("resize", handleResizeAndFullscreen);

    // Initial check
    void checkFullscreen();

    // Poll for fullscreen changes (Tauri doesn't have an event for this)
    const fullscreenCheckInterval = setInterval(checkFullscreen, 500);

    return () => {
      window.removeEventListener("resize", handleResizeAndFullscreen);
      clearInterval(fullscreenCheckInterval);
    };
  }, []);

  const previousPageSetter = useSetAtom(previousPageAtom);
  const previousPage = () => {
    setDirection?.("left");
    void previousPageSetter(bookId);
  };
  const nextPageSetter = useSetAtom(nextPageAtom);
  const nextPage = () => {
    setDirection?.("right");
    void nextPageSetter(bookId);
  };

  return {
    previousPage,
    nextPage,
    setNumPages,
    numPages,
    isDualPage,
    pdfHeight,
    pdfWidth,
    dualPageWidth,
    isFullscreen,
  };
}

export function PdfView({ book }: { book: BookData }): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");

  // Ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Track if we're currently auto-scrolling to prevent conflicts
  const isAutoScrollingRef = useRef(false);
  // Track last scroll position to detect user scrolling
  const lastScrollTopRef = useRef(0);
  // Timeout for debouncing scroll detection
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetParaphState = useSetAtom(resetParaphStateAtom);
  const setIsDualPage = useSetAtom(isDualPageAtom);

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
    pdfWidth,
    pdfHeight,
    dualPageWidth,
    isFullscreen,
  } = usePdfNavigation(book.id, setDirection);

  const handleThemeChange = (newTheme: ThemeType) => {
    setTheme(newTheme);
    setMenuOpen(false);
  };

  // Setup View submenu in the app menu for PDF view
  const isDualPageRef = useRef(isDualPage);

  // Keep ref in sync with current value
  useEffect(() => {
    isDualPageRef.current = isDualPage;
  }, [isDualPage]);

  useEffect(() => {
    let disposed = false;
    let previousAppMenu: TauriMenu | null = null;
    let viewSubmenu: Submenu | null = null;
    let twoPagesItem: CheckMenuItem | null = null;

    const setupMenu = async () => {
      try {
        // Get the default app menu
        const defaultMenu = await TauriMenu.default();
        previousAppMenu = await defaultMenu.setAsAppMenu();

        // Find or create View submenu
        viewSubmenu = (await defaultMenu.get("view")) as Submenu | null;
        if (!viewSubmenu) {
          viewSubmenu = await Submenu.new({
            id: "pdf",
            text: "pdf",
          });
          await defaultMenu.append(viewSubmenu);
        }

        // Remove existing two_pages item if it exists
        const existingItem = await viewSubmenu.get("two_pages");
        if (existingItem) {
          await viewSubmenu.remove(existingItem);
        }

        // Create CheckMenuItem for Two Pages
        // The action will toggle the current state by reading from the atom store
        twoPagesItem = await CheckMenuItem.new({
          id: "two_pages",
          text: "Two Pages",
          checked: isDualPageRef.current,
          action: () => {
            // Read current value from atom store and toggle
            const current = customStore.get(isDualPageAtom);
            setIsDualPage(!current);
          },
        });

        await viewSubmenu.append(twoPagesItem);

        // Set the modified menu as app menu
        await defaultMenu.setAsAppMenu();

        // Also set tray menu
        await ensureTray();
        await setTrayMenu(defaultMenu);
      } catch (error) {
        console.error("Error setting up menu:", error);
        // ignore tray/menu errors in environments that don't support them
      }
    };

    void setupMenu();

    return () => {
      disposed = true;
      void (async () => {
        try {
          // Remove the two_pages item on cleanup
          if (viewSubmenu && twoPagesItem) {
            await viewSubmenu.remove(twoPagesItem);
          }
          // Restore previous menu
          if (previousAppMenu) {
            await previousAppMenu.setAsAppMenu();
          } else {
            const def = await TauriMenu.default();
            await def.setAsAppMenu();
          }
          await clearTrayMenu();
        } catch (error) {
          console.error("Error cleaning up menu:", error);
        }
      })();
    };
  }, [setIsDualPage]); // Only run on mount/unmount, not when isDualPage changes

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
    // Determine direction based on page number comparison
    setDirection(itemPageNumber > pageNumber ? "right" : "left");
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

  // Auto-scroll functionality: detect when we reach the end of view and scroll up
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isDualPage) {
      // Don't auto-scroll in dual-page mode
      return;
    }

    const handleScroll = () => {
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Only check if we're not currently auto-scrolling
      if (isAutoScrollingRef.current) {
        return;
      }

      const currentScrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      // Calculate scroll position as a percentage (0 = top, 1 = bottom)
      const scrollPercentage = (currentScrollTop + clientHeight) / scrollHeight;

      // Threshold: trigger auto-scroll when within 15% of the bottom
      const bottomThreshold = 0.85;
      // Scroll amount: scroll up by 25% of viewport height
      const scrollUpAmount = clientHeight * 0.25;

      // Check if user scrolled down (not up) and we're near the bottom
      const scrolledDown = currentScrollTop > lastScrollTopRef.current;
      const nearBottom = scrollPercentage >= bottomThreshold;

      if (scrolledDown && nearBottom && currentScrollTop > scrollUpAmount) {
        // Debounce: wait a bit before auto-scrolling to avoid conflicts with user scrolling
        scrollTimeoutRef.current = setTimeout(() => {
          if (!isAutoScrollingRef.current) {
            isAutoScrollingRef.current = true;
            const targetScrollTop = currentScrollTop - scrollUpAmount;

            // Smooth scroll to the target position
            container.scrollTo({
              top: targetScrollTop,
              behavior: "smooth",
            });

            // Reset auto-scrolling flag after animation completes
            setTimeout(() => {
              isAutoScrollingRef.current = false;
            }, 500); // Animation duration
          }
        }, 300); // Wait 300ms after user stops scrolling
      }

      // Update last scroll position
      lastScrollTopRef.current = currentScrollTop;
    };

    // Reset scroll position when page changes
    const resetScroll = () => {
      if (container && !isAutoScrollingRef.current) {
        container.scrollTop = 0;
        lastScrollTopRef.current = 0;
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    // Reset scroll when page number changes
    resetScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [pageNumber, isDualPage]);

  // Calculate available height for PDF (viewport - top bar - bottom bar)

  return (
    <SwipeWrapper
      swipeProps={{
        onSwiped: (eventData: SwipeEventData) => {
          const { dir } = eventData;
          // Left swipe = next page, Right swipe = previous page
          if (dir === "Left") {
            setDirection("right");
            void nextPage();
          }
          if (dir === "Right") {
            setDirection("left");
            void previousPage();
          }
        },
        onTouchStartOrOnMouseDown: ({ event }) => event.preventDefault(),
        touchEventOptions: { passive: false },
        preventScrollOnSwipe: true,
        trackMouse: true, // Enable swipe with mouse drag
      }}
      onSwipeLeft={() => void nextPage()}
      onSwipeRight={() => void previousPage()}
    >
      <div
        ref={scrollContainerRef}
        className={cn(
          "relative h-screen w-full overflow-y-scroll ",
          !isDualPage ? "pt-96" : "",
          !isDualPage && isFullscreen ? "pt-[420px]" : "",
          getBackgroundColor()
        )}
      >
        <div className="z-100 absolute top-[48%]">
          <NavigationArrows
            onPrev={previousPage}
            onNext={nextPage}
            readerStyles={createIReactReaderTheme(themes[theme].readerTheme)}
          />
        </div>
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
        <div
          className="flex items-center justify-center  px-2 py-1"
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
              // Dual-page view - side by side with gap, using fixed height
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`dual-${pageNumber}`}
                  initial={{
                    opacity: 0,
                    x: direction === "right" ? 100 : -100,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction === "right" ? -100 : 100 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="flex items-center gap-3"
                >
                  {/* Hidden pages for previous view */}
                  {pageNumber >= 2 && (
                    <PageComponent
                      key={pageNumber - 2}
                      thispageNumber={pageNumber - 2}
                      pdfHeight={pdfHeight}
                      pdfWidth={dualPageWidth}
                      isHidden={true}
                      isDualPage={true}
                    />
                  )}
                  {pageNumber >= 1 && (
                    <PageComponent
                      key={pageNumber - 1}
                      thispageNumber={pageNumber - 1}
                      pdfHeight={pdfHeight}
                      pdfWidth={dualPageWidth}
                      isHidden={true}
                      isDualPage={true}
                    />
                  )}
                  <PageComponent
                    key={pageNumber}
                    thispageNumber={pageNumber}
                    pdfHeight={pdfHeight}
                    pdfWidth={dualPageWidth}
                    isHidden={false}
                    isDualPage={true}
                  />
                  {pageNumber + 1 <= numPages && (
                    <PageComponent
                      key={pageNumber + 1}
                      thispageNumber={pageNumber + 1}
                      pdfHeight={pdfHeight}
                      pdfWidth={dualPageWidth}
                      isHidden={false}
                      isDualPage={true}
                    />
                  )}
                  {/* Hidden pages for next view */}
                  {pageNumber + 2 <= numPages && (
                    <PageComponent
                      key={pageNumber + 2}
                      thispageNumber={pageNumber + 2}
                      pdfHeight={pdfHeight}
                      pdfWidth={dualPageWidth}
                      isHidden={true}
                      isDualPage={true}
                    />
                  )}
                  {pageNumber + 3 <= numPages && (
                    <PageComponent
                      key={pageNumber + 3}
                      thispageNumber={pageNumber + 3}
                      pdfHeight={pdfHeight}
                      pdfWidth={dualPageWidth}
                      isHidden={true}
                      isDualPage={true}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              // Single page view
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`single-${pageNumber}`}
                  initial={{
                    opacity: 0,
                    x: direction === "right" ? 100 : -100,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction === "right" ? -100 : 100 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="flex flex-col items-center"
                >
                  {pageNumber >= 1 && (
                    <PageComponent
                      key={pageNumber - 1}
                      thispageNumber={pageNumber - 1}
                      pdfWidth={pdfWidth}
                      isHidden={true}
                    />
                  )}
                  <PageComponent
                    key={pageNumber}
                    thispageNumber={pageNumber}
                    pdfWidth={pdfWidth}
                    isHidden={false}
                  />
                  {pageNumber + 1 <= numPages && (
                    <PageComponent
                      key={pageNumber + 1}
                      thispageNumber={pageNumber + 1}
                      pdfWidth={pdfWidth}
                      isHidden={true}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </Document>
          {/* TTS Controls - Bottom Center */}
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
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
    </SwipeWrapper>
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
  pdfWidth,
  isHidden = false,
  isDualPage = false,
}: {
  thispageNumber: number;
  pdfHeight?: number;
  pdfWidth?: number;
  isHidden: boolean;
  isDualPage?: boolean;
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
      height={isDualPage ? pdfHeight : undefined}
      width={isDualPage ? undefined : pdfWidth}
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
