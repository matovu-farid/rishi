import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface PdfParagraphStore {
  currentParagraphIndex: number;
  currentParagraph: string;
  setCurrentParagraph: (paragraph: string) => void;
  setCurrentParagraphIndex: (index: number) => void;
  pageNumber: number;
  setPageNumber: (pageNumber: number) => void;
}
export const usePdfParagraphStore = create<PdfParagraphStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentParagraphIndex: 0,
      currentParagraph: "",
      pageNumber: 1,
      // Actions

      setCurrentParagraphIndex: (index: number) =>
        set({ currentParagraphIndex: index }),
      setCurrentParagraph: (paragraph: string) =>
        set({ currentParagraph: paragraph }),
      setPageNumber: (pageNumber: number) => set({ pageNumber: pageNumber }),
    }),
    {
      name: "pdf-paragraph-store", // Name for the store in devtools
    }
  )
);
