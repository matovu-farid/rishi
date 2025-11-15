import Loader from "@components/Loader";
import { ReactReader } from "@components/react-reader";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { Link } from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { Menu } from "@components/ui/Menu";
import { Radio, RadioGroup } from "@components/ui/Radio";
import { ThemeType } from "@/themes/common";
import { themes } from "@/themes/themes";
import createIReactReaderTheme from "@/themes/readerThemes";
import { Palette } from "lucide-react";
import TTSControls from "@components/TTSControls";
import { Rendition } from "epubjs/types";
import { synchronizedUpdateBookLocation } from "@/modules/sync_books";
import { convertFileSrc } from "@tauri-apps/api/core";
import { BookData } from "@/generated";
import { motion, AnimatePresence } from "framer-motion";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  currentEpubLocationAtom,
  getEpubCurrentViewParagraphsAtom,
  getEpubNextViewParagraphsAtom,
  getEpubPreviousViewParagraphsAtom,
  loadableEpubNextViewParagraphsAtom,
  renditionAtom,
} from "@/stores/epub_atoms";
import {
  eventBus,
  EventBusEvent,
  eventBusLogsAtom,
  PlayingState,
} from "@/utils/bus";
import { highlightRange, removeHighlight } from "@/epubwrapper";
import { customStore } from "@/stores/jotai";
import { getCurrentViewParagraphsAtom } from "./pdf/atoms/paragraph-atoms";

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

function updateTheme(rendition: Rendition, theme: ThemeType) {
  const reditionThemes = rendition.themes;
  reditionThemes.override("color", themes[theme].color);
  reditionThemes.override("background", themes[theme].background);
  reditionThemes.override("font-size", "1.2em");
}

export function EpubView({ book }: { book: BookData }): React.JSX.Element {
  //const rendition = useRef<Rendition | undefined>(undefined);
  const [theme, setTheme] = useState<ThemeType>(ThemeType.White);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string>(
    book.location || "0"
  );
  const [direction, setDirection] = useState<"left" | "right">("right");
  const navigationDirectionRef = useRef<"left" | "right">("right");
  const [animationKey, setAnimationKey] = useState(0);
  const animationTriggerRef = useRef(0);
  const [rendition, setRendition] = useAtom(renditionAtom);

  async function clearAllHighlights() {
    if (!rendition) return;
    const paragraphs = await customStore.get(getEpubCurrentViewParagraphsAtom);

    return Promise.all(
      paragraphs.map((paragraph) => removeHighlight(rendition, paragraph.index))
    );
  }

  useAtomValue(eventBusLogsAtom);

  useEffect(() => {
    if (!rendition) return;
    eventBus.subscribe(EventBusEvent.NEXT_PAGE_PARAGRAPHS_EMPTIED, async () => {
      await clearAllHighlights();
      await rendition.next();
      eventBus.publish(EventBusEvent.PAGE_CHANGED);
    });

    eventBus.subscribe(
      EventBusEvent.PREVIOUS_PAGE_PARAGRAPHS_EMPTIED,
      async () => {
        await clearAllHighlights();
        await rendition.prev();
        eventBus.publish(EventBusEvent.PAGE_CHANGED);
      }
    );
    eventBus.subscribe(EventBusEvent.PLAYING_AUDIO, async (paragraph) => {
      console.log(">>> PLAYING_AUDIO", paragraph);
      await highlightRange(rendition, paragraph.index);
    });
    eventBus.subscribe(EventBusEvent.AUDIO_ENDED, async (paragraph) => {
      await removeHighlight(rendition, paragraph.index);
    });
    eventBus.subscribe(
      EventBusEvent.MOVED_TO_NEXT_PARAGRAPH,
      async ({ from: paragraph }) => {
        await removeHighlight(rendition, paragraph.index);
      }
    );
    eventBus.subscribe(
      EventBusEvent.MOVED_TO_PREV_PARAGRAPH,
      async ({ from: paragraph }) => {
        await removeHighlight(rendition, paragraph.index);
      }
    );
    eventBus.subscribe(
      EventBusEvent.PLAYING_STATE_CHANGED,
      async (playingState) => {
        if (playingState !== PlayingState.Playing) {
          await clearAllHighlights();
          // const paragraphs = customStore.get(getCurrentViewParagraphsAtom);
          // for (const paragraph of paragraphs) {
          //   await removeHighlight(rendition, paragraph.index);
          // }
        }
      }
    );
  }, [rendition]);

  useEffect(() => {
    if (rendition) {
      updateTheme(rendition, theme);
    }
  }, [theme]);

  const setCurrentEpubLocation = useSetAtom(currentEpubLocationAtom);

  // Track navigation direction by intercepting prev/next when rendition is available
  useEffect(() => {
    if (rendition) {
      const originalPrev = rendition.prev;
      const originalNext = rendition.next;

      rendition.prev = function () {
        navigationDirectionRef.current = "left";
        return originalPrev.call(this);
      };

      rendition.next = function () {
        navigationDirectionRef.current = "right";
        return originalNext.call(this);
      };
    }
  }, [rendition]);

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
      await synchronizedUpdateBookLocation(bookId, location);
    },

    onError(_error) {
      toast.error("Can not change book page");
    },
  });

  // Update rendition state when ref becomes available

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
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <Link to="/">
          <Button
            variant="ghost"
            className={cn("disabled:invisible cursor-pointer", getTextColor())}
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
      <div
        style={{ height: "100vh", position: "relative", overflow: "hidden" }}
      >
        <ReactReader
          key={`reader-${book.id}`}
          loadingView={
            <div className="w-full h-screen grid items-center">
              <Loader />
            </div>
          }
          url={convertFileSrc(book.filepath)}
          title={book.title}
          location={currentLocation || book.location || 0}
          locationChanged={(epubcfi: string) => {
            // Use tracked navigation direction from intercepted prev/next calls
            setDirection(navigationDirectionRef.current);
            setCurrentLocation(epubcfi);
            animationTriggerRef.current += 1;
            setAnimationKey(animationTriggerRef.current);

            // Use debounced update to prevent race condition and excessive DB writes
            updateBookLocationMutation.mutate({
              bookId: book.id,
              location: epubcfi,
            });

            setCurrentEpubLocation(epubcfi);
          }}
          swipeable={true}
          readerStyles={createIReactReaderTheme(themes[theme].readerTheme)}
          getRendition={(_rendition) => {
            updateTheme(_rendition, theme);
            _rendition.on("rendered", () => {
              setRendition(_rendition);
            });
          }}
        />
        <AnimatePresence>
          {animationKey > 0 && (
            <motion.div
              key={animationKey}
              initial={{
                opacity: 0.3,
                x: direction === "right" ? 100 : -100,
              }}
              animate={{
                opacity: 0,
                x: 0,
              }}
              exit={{
                opacity: 0,
              }}
              transition={{
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1],
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                backgroundColor: themes[theme].background,
                zIndex: 10,
              }}
            />
          )}
        </AnimatePresence>
      </div>
      {/* TTS Controls - Draggable */}
      {<TTSControls bookId={book.id} />}
    </div>
  );
}
