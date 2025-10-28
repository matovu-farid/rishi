import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Types mirrored from Rust commands (subset)
export type SpineEntry = {
  idref: string;
  id?: string | null;
  properties?: string | null;
  linear: boolean;
};

export type ResourceEntry = {
  id: string;
  path: string;
  mime: string;
  properties?: string | null;
};

export type OpenBookResponse = {
  book_id: number;
  title?: string | null;
  spine: SpineEntry[];
  resources: ResourceEntry[];
};

export type NavItem = { label: string; href: string; children: NavItem[] };
export type GetNavResponse = {
  toc: NavItem[];
  page_list: NavItem[];
  landmarks: NavItem[];
  page_list_spine_indices: Array<number | null>;
};

export type PackagingResponse = {
  page_progression_direction?: string | null;
  guides: {
    type?: string | null;
    title?: string | null;
    href?: string | null;
  }[];
  rendition_layout?: string | null;
  rendition_flow?: string | null;
  rendition_orientation?: string | null;
  rendition_spread?: string | null;
  bindings: { media_type: string; handler: string }[];
  collections: {
    role?: string | null;
    links: { href?: string | null; rel?: string | null }[];
  }[];
};

export type LocationsResult = {
  total: number;
  by_spine: number[];
  locations: {
    spine_index: number;
    char_offset: number;
    progress_in_spine: number;
  }[];
};

export type LayoutOptions = {
  viewport_width?: number;
  viewport_height?: number;
  flow?: "paginated" | "scrolled";
  spread?: "auto" | "none" | "always";
  avg_char_width?: number;
  line_height?: number;
  column_gap?: number;
  min_spread_width?: number;
};

export type SpreadEntry = { left?: number | null; right?: number | null };
export type LayoutComputeResponse = {
  total_pages: number;
  pages_per_spine: number[];
  spread_mode: "auto" | "none" | "always" | string;
  spreads: SpreadEntry[];
  reading_direction?: string | null;
};

export type Rect = { x: number; y: number; width: number; height: number };
export type PageRect = { page_index: number; rects: Rect[] };

export async function openBook(path: string): Promise<OpenBookResponse> {
  return invoke("epub_open_book", { path });
}

export async function getNav(bookId: number): Promise<GetNavResponse> {
  return invoke("epub_get_nav", { bookId });
}

export async function getPackaging(bookId: number): Promise<PackagingResponse> {
  return invoke("epub_get_packaging", { bookId });
}

export async function computeLocations(
  bookId: number,
  charsPerLocation?: number
): Promise<LocationsResult> {
  return invoke("epub_compute_locations", { bookId, charsPerLocation });
}

export async function computeLayout(
  bookId: number,
  options?: LayoutOptions
): Promise<LayoutComputeResponse> {
  return invoke("layout_compute", { bookId, opts: options });
}

export async function mapPointToCFI(
  bookId: number,
  spineIndex: number,
  x: number,
  y: number,
  viewport: { width: number; height: number }
): Promise<string> {
  return invoke("map_point_to_cfi_cmd", {
    bookId,
    req: { spineIndex, x, y, viewport },
  });
}

export async function mapCFIRangeToRects(
  bookId: number,
  startSpineIndex: number,
  startCharOffset: number,
  endSpineIndex: number,
  endCharOffset: number,
  viewport: { width: number; height: number }
): Promise<PageRect[]> {
  return invoke("map_cfi_to_rects_cmd", {
    bookId,
    req: {
      startSpineIndex,
      startCharOffset,
      endSpineIndex,
      endCharOffset,
      viewport,
    },
  });
}

export async function mapCFIRangeToRectsStr(
  bookId: number,
  cfiRange: string,
  viewport: { width: number; height: number }
): Promise<PageRect[]> {
  return invoke("map_cfi_range_to_rects_str", {
    bookId,
    cfiRange,
    viewport,
  });
}

export async function getRenderPlan(
  bookId: number,
  startPage: number,
  pageCount: number
): Promise<any> {
  return invoke("rendition_render_plan", { bookId, startPage, pageCount });
}

