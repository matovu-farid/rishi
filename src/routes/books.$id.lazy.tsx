import Loader from "@components/Loader";
import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { ReactReader } from "@components/react-reader";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Book } from "@/types";
import React, { useEffect, useRef } from "react";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { Menu } from "@components/ui/Menu";
import { Radio, RadioGroup } from "@components/ui/Radio";
import { ThemeType } from "@/themes/common";
import { themes } from "@/themes/themes";
import createIReactReaderTheme from "@/themes/readerThemes";
import { Palette } from "lucide-react";
import { useState } from "react";
import { TTSControls } from "@components/TTSControls";
import { getBooks, updateCurrentBookId } from "@/modules/epub";
import { Rendition } from "@/epubjs/types";
import { convertFileSrc } from "@tauri-apps/api/core";

export const Route = createLazyFileRoute("/books/$id")({
  component: () => <BookView />,
});
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

function updateTheme(rendition: Rendition, theme: ThemeType) {
  const reditionThemes = rendition.themes;
  reditionThemes.override("color", themes[theme].color);
  reditionThemes.override("background", themes[theme].background);
  reditionThemes.override("font-size", "1.2em");
}

function BookView(): React.JSX.Element {
  const { id } = Route.useParams() as { id: string };
  const rendition = useRef<Rendition | undefined>(undefined);
  const [renditionState, setRenditionState] = useState<Rendition | null>();
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (rendition.current) {
      updateTheme(rendition.current, theme);
    }
  }, [theme]);
  const {
    isPending,
    error,
    data: book,
    isError,
  } = useQuery({
    queryKey: ["book"],
    queryFn: async () => {
      const books = await getBooks();
      const book = books.find((book: Book) => book.id === id);
      if (!book) throw new Error("Book not found");

      return book;
    },
  });
  const handleThemeChange = (newTheme: ThemeType) => {
    setTheme(newTheme);
    setMenuOpen(false);
  };
  const queryClient = useQueryClient();
  const updateBookId = useMutation({
    mutationFn: async ({ book, newId }: { book: Book; newId: string }) => {
      await updateCurrentBookId(book.internalFolderName, newId);
    },

    onError(error) {
      toast.error("Can not change book page");
      console.log({ error });
    },
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: ["book"] });
      await queryClient.invalidateQueries({ queryKey: ["pageView"] });
    },
  });

  // Update rendition state when ref becomes available
  useEffect(() => {
    rendition.current?.on("rendered", () => {
      if (rendition.current === renditionState) return;
      setRenditionState(rendition.current);
    });
  }, [renditionState]);

  if (isError)
    return (
      <div className="w-full h-full place-items-center grid">
        {" "}
        {error.message}
      </div>
    );
  if (isPending)
    return (
      <div className="w-full h-full place-items-center grid">
        <Loader />
      </div>
    );

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

  return (
    <div className="relative">
      Hello
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <Link to="/">
          <Button
            disabled={book.currentBookId === 0}
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
        <ReactReader
          loadingView={
            <div className="w-full h-screen grid items-center">
              <Loader />
            </div>
          }
          url={book.epubPath}
          title={book.title}
          location={book.currentBookId || 0}
          locationChanged={(epubcfi: string) => {
            updateBookId.mutate({ book, newId: epubcfi });
          }}
          swipeable={true}
          readerStyles={createIReactReaderTheme(themes[theme].readerTheme)}
          getRendition={(_rendition) => {
            updateTheme(_rendition, theme);
            rendition.current = _rendition;
            setRenditionState(_rendition);
          }}
        />
      </div>
      {/* TTS Controls - Bottom Center */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50">
        {renditionState && (
          <TTSControls bookId={book.id} rendition={renditionState} />
        )}
      </div>
    </div>
  );
}
