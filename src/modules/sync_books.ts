import { BookData } from "@/generated";
import { Mutex } from "./Mutex";
import {
  getBooks,
  storeBook,
  updateBook,
  updateBookLocation,
  deleteBook,
  updateCoverImage,
} from "./books";

const mutex = new Mutex();
export async function syncronise<T>(fn: () => Promise<T>) {
  let result;
  const release = await mutex.lock();
  result = await fn();
  release();
  return result;
}

// sync all book operations
export const synchronizedGetBooks = () => syncronise(() => getBooks());
export const synchronizedStoreBook = (book: BookData) =>
  syncronise(() => storeBook(book));
export const synchronizedUpdateBook = (
  bookSlice: Partial<BookData> & { id: string }
) => syncronise(() => updateBook(bookSlice));
export const synchronizedUpdateBookLocation = (
  bookId: string,
  location: string
) => syncronise(() => updateBookLocation(bookId, location));
export const synchronizedDeleteBook = (book: BookData) =>
  syncronise(() => deleteBook(book));
export const syncronizedUpdateCoverImage = (blob: Blob, id: String) =>
  syncronise(() => updateCoverImage(blob, id));