export type Annotation = {
  id: string;
  kind: "highlight" | "underline" | "mark";
  cfi_range: string;
  color?: string | null;
  note?: string | null;
};

export async function listAnnotations(bookId: number): Promise<Annotation[]> {
  return invoke("annotations_list", { bookId });
}

export async function addAnnotation(
  bookId: number,
  annotation: Annotation
): Promise<void> {
  await invoke("annotations_add", { bookId, annotation });
}

export async function removeAnnotation(
  bookId: number,
  id: string
): Promise<void> {
  await invoke("annotations_remove", { bookId, id });
}

export async function listThemes(): Promise<
  Array<{ name: string; css: string }>
> {
  return invoke("themes_list");
}

export async function registerTheme(name: string, css: string): Promise<void> {
  await invoke("themes_register", { name, css });
}

export async function applyTheme(
  bookId: number,
  name: string
): Promise<string | null> {
  return invoke("themes_apply", { bookId, name });
}

export async function registerThemeWithFont(
  name: string,
  css: string,
  fontFamily?: string,
  fontWeight?: number
): Promise<void> {
  await invoke("themes_register_with_font", {
    name,
    css,
    fontFamily,
    fontWeight,
  });
}

export async function registerGlobalFont(
  family: string,
  src: string,
  weight?: number,
  style?: string
): Promise<void> {
  await invoke("themes_register_global_font", {
    family,
    src,
    weight,
    style,
  });
}

export async function getFontCss(): Promise<string> {
  return invoke("themes_get_font_css");
}

export async function registerFontCss(css: string): Promise<void> {
  await invoke("themes_register_font_css", { css });
}

export async function registerFontCssForBook(
  bookId: number,
  css: string
): Promise<void> {
  await invoke("themes_register_font_css_for_book", { bookId, css });
}

export async function registerFontFromResource(
  bookId: number,
  family: string,
  opts: { weight?: string; style?: string; id?: string; path?: string }
): Promise<string> {
  return invoke("themes_register_font_from_resource", {
    bookId,
    family,
    weight: opts.weight,
    style: opts.style,
    id: opts.id,
    path: opts.path,
  });
}

export type ReplacementMode = "none" | "base64" | "blobUrl";

export type ReplacementStrategy = {
  default: ReplacementMode;
  images?: ReplacementMode;
  fonts?: ReplacementMode;
  stylesheets?: ReplacementMode;
  scripts?: ReplacementMode;
};

export async function setResourceStrategy(
  bookId: number,
  strategy: ReplacementStrategy
): Promise<void> {
  await invoke("resource_set_strategy", { bookId, strategy });
}

export async function registerBlobUrl(
  bookId: number,
  path: string,
  blobUrl: string
): Promise<void> {
  await invoke("resource_register_blob", { bookId, path, blobUrl });
}

export async function getResource(
  bookId: number,
  params: { id?: string; path?: string; replacement?: ReplacementMode }
): Promise<{ mime: string; data: string; mode: string }> {
  return invoke("resource_get", { bookId, ...params });
}

export async function getHtmlWithInlinedCss(
  bookId: number,
  path: string
): Promise<string> {
  console.log("[Bridge] Calling resource_get_html_with_inlined_css", {
    bookId,
    path,
  });
  const result = await invoke<string>("resource_get_html_with_inlined_css", {
    bookId,
    path,
  });
  console.log(
    "[Bridge] Got result from resource_get_html_with_inlined_css, length:",
    result.length
  );
  return result;
}

export async function cfiToPageIndex(
  bookId: number,
  cfi: string
): Promise<number> {
  return invoke("cfi_page_index", { bookId, cfi });
}

export async function hrefToPageIndex(
  bookId: number,
  href: string
): Promise<number> {
  return invoke("href_to_page_index_cmd", { bookId, href });
}

export async function searchText(
  bookId: number,
  query: string,
  maxResults?: number
): Promise<Array<{ cfi: string; excerpt: string }>> {
  return invoke("search_text", { bookId, query, maxResults });
}

export async function offsetsToCfi(
  bookId: number,
  spineIndex: number,
  charOffset: number
): Promise<string> {
  return invoke("offsets_to_cfi", { bookId, spineIndex, charOffset });
}

