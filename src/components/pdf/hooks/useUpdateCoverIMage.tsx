import { useEffect } from "react";
// import {
//   Sheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
// } from "@/components/ui/sheet";

// Import required CSS for text and annotation layers

import { isPdfRenderedAtom } from "@components/pdf/atoms/paragraph-atoms";
import { useAtomValue } from "jotai";
import { updateStoredCoverImage } from "../utils/updateStoredCoverImage";
import { Book } from "@/modules/kysley";

export function useUpdateCoverIMage(book: Book) {
  const isRendered = useAtomValue(isPdfRenderedAtom);
  useEffect(() => {
    if (isRendered(book.id)) {
      void updateStoredCoverImage(book);
    }
  }, [isRendered]);
}
