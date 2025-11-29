import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Rendition } from "epubjs";
import { ReactReader } from "@/components/react-reader";
import { themes } from "./themes/themes";
import { ThemeType } from "./themes/common";
import createIReactReaderTheme from "./themes/readerThemes";
import isEqual from "lodash.isequal";
import { z } from "zod";
import {
  getCurrentViewParagraphs,
  getNextViewParagraphs,
  getNextViewParagraphsOld,
  getPreviousViewParagraphs,
} from "./epubwrapper";

async function getBook() {
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
  expect(rendition).toBeDefined();

  return { buffer, rendition };
}
// @ts-ignore

describe("EpubWrapper", () => {
  it("should get current view paragraphs", { timeout: 20000 }, async () => {
    const { rendition } = await getBook();

    let count = 0;

    while (getCurrentViewParagraphs(rendition!).length === 0 && count < 10) {
      await rendition?.next();
      count++;
    }

    const paragraphs = getCurrentViewParagraphs(rendition!);
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  it.only("should get next view paragraphs", { timeout: 60000 }, async () => {
    const { rendition } = await getBook();

    for (let i = 0; i < 9; i++) {
      const nextParagraphs = await getNextViewParagraphs(rendition!);
      // expect(nextParagraphs.length).toBeGreaterThan(0);
      await rendition?.next();
      // check that the current paragraphs are the same as the next paragraphs previously fetched
      const currentParagraphs = getCurrentViewParagraphs(rendition!);
      // expect(currentParagraphs.length).toBeGreaterThan(0);
      expect(currentParagraphs).toEqual(nextParagraphs);
    }
  });

  it("should get previous view paragraphs", { timeout: 90000 }, async () => {
    for (let i = 0; i < 3; i++) {
      const { rendition } = await getBook();
      expect(rendition).toBeDefined();

      let count = 0;

      while (
        (getCurrentViewParagraphs(rendition!).length === 0 ||
          (await getPreviousViewParagraphs(rendition!)).length === 0) &&
        count < 10
      ) {
        await rendition?.next();
        count++;
      }

      // await rendition?.prev();
      const currentParagraphsBefore = getCurrentViewParagraphs(rendition!);
      await rendition?.next();

      const previousParagraphs = await getPreviousViewParagraphs(rendition!);
      expect(previousParagraphs.length).toBeGreaterThan(0);

      expect(previousParagraphs).toEqual(currentParagraphsBefore);
    }
  });
});
