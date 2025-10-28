import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRustReader } from "../hooks/useRustReader";
import RustTTSControls from "@/components/RustTTSControls";

export type RustEpubViewProps = {
  path: string;
  width?: number | string;
  height?: number | string;
  onLocationChanged?: (pageIndex: number) => void;
  flow?: "paginated" | "scrolled";
  onNavLoaded?: (toc: any[]) => void;
  searchQuery?: string;
  onSearchResults?: (results: { cfi: string; excerpt: string }[]) => void;
};

export function RustEpubView({
  path,
  width = "100%",
  height = "100%",
  onLocationChanged,
  flow,
  onNavLoaded,
  searchQuery,
  onSearchResults,
}: RustEpubViewProps) {
  console.log("[RustEpubView] Component rendered with path:", path);
  const {
    isLoading,
    error,
    html,
    next,
    prev,
    currentPage,
    totalPages,
    bookId,
    pageMeta,
    themeCss,
    annotationRects,
    setCurrentPage,
    toc,
  } = useRustReader({ path, layout: flow ? { flow } : undefined });
  console.log("[RustEpubView] Hook state:", {
    isLoading,
    error,
    bookId,
    htmlLength: html.length,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Report page index changes upstream
    onLocationChanged?.(currentPage);
  }, [currentPage, onLocationChanged]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    },
    [next, prev]
  );

  useEffect(() => {
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, [onKey]);

  // Link click navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el || bookId == null) return;
    const getViewport = () => {
      return {
        width: el.clientWidth,
        height: el.clientHeight,
      };
    };
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http")) return;
      e.preventDefault();
      import("@/reader/bridge").then(async ({ hrefToPageIndex }) => {
        try {
          const page = await hrefToPageIndex(Number(bookId), href);
          setCurrentPage(page);
        } catch {}
      });
    };
    const onMouseUp = (e: MouseEvent) => {
      if (bookId == null || !pageMeta) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;
      const rect = range.getBoundingClientRect();
      const hostRect = el.getBoundingClientRect();
      const x1 = rect.left - hostRect.left;
      const y1 = rect.top - hostRect.top;
      const x2 = rect.right - hostRect.left;
      const y2 = rect.bottom - hostRect.top;
      import("@/reader/bridge").then(
        async ({ mapPointToCFI, addAnnotation, mapCFIRangeToRectsStr }) => {
          try {
            const cfiStart = await mapPointToCFI(
              bookId,
              pageMeta.spineIndex,
              x1,
              y1,
              getViewport()
            );
            const cfiEnd = await mapPointToCFI(
              bookId,
              pageMeta.spineIndex,
              x2,
              y2,
              getViewport()
            );
            const cfiRange = `epubcfi(${cfiStart.replace(/^epubcfi\(|\)$/g, "")},${cfiEnd.replace(/^epubcfi\(|\)$/g, "")})`;
            const id = String(Date.now());
            await addAnnotation(bookId, {
              id,
              kind: "highlight",
              cfi_range: cfiRange,
            });
            // optional: could refresh overlay via plan; kept minimal
          } catch {}
        }
      );
    };
    el.addEventListener("click", handler);
    el.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("click", handler);
      el.removeEventListener("mouseup", onMouseUp);
    };
  }, [containerRef, bookId]);

  // Notify parent about loaded TOC (Rust path)
  useEffect(() => {
    if (toc && toc.length > 0) onNavLoaded?.(toc);
  }, [toc, onNavLoaded]);

  // Rust search integration
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!searchQuery || !bookId) {
        if (!searchQuery) onSearchResults?.([]);
        return;
      }
      const { searchText } = await import("@/reader/bridge");
      try {
        const results = await searchText(bookId, searchQuery, 50);
        if (!cancelled) onSearchResults?.(results);
      } catch {
        if (!cancelled) onSearchResults?.([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, searchQuery, onSearchResults]);

  const content = useMemo(() => ({ __html: html }), [html]);
  const styleTag = useMemo(() => ({ __html: themeCss || "" }), [themeCss]);

  // Debug: Log when content changes
  useEffect(() => {
    if (html) {
      console.log("[RustEpubView] HTML content updated:", {
        length: html.length,
        preview: html.substring(0, 200),
        hasHtml: html.includes("<html"),
        hasBody: html.includes("<body"),
      });
    }
  }, [html]);

  // Debug: Measure rendered content after mount
  useEffect(() => {
    if (!containerRef.current || !html) return;

    setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      const contentEl = container.querySelector("#epub-content-container");
      if (contentEl) {
        const scrollWidth = contentEl.scrollWidth;
        const clientWidth = contentEl.clientWidth;
        const scrollHeight = contentEl.scrollHeight;
        const clientHeight = contentEl.clientHeight;

        console.log("[RustEpubView] Rendered dimensions:", {
          scrollWidth,
          clientWidth,
          scrollHeight,
          clientHeight,
          hasOverflow: scrollWidth > clientWidth || scrollHeight > clientHeight,
          childCount: contentEl.childElementCount,
        });
      } else {
        console.warn("[RustEpubView] Content container not found in DOM");
      }
    }, 100);
  }, [html]);

  if (error)
    return (
      <div style={{ width, height, overflow: "auto" }}>Error: {error}</div>
    );
  if (isLoading) return <div style={{ width, height }}>Loading…</div>;

  // Apply CSS column layout for pagination (matches epub.js behavior)
  const isPaginated = flow === "paginated";

  return (
    <div style={{ width, height, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          overflow: isPaginated ? "hidden" : "auto",
          border: "1px solid #eee",
          position: "relative",
        }}
        ref={containerRef}
      >
        {/* Theme CSS injected for content */}
        {themeCss && <style dangerouslySetInnerHTML={styleTag} />}
        {/* Column layout CSS for pagination */}
        {isPaginated && (
          <style>
            {`
              #epub-content-container {
                column-width: 100%;
                column-gap: 32px;
                column-fill: auto;
                height: 100%;
                overflow: hidden;
              }
            `}
          </style>
        )}
        <div
          id="epub-content-container"
          style={
            isPaginated
              ? {
                  height: "100%",
                  columnWidth: "100%",
                  columnGap: "32px",
                  columnFill: "auto",
                  overflow: "hidden",
                }
              : {}
          }
          dangerouslySetInnerHTML={content}
        />
        {/* Highlight overlay */}
        {annotationRects
          .filter((a) => a.page_index === currentPage)
          .flatMap((a) =>
            a.rects.map((r, idx) => (
              <div
                key={`${a.id}-${idx}`}
                style={{
                  position: "absolute",
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.width * 100}%`,
                  height: `${r.height * 100}%`,
                  background: "rgba(255, 230, 0, 0.35)",
                  pointerEvents: "none",
                }}
              />
            ))
          )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 8,
        }}
      >
        <button onClick={prev} disabled={currentPage <= 0}>
          Prev
        </button>
        <div>
          {currentPage + 1} / {Math.max(totalPages, 1)}
        </div>
        <button onClick={next} disabled={currentPage >= totalPages - 1}>
          Next
        </button>
      </div>
      {/* TTS Controls */}
      {bookId != null && (
        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <RustTTSControls
            bookId={String(bookId)}
            getPageIndex={() => currentPage}
            goNext={async () => {
              await next();
            }}
            goPrev={async () => {
              await prev();
            }}
          />
        </div>
      )}
    </div>
  );
}

export default RustEpubView;
