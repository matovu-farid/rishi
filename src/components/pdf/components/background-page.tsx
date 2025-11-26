import { Page } from "react-pdf";

import {
  backgroundPageAtom,
  isTextItem,
} from "@components/pdf/atoms/paragraph-atoms";
import { Loader2 } from "lucide-react";
import { createPage } from "@/modules/sql";
import { wordsToFinalParagraphs } from "../utils/wordsToParaagraphs";
import { useSetAtom } from "jotai";
import { retry } from "ts-retry-promise";

export function BackgroundPageComponent({
  thispageNumber: pageNumber,
  pdfHeight,
  pdfWidth,
  isDualPage = false,
  onRenderComplete,
  bookId,
}: {
  thispageNumber: number;
  pdfHeight?: number;
  pdfWidth?: number;
  isDualPage?: boolean;
  bookId: number;
  onRenderComplete?: () => void;
}) {
  const setBackgroundPage = useSetAtom(backgroundPageAtom);
  return (
    <Page
      pageNumber={pageNumber}
      key={"background-" + pageNumber.toString()}
      height={isDualPage ? pdfHeight : undefined}
      width={isDualPage ? undefined : pdfWidth}
      className={` rounded shadow-lg  h-[1540px]`}
      renderTextLayer={true}
      renderAnnotationLayer={true}
      canvasBackground="white"
      onGetTextSuccess={async (data) => {
        try {
          let pageData = data.items
            .filter(isTextItem)
            .filter((item) => item.str.length > 0)
            .map((item) => item.str);
          // const tokenizedData = await tokenize({ text: pageData });
          const paragraphs = wordsToFinalParagraphs(pageData);
          const page = paragraphs.map((item, index) => {
            // Generate unique ID: pageNumber * 1000000 + bookId * 10000 + index
            // This allows up to 9999 paragraphs per page and 9999 books
            // Format ensures no collisions between pages/books
            const id = pageNumber * 1000000 + bookId * 10000 + index;

            return { id, bookId, data: item, pageNumber };
          });
          await retry(() => createPage(pageNumber, bookId, page), {
            retries: 3,
          });

          setBackgroundPage((pageNumber) => pageNumber + 1);
        } catch (error) {
          console.error(error);
        }
      }}
      loading={
        <div className="w-screen bg-white  h-screen grid place-items-center">
          <Loader2 size={20} className="animate-spin" />
        </div>
      }
      onRenderSuccess={() => {
        onRenderComplete?.();
      }}
    />
  );
}
