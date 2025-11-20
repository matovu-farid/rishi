
import { useState } from "react";
import "../subscriptions/bus.ts"


// Import required CSS for text and annotation layers
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import {
  pageCountAtom,
} from "@components/pdf/atoms/paragraph-atoms";
import { useAtomValue } from "jotai";
import { BackgroundPageComponent } from "./background-page";


export function TextExtractor({ pageWidth, pdfHeight, isDualPage, bookId, }:
  { pageWidth: number, pdfHeight: number, isDualPage: boolean, bookId: string }) {
  const [pageNumber, setPageNumber] = useState(1)
  const pageCount = useAtomValue(pageCountAtom)


  return <div style={{
    position: "absolute",
    top: "-9999px",
    left: "-9999px"
  }}>
    <BackgroundPageComponent
      key={`extractor-page-${pageNumber}`}
      thispageNumber={pageNumber}
      pdfWidth={pageWidth}
      pdfHeight={pdfHeight}
      isDualPage={isDualPage}
      bookId={bookId}
      onRenderComplete={() => {
        if (pageNumber >= pageCount) return
        setTimeout(() => {
          setPageNumber(pageNumber => pageNumber + 1)
        }, 1000)
      }
      }
    />
  </div>

}
