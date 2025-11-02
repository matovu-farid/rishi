import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { Link } from "@tanstack/react-router";
import React, { useEffect, useState, useMemo } from "react";
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
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";
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

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function PdfView({ book }: { book: BookData }): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Configure PDF.js options with CDN fallback for better font and image support
  const pdfOptions = useMemo<DocumentInitParameters>(
    () => ({
      cMapPacked: true,

      verbosity: 0,
    }),
    []
  );

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

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  // Determine if we should show dual-page view
  const shouldShowDualPage = () => {
    // Don't show dual-page in fullscreen mode (Books app behavior)
    if (isFullscreen) return false;

    // Show dual-page for medium and large views (>= 768px)
    // This includes 1024x770 (default medium size) and larger
    return windowSize.width >= 768;
  };

  const isDualPage = shouldShowDualPage();
  const pageIncrement = isDualPage ? 2 : 1;

  function changePage(offset: number) {
    setPageNumber((prevPageNumber) => {
      const newPageNumber = prevPageNumber + offset;
      if (newPageNumber >= 1 && newPageNumber <= numPages) {
        // Update book location when page changes
        updateBookLocationMutation.mutate({
          bookId: book.id,
          location: newPageNumber.toString(),
        });
        return newPageNumber;
      }
      return prevPageNumber;
    });
  }

  function onItemClick({ pageNumber: itemPageNumber }: { pageNumber: number }) {
    setPageNumber(itemPageNumber);
    setTocOpen(false);
    // Update book location when navigating via TOC
    updateBookLocationMutation.mutate({
      bookId: book.id,
      location: itemPageNumber.toString(),
    });
  }

  function previousPage() {
    changePage(-pageIncrement);
  }

  function nextPage() {
    changePage(pageIncrement);
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
    // If book has saved location, restore it
    if (book.current_location) {
      const savedPage = parseInt(book.current_location, 10);
      if (!isNaN(savedPage) && savedPage >= 1 && savedPage <= numPages) {
        setPageNumber(savedPage);
      }
    }
  }

  // Calculate available height for PDF (viewport - top bar - bottom bar)
  const pdfHeight = windowSize.height - 120; // 60px top + 60px bottom

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
              <Page
                pageNumber={pageNumber}
                height={pdfHeight}
                className=" rounded shadow-lg"
                renderTextLayer={true}
                renderAnnotationLayer={true}
                canvasBackground="white"
              />
              {pageNumber + 1 <= numPages && (
                <Page
                  pageNumber={pageNumber + 1}
                  height={pdfHeight}
                  className="rounded shadow-lg"
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  canvasBackground="white"
                />
              )}
            </div>
          ) : (
            // Single page view
            <Page
              pageNumber={pageNumber}
              height={pdfHeight}
              className="shadow-lg rounded"
              renderTextLayer={true}
              renderAnnotationLayer={true}
              canvasBackground="white"
            />
          )}
        </Document>
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
