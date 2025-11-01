import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { Link } from "@tanstack/react-router";
import React, { useCallback, useRef } from "react";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { Menu } from "@components/ui/Menu";
import { Radio, RadioGroup } from "@components/ui/Radio";
import { ThemeType } from "@/themes/common";
import { themes } from "@/themes/themes";
import { Palette } from "lucide-react";
import { useState } from "react";
import { Rendition } from "epubjs/types";
import { updateBookLocation } from "@/modules/books";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Document, Page, Outline } from "react-pdf";

import { BookData } from "@/generated";

import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
function highlightPattern(text: string, pattern: string) {
  return text.replace(pattern, (value) => `<mark>${value}</mark>`);
}

function updateTheme(rendition: Rendition, theme: ThemeType) {
  const reditionThemes = rendition.themes;
  reditionThemes.override("color", themes[theme].color);
  reditionThemes.override("background", themes[theme].background);
  reditionThemes.override("font-size", "1.2em");
}

export function PdfView({ book }: { book: BookData }): React.JSX.Element {
  const [searchText, setSearchText] = useState("");
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleThemeChange = (newTheme: ThemeType) => {
    setTheme(newTheme);
    setMenuOpen(false);
  };
  const textRenderer = useCallback(
    (textItem: { str: string }) => highlightPattern(textItem.str, searchText),
    [searchText]
  );
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

  // Create stable debounced function that uses the latest mutation
  const mutationRef = useRef(updateBookLocationMutation);
  mutationRef.current = updateBookLocationMutation;

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
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  function changePage(offset: number) {
    setPageNumber((prevPageNumber) => prevPageNumber + offset);
  }
  function onItemClick({ pageNumber: itemPageNumber }: { pageNumber: number }) {
    setPageNumber(itemPageNumber);
  }

  function previousPage() {
    changePage(-1);
  }

  function nextPage() {
    changePage(1);
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }
  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearchText(event.target.value);
  }

  return (
    <div className=" relative h-full w-full">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <Link to="/">
          <Button
            variant="ghost"
            className={cn("disabled:invisible", getTextColor())}
          >
            Back
          </Button>
        </Link>

        <Menu
          trigger={
            <IconButton className={cn("hover:bg-transparent border-none")}>
              <Palette size={20} className={getTextColor()} />
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
      </div>

      <Document
        className="h-full w-full "
        error={<div>Error loading PDF</div>}
        file={convertFileSrc(book.filePath)}
        onLoadSuccess={onDocumentLoadSuccess}
        onItemClick={onItemClick}
      >
        <Outline onItemClick={onItemClick} />
        {Array.from(new Array(numPages), (el, index) => (
          <Page key={`page_${index + 1}`} pageNumber={index + 1} />
        ))}
      </Document>
      <div>
        <label htmlFor="search">Search:</label>
        <input
          type="search"
          id="search"
          value={searchText}
          onChange={onChange}
        />
      </div>
      <p>
        Page {pageNumber} of {numPages}
      </p>
      <button type="button" disabled={pageNumber <= 1} onClick={previousPage}>
        Previous
      </button>
      <button
        type="button"
        disabled={pageNumber >= numPages}
        onClick={nextPage}
      >
        Next
      </button>
    </div>
  );
}
