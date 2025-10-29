import type { Contents } from "epubjs";
import type Section from "epubjs/types/section";
import type { SpineItem } from "epubjs/types/section";
import type View from "epubjs/types/managers/view";
import type Layout from "epubjs/types/layout";
import type Manager from "epubjs/types/managers/manager";
import type Mapping from "epubjs/types/mapping";
import type Rendition from "epubjs/types/rendition";
import type Annotations from "epubjs/types/annotations";
import type { EpubCFI } from "epubjs";

declare module "epubjs/types/section" {
  interface SpineItem {
    load(request: (url: string) => Promise<any>): Promise<Section>;
  }

  export default interface Section {
    pages?: number[];
    totalPages?: number;
    mapping?: {
      start: string;
      end: string;
    };
    document?: Document;
    load(request?: Function): Promise<Section>;
  }
}

declare module "epubjs/types/managers/view" {
  export default interface View {
    contents: Contents;
    section: Section;
    index: number;
  }
}

declare module "epubjs/types/annotations" {
  export default interface Annotations {
    _annotations: Record<string, any>;
    highlight(
      cfiRange: string | EpubCFI,
      data?: Record<string, unknown>,
      cb?: () => void,
      className?: string,
      styles?: Record<string, unknown>
    ): any;
    remove(cfiRange: string | EpubCFI, type: string): void;
  }
}

declare module "epubjs/types/layout" {
  export default interface Layout {
    pageWidth: number;
    height: number;
  }
}

declare module "epubjs/types/managers/manager" {
  export default interface Manager {
    views: View[] & {
      find: ({ index }: { index: number }) => View | undefined;
    };
    layout: Layout;
    currentLocation(): Section[];
    mapping: Mapping;
    visible(): View[];
    settings: {
      axis: "horizontal" | "vertical";
      [key: string]: any;
    };
  }
}

declare module "epubjs/types/rendition" {
  export default interface Rendition {
    manager: Manager;
    annotations: Annotations;
    settings: {
      ignoreClass: string;
      [key: string]: any;
    };
  }
}

declare module "epubjs/types/mapping" {
  export default interface Mapping {
    page(
      contents: Contents,
      cfiBase: string,
      start: number,
      end: number
    ): { start: string; end: string } | null;
  }
}
