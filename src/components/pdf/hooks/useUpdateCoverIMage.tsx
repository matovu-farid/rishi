import { useEffect } from "react";
// import {
//   Sheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
// } from "@/components/ui/sheet";

import { BookData } from "@/generated";

// Import required CSS for text and annotation layers

import { isPdfRenderedAtom } from "@components/pdf/atoms/paragraph-atoms";
import { useAtomValue } from "jotai";
import { updateStoredCoverImage } from "../utils/updateStoredCoverImage";

export function useUpdateCoverIMage(book: BookData) {
  const isRendered = useAtomValue(isPdfRenderedAtom);
  useEffect(() => {
    if (isRendered(book.id)) {
      void updateStoredCoverImage(book);
    }
  }, [isRendered]);
}
