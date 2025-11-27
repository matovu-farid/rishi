// import {
//   Sheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
// } from "@/components/ui/sheet";

import { Book } from "@/modules/kysley";
import { getBook, updateBookCover } from "@/modules/sql";

// Import required CSS for text and annotation layers

export async function updateStoredCoverImage(book: Book) {
  if (book.version && book.version > 0) return;
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-isactive="true"] canvas'
  );
  if (!canvas) return;
  console.log(">>> Found canvas for cover image extraction.");

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve);
  });
  if (!blob) return;
  console.log(">>> Extracted cover image blob from canvas.");

  //await syncronizedUpdateCoverImage(blob, book.id);
  await updateCoverImage(blob, book.id);
}

export async function updateCoverImage(blob: Blob, id: number) {
  const book = await getBook(id);
  if (!book) return;
  // only update it once
  if (book.version && book.version > 0) return;
  // if (book.cover_kind && book.cover_kind != "fallback") return
  if (book.kind != "pdf") return;
  const bytes = await blob.bytes();
  const cover = Array.from(bytes);
  // await updateBook(
  //   {
  //     id: book.id,
  //     cover,
  //   },
  //   store
  // );
  await updateBookCover(id, cover);
}
