import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Rendition } from "epubjs";
import { ReactReader } from "@components/react-reader";
import { themes } from "./themes/themes";
import { ThemeType } from "./themes/common";
import createIReactReaderTheme from "./themes/readerThemes";
import { getCurrentViewParagraphs } from "./epubwrapper";

// @ts-ignore

describe("EpubWrapper", () => {
  it("should get current view paragraphs", { timeout: 20000 }, async () => {
    const response = await fetch("/test-files/test.epub");
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    let rendered = false;
    let rendition: Rendition | undefined;

    await render(
      <>
        <div
          style={{ height: "100vh", position: "relative", overflow: "hidden" }}
          // style={{ width: "600px", height: "400px" }}
        >
          <ReactReader
            url={buffer}
            location={0}
            locationChanged={() => {}}
            readerStyles={createIReactReaderTheme(
              themes[ThemeType.White].readerTheme
            )}
            getRendition={async (_rendition) => {
              _rendition.on("rendered", () => {
                rendition = _rendition;
                rendered = true;
              });
            }}
          />
        </div>
      </>
    );

    await expect.poll(() => rendered, { timeout: 10000 }).toBe(true);
    await expect(rendition).toBeDefined();

    await rendition?.next();
    await rendition?.next();
    await rendition?.next();
    await rendition?.next();
    await rendition?.next();
    const paragraphs = getCurrentViewParagraphs(rendition!);
    console.log(paragraphs);
  });
});
