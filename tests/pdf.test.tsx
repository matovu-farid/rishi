import { it, expect, vi, beforeAll } from "vitest"
import { render } from 'vitest-browser-react'
import { server } from 'vitest/browser'


import { BookData } from "@/generated"
import { PdfView } from "@/components/pdf/components/pdf"
import Providers from "@components/providers"

import { randomFillSync } from "crypto";

import { mockWindows } from '@tauri-apps/api/mocks';
import { mockIPC } from "@tauri-apps/api/mocks";
import { invoke } from "@tauri-apps/api/core";

// jsdom doesn't come with a WebCrypto implementation
beforeAll(() => {
  Object.defineProperty(window, 'crypto', {
    value: {
      // @ts-ignore
      getRandomValues: (buffer) => {
        return randomFillSync(buffer);
      },
    },
  });
});

declare global {
  var __PDF_FIXTURE__: Uint8Array;
}

// async function loadFile(filePath: string) {
//   const url = new URL(filePath, import.meta.url)
//   const file = fs.readFileSync(fileURLToPath(url))
//   return file
// }
function createFileData(filepath: string, kind: string) {

  const mockBookData: BookData = {
    id: "1",
    version: 0,
    kind: kind,
    cover: [] as number[],
    title: "Sample Book",
    location: "1",
    filepath
  }
  return { book: mockBookData, filepath }
}
vi.mock(import('@/components/TTSControls'), () => ({
  default: vi.fn(() => <div></div>)
}))
vi.mock(import('@/models/Player'), () => ({
  default: vi.fn(() => <div></div>)
}))

vi.mock('@/generated', () => ({
  isDev: false
}))
//@tanstack/react-router
vi.mock('@tanstack/react-router', () => ({
  Link: vi.fn(() => <div></div>)
}))


vi.mock('@/modules/sync_books', () => ({
  synchronizedUpdateBookLocation: vi.fn(async (bookId: string, location: string) => {
    return;
  }),
  syncronizedUpdateCoverImage: vi.fn(async (blob: Blob, id: String) => {
    return;
  })

}))

it("should render the PDF file correctly", async () => {
  mockWindows('main');
  mockIPC((cmd, args) => {
    // simulated rust command called "add" that just adds two numbers
    // if(cmd === "add") {
    //   return (args.a as number) + (args.b as number);
    // }
    return null;
  });
  const { readFile } = server.commands
  const pdf = "./tests/fixtures/sample.pdf"
  const pdfBytes = await readFile(pdf);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  console.log("Blob URL:", blobUrl);
  const { book } = createFileData(blobUrl, "pdf")
  const pdfViewer = await render(
    <Providers>
      <PdfView book={book} filepath={blobUrl} />
    </Providers>
  )
  // expect(true).toBe(true)




})

