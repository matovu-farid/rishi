import { Page } from "react-pdf";

import {
  highlightedParagraphAtom,
  isHighlightingAtom,
  pageNumberAtom,
  isPdfRenderedAtom,
  setPageNumberToPageData,
} from "@components/pdf/atoms/paragraph-atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { Loader2 } from "lucide-react";

type Transform = [number, number, number, number, number, number];

const PARAGRAPH_INDEX_PER_PAGE = 10000;
export function PageComponent({
  thispageNumber: pageNumber,
  pdfHeight,
  pdfWidth,
  isDualPage = false,
  bookId,
}: {
  thispageNumber: number;
  pdfHeight?: number;
  pdfWidth?: number;
  isDualPage?: boolean;
  bookId: string;
}) {
  // const [pageData, setPageData] = useState<TextContent | null>(null);
  const setPageData = useSetAtom(setPageNumberToPageData);
  const isHighlighting = useAtomValue(isHighlightingAtom);

  function isInsideParagraph(wordTransform: Transform) {
    const highlightedPageNumber = Math.floor(
      Number(highlightedParagraph.index) / PARAGRAPH_INDEX_PER_PAGE
    );
    if (highlightedPageNumber !== pageNumber) return false;
    const isBelowOrEqualTop =
      wordTransform[5] <= highlightedParagraph.dimensions.top;
    const isAboveOrEqualBottom =
      wordTransform[5] >= highlightedParagraph.dimensions.bottom;
    return isBelowOrEqualTop && isAboveOrEqualBottom;
  }
  const currentPage = useAtomValue(pageNumberAtom);
  const isActive = currentPage === pageNumber;

  const setIsCanvasRendered = useSetAtom(isPdfRenderedAtom);

  const highlightedParagraph = useAtomValue(highlightedParagraphAtom);

  return (
    <Page
      pageNumber={pageNumber}
      key={pageNumber.toString()}
      customTextRenderer={({
        str,

        transform,
      }) => {
        if (
          isHighlighting &&
          // isHighlighedPage() &&
          isInsideParagraph(transform as Transform)
        ) {
          return `<mark>${str}</mark>`;
        }

        return str;
      }}
      height={isDualPage ? pdfHeight : undefined}
      width={isDualPage ? undefined : pdfWidth}
      className={" rounded shadow-lg  "}
      renderTextLayer={true}
      renderAnnotationLayer={true}
      canvasBackground="white"
      onGetTextSuccess={(data) => {
        setPageData({
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
        if (isActive) setIsCanvasRendered(bookId, true);
      }}
    />
  );
}
