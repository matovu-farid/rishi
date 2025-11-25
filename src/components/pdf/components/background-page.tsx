import { Page } from "react-pdf";

import {
  isTextItem,
  setPageNumberToPageDataAtom,
} from "@components/pdf/atoms/paragraph-atoms";
import { useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { createPage, savePageDataMany } from "@/modules/sql";
import { embed, saveVectors } from "@/generated";

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
  bookId: string;
  onRenderComplete?: () => void;
}) {
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
          const pageData = data.items
            .filter(isTextItem)
            .filter((item) => item.str.length > 0)
            .map((item, index) => {
              const id = `${bookId}-${pageNumber}-${index}`;
              return { id, bookId, data: item.str, pageNumber };
            });
          await createPage(pageNumber, bookId, pageData);
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
