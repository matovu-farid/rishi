import { syncronizedUpdateCoverImage } from "@/modules/sync_books";
// import {
//   Sheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
// } from "@/components/ui/sheet";

import { BookData } from "@/generated";

// Import required CSS for text and annotation layers

export async function updateStoredCoverImage(book: BookData) {
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

  await syncronizedUpdateCoverImage(blob, book.id);
}
