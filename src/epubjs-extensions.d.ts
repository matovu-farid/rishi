import 'epubjs';
import type { Contents } from 'epubjs';

declare module 'epubjs/types/section' {
  interface default {
    pages?: number[];
    totalPages?: number;
    next(): SpineItem;
    prev(): SpineItem;
    load(request: (url: string) => Promise<any>): Promise<default>;
  }
}

declare module 'epubjs/types/spine' {
  interface default {
    load(request: (url: string) => Promise<any>): Promise<Section>;
  }
}

declare module 'epubjs/types/managers/view' {
  interface default {
    contents: Contents;
    section: Section;
  }
}

declare module 'epubjs/types/layout' {
  interface default {
    pageWidth: number;
    height: number;
  }
}

declare module 'epubjs/types/managers/manager' {
  interface default {
    views: View[] & {
      find: ({ index }: { index: number }) => View | undefined;
    };
    layout: Layout;
    currentLocation(): Section[];
    mapping: Mapping;
    settings: {
      axis: 'horizontal' | 'vertical';
      [key: string]: any;
    };
  }
}

declare module 'epubjs/types/rendition' {
  interface default {
    manager: Manager;
    settings: {
      ignoreClass: string;
      [key: string]: any;
    };
  }
}

declare module 'epubjs/types/mapping' {
  interface default {
    page(
      contents: Contents,
      cfiBase: string,
      start: number,
      end: number
    ): { start: string; end: string } | null;
  }
}

