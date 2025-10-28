import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  openBook,
  getNav,
  getPackaging,
  computeLayout,
  getRenderPlan,
  getHtmlWithInlinedCss,
  type LayoutOptions,
} from "@/reader/bridge";
import { errorTracker } from "@/services/errorTracking";
import { isDebugMode } from "@/utils/isDebugMode";

type UseRustReaderArgs = {
  path: string;
  layout?: LayoutOptions;
  initialPage?: number;
};

export function useRustReader({
  path,
  layout,
  initialPage = 0,
}: UseRustReaderArgs) {
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const loadingRef = useRef(false);
  const pathRef = useRef(path);
  const hasOpenedRef = useRef(false);

  const [bookId, setBookId] = useState<number | null>(null);

  // Structured logging helper (only active in debug mode)
  const logDebug = useCallback(
    (stage: string, data: any) => {
      if (!isDebugMode()) {
        return;
      }

      const logData = {
        timestamp: new Date().toISOString(),
        bookId,
        ...data,
      };
      console.log(`[EPUB_READER:${stage}]`, logData);
      errorTracker.addError({
        timestamp: logData.timestamp,
        stage,
        book_id: bookId ?? undefined,
        severity: "debug",
        message: JSON.stringify(data),
        context: logData,
      });
    },
    [bookId]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalPages, setTotalPages] = useState(0);
  const [pagesPerSpine, setPagesPerSpine] = useState<number[]>([]);
  const [spreads, setSpreads] = useState<
    { left?: number | null; right?: number | null }[]
  >([]);
  const [readingDirection, setReadingDirection] = useState<string | null>(null);
  const [toc, setToc] = useState<any[]>([]);

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [html, setHtml] = useState<string>("");
  const [themeCss, setThemeCss] = useState<string | null>(null);
  const [annotationRects, setAnnotationRects] = useState<
    {
      id: string;
      kind: string;
      page_index: number;
      rects: { x: number; y: number; width: number; height: number }[];
    }[]
  >([]);
  const [layoutComputed, setLayoutComputed] = useState(false);
  const [pageMeta, setPageMeta] = useState<{
    spineIndex: number;
    startChar: number;
  } | null>(null);

  const pageWindow = useMemo(
    () => ({ start: currentPage, count: 1 }),
    [currentPage]
  );

  const load = useCallback(async () => {
    if (loadingRef.current) {
      console.log("[useRustReader] Already loading, skipping...");
      return;
    }
    if (hasOpenedRef.current && pathRef.current === path) {
      console.log(
        "[useRustReader] Book already opened for this path, skipping..."
      );
      return;
    }
    loadingRef.current = true;
    pathRef.current = path;
    hasOpenedRef.current = true;
    try {
      setIsLoading(true);
      setError(null);
      setLayoutComputed(false);
      // Convert asset:// URL to file system path
      const filePath = path.startsWith("asset://localhost/")
        ? decodeURIComponent(path.replace("asset://localhost/", "/"))
        : path;
      logDebug("BOOK_OPENING", { path: filePath });
      const open = await openBook(filePath);
      logDebug("BOOK_OPENED", {
        bookId: open.book_id,
        title: open.title,
        spineLength: open.spine.length,
        resourcesLength: open.resources.length,
      });
      setBookId(open.book_id);
      // warm navigation and packaging
      try {
        const [nav] = await Promise.all([
          getNav(open.book_id),
          getPackaging(open.book_id),
        ]);
        setToc(nav?.toc || []);
      } catch {}
      // Ensure we provide required viewport dimensions
      const layoutOptions = {
        viewport_width: 1024,
        viewport_height: 768,
        flow: "paginated" as const,
        spread: "auto" as const,
        ...layoutRef.current,
      };
      logDebug("LAYOUT_START", { options: layoutOptions });
      const layoutResp = await computeLayout(open.book_id, layoutOptions);
      logDebug("LAYOUT_COMPLETE", {
        totalPages: layoutResp.total_pages,
        pagesPerSpine: layoutResp.pages_per_spine,
        spreadsLength: layoutResp.spreads.length,
        readingDirection: layoutResp.reading_direction,
        spreadMode: layoutResp.spread_mode,
      });
      setTotalPages(layoutResp.total_pages);
      setPagesPerSpine(layoutResp.pages_per_spine);
      setSpreads(layoutResp.spreads);
      setReadingDirection(layoutResp.reading_direction ?? null);
      setCurrentPage(Math.min(initialPage, layoutResp.total_pages - 1));
      setLayoutComputed(true);
    } catch (e: any) {
      console.error("[useRustReader] Error during book loading:", e);
      setError(e?.message ?? "Failed to open book");
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [path]);

  const render = useCallback(async () => {
    if (bookId == null || !layoutComputed) return;
    try {
      logDebug("RENDER_PLAN_REQUEST", { page: pageWindow.start });
      const plan: any = await getRenderPlan(
        bookId,
        pageWindow.start,
        pageWindow.count
      );
      logDebug("RENDER_PLAN_RECEIVED", {
        pagesCount: plan.pages?.length,
        hasThemeCss: !!plan.theme_css,
        annotationsCount: plan.annotations?.length || 0,
      });
      setThemeCss(plan.theme_css ?? null);
      setAnnotationRects(
        Array.isArray(plan.annotations) ? plan.annotations : []
      );
      const p = plan.pages?.[0];
      if (p?.href) {
        try {
          logDebug("HTML_RETRIEVAL_REQUEST", {
            href: p.href,
            pageIndex: p.page_index,
            spineIndex: p.spine_index,
          });
          const html = await getHtmlWithInlinedCss(bookId, p.href);
          logDebug("HTML_RETRIEVED", { htmlLength: html.length, href: p.href });

          // Content verification and structure check
          const signature = html.substring(0, 100).trim();
          const hasHtmlTag = html.includes("<html") || html.includes("<HTML");
          const hasBodyTag = html.includes("<body") || html.includes("<BODY");
          const hasHeadTag = html.includes("<head") || html.includes("<HEAD");
          const hasBaseTag = html.includes("<base ");
          const hasContent = html.length > 100;

          logDebug("CONTENT_VERIFICATION", {
            page: pageWindow.start,
            signature,
            htmlLength: html.length,
            structure: {
              hasHtmlTag,
              hasBodyTag,
              hasHeadTag,
              hasBaseTag,
              hasContent,
            },
          });

          // Warn about structural issues
          if (!hasHtmlTag) {
            errorTracker.addError({
              timestamp: new Date().toISOString(),
              stage: "CONTENT_VERIFICATION",
              book_id: bookId,
              severity: "warning",
              message: "HTML missing <html> tag",
              context: { href: p.href },
            });
          }
          if (!hasBodyTag) {
            errorTracker.addError({
              timestamp: new Date().toISOString(),
              stage: "CONTENT_VERIFICATION",
              book_id: bookId,
              severity: "warning",
              message: "HTML missing <body> tag",
              context: { href: p.href },
            });
          }

          setHtml(html);
        } catch (err) {
          errorTracker.addError({
            timestamp: new Date().toISOString(),
            stage: "HTML_RETRIEVAL",
            book_id: bookId,
            severity: "error",
            message: err instanceof Error ? err.message : String(err),
            context: { href: p.href },
          });
          setHtml("<div>Error loading content</div>");
        }
        if (
          typeof p.spine_index === "number" &&
          typeof p.start_char === "number"
        ) {
          setPageMeta({ spineIndex: p.spine_index, startChar: p.start_char });
        } else {
          setPageMeta(null);
        }
      } else {
        logDebug("RENDER_NO_HREF", { planPages: plan.pages });
        setHtml("<div></div>");
        setPageMeta(null);
      }
    } catch (e) {
      errorTracker.addError({
        timestamp: new Date().toISOString(),
        stage: "RENDER",
        book_id: bookId ?? undefined,
        severity: "error",
        message: e instanceof Error ? e.message : String(e),
        context: { page: pageWindow.start },
      });
      setHtml("<div></div>");
    }
  }, [bookId, pageWindow, layoutComputed, logDebug]);

  useEffect(() => {
    load();
  }, [load]);

  // Handle initialPage changes separately to avoid recreating load function
  useEffect(() => {
    if (totalPages > 0) {
      setCurrentPage(Math.min(initialPage, totalPages - 1));
    }
  }, [initialPage, totalPages]);

  useEffect(() => {
    render();
  }, [render]);

  const next = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  const prev = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);

  return {
    isLoading,
    error,
    bookId,
    totalPages,
    pagesPerSpine,
    spreads,
    readingDirection,
    currentPage,
    setCurrentPage,
    html,
    themeCss,
    annotationRects,
    next,
    prev,
    pageMeta,
    toc,
  } as const;
}
