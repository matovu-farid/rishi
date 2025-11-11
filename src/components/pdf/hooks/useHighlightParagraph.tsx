import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { highlightedParagraphIndexAtom, pageNumberAtom, paragraphsAtom } from "../atoms/paragraph-atoms";

export function useHighlightParagraph() {
    const currentPageNumber = useAtomValue(pageNumberAtom);
    const paragraphs = useAtomValue(paragraphsAtom);
    const currentParagraphs = paragraphs(currentPageNumber);
    const setHighlightedParagraphIndex = useSetAtom(
      highlightedParagraphIndexAtom
    );
    const firstParagraphIndex =
      currentParagraphs.length > 0 ? currentParagraphs[0].index : "";
  
    useEffect(() => {
      if (firstParagraphIndex) {
        setHighlightedParagraphIndex(firstParagraphIndex);
      }
    }, [firstParagraphIndex]);
}