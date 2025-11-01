import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { Link } from "@tanstack/react-router";
import React, { useRef } from "react";
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
import { Document, Page } from "react-pdf";

import { BookData } from "@/generated";

import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

function updateTheme(rendition: Rendition, theme: ThemeType) {
  const reditionThemes = rendition.themes;
  reditionThemes.override("color", themes[theme].color);
  reditionThemes.override("background", themes[theme].background);
  reditionThemes.override("font-size", "1.2em");
}

export function PdfView({ book }: { book: BookData }): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  return (
    <div className="relative">
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
      <div style={{ height: "100vh" }}>
        <div>
          <Document
            file={convertFileSrc(book.filePath)}
            onLoadSuccess={onDocumentLoadSuccess}
          >
            <Page pageNumber={pageNumber} />
          </Document>
          <p>
            Page {pageNumber} of {numPages}
          </p>
        </div>
      </div>
    </div>
  );
}
