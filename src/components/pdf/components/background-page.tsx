import { Page } from "react-pdf";

import {
  setPageNumberToPageDataAtom,
} from "@components/pdf/atoms/paragraph-atoms";
import { useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";


export function BackgroundPageComponent({
  thispageNumber: pageNumber,
  pdfHeight,
  pdfWidth,
  isDualPage = false,
  onRenderComplete,
}: {
  thispageNumber: number;
  pdfHeight?: number;
  pdfWidth?: number;
  isDualPage?: boolean;
  bookId: string;
  onRenderComplete?: () => void;
}) {
  const setPageNumberToPageData = useSetAtom(setPageNumberToPageDataAtom);

  return (
    <Page

      pageNumber={pageNumber}
      key={'background-' + pageNumber.toString()}

      height={isDualPage ? pdfHeight : undefined}
      width={isDualPage ? undefined : pdfWidth}
      className={` rounded shadow-lg  h-[1540px]`}
      renderTextLayer={true}
      renderAnnotationLayer={true}
      canvasBackground="white"
      onGetTextSuccess={(data) => {
        setPageNumberToPageData({
          pageNumber,
          pageData: data,
        });
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