// Player controls (Rust core)
export async function playerCreate(bookId: number): Promise<void> {
  await invoke("player_create", { bookId });
}
export async function playerPlay(bookId: number): Promise<void> {
  await invoke("player_play", { bookId });
}
export async function playerPause(bookId: number): Promise<void> {
  await invoke("player_pause", { bookId });
}
export async function playerResume(bookId: number): Promise<void> {
  await invoke("player_resume", { bookId });
}
export async function playerStop(bookId: number): Promise<void> {
  await invoke("player_stop", { bookId });
}
export async function playerNext(bookId: number): Promise<void> {
  await invoke("player_next", { bookId });
}
export async function playerPrev(bookId: number): Promise<void> {
  await invoke("player_prev", { bookId });
}
export async function playerState(
  bookId: number
): Promise<{ state: string; page_index: number; paragraph_index: number }> {
  return invoke("player_state", { bookId });
}
export async function playerSetPage(
  bookId: number,
  pageIndex: number
): Promise<void> {
  await invoke("player_set_page", { bookId, pageIndex });
}

export async function annotationsUpdate(
  bookId: number,
  annotation: Annotation
): Promise<void> {
  await invoke("annotations_update", { bookId, annotation });
}

export async function ttsEnqueueAudio(
  bookId: number,
  cfiRange: string,
  text: string,
  priority = 0,
  voice?: string,
  rate?: number
): Promise<void> {
  await invoke("tts_enqueue_audio", {
    bookId,
    cfiRange,
    text,
    priority,
    voice,
    rate,
  });
}

export async function saveAnnotations(
  bookId: number,
  path: string
): Promise<void> {
  await invoke("store_save_annotations", { bookId, path });
}

export async function loadAnnotations(
  bookId: number,
  path: string
): Promise<number> {
  return invoke("store_load_annotations", { bookId, path });
}

export async function saveLocations(
  bookId: number,
  path: string
): Promise<void> {
  await invoke("store_save_locations", { bookId, path });
}

// Paragraph extraction (Rust path)
export type Paragraph = { text: string; cfi_range: string };
export async function paragraphsCurrent(
  bookId: number,
  pageIndex: number,
  minLength = 50
): Promise<Paragraph[]> {
  return invoke("epub_paragraphs_current", { bookId, pageIndex, minLength });
}

export async function paragraphsNext(
  bookId: number,
  pageIndex: number,
  minLength = 50
): Promise<Paragraph[]> {
  return invoke("epub_paragraphs_next", { bookId, pageIndex, minLength });
}

export async function paragraphsPrev(
  bookId: number,
  pageIndex: number,
  minLength = 50
): Promise<Paragraph[]> {
  return invoke("epub_paragraphs_prev", { bookId, pageIndex, minLength });
}

// Events
export async function onRenditionRendered(
  handler: (payload: {
    bookId: number;
    page?: number;
    count?: number;
    totalPages?: number;
  }) => void
): Promise<UnlistenFn> {
  return listen("rendition://rendered", (event) => {
    handler(event.payload as any);
  });
}

export async function onRenditionLocationChanged(
  handler: (payload: { bookId: number; cfi: string }) => void
): Promise<UnlistenFn> {
  return listen("rendition://locationChanged", (event) => {
    handler(event.payload as any);
  });
}

// TTS Worker events
export async function onTtsAudioReady(
  handler: (payload: {
    bookId: number;
    cfiRange: string;
    audioPath: string;
  }) => void
): Promise<UnlistenFn> {
  return listen("tts://audioReady", (event) => {
    handler(event.payload as any);
  });
}

export async function onTtsError(
  handler: (payload: {
    bookId: number;
    cfiRange: string;
    error: string;
  }) => void
): Promise<UnlistenFn> {
  return listen("tts://error", (event) => {
    handler(event.payload as any);
  });
}

export async function ttsCancel(
  bookId: number,
  cfiRange: string
): Promise<number> {
  return invoke("tts_cancel", { bookId, cfiRange });
}

export async function ttsCancelAll(bookId: number): Promise<number> {
  return invoke("tts_cancel_all", { bookId });
}
