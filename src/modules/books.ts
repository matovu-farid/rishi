import { BookData } from "@/generated";
import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import { load, Store } from "@tauri-apps/plugin-store";

export type SavedBookData = BookData & {
  version?: 0
}
export async function copyBookToAppData(filePath: string) {
  const appdataPath = await path.appDataDir();
  const fileName = await path.basename(filePath);
  const bookPath = await path.join(appdataPath, fileName);
  await fs.copyFile(filePath, bookPath);
  return bookPath;
}

export async function getBooks(storeParam?: Store) {

  let store = storeParam || await getStore()
  const books = await store.get<SavedBookData[]>("books");
  if (!books) {
    return [];
  }
  return books;
}

export async function getBook(id: String, storeParam?: Store) {
  let store = storeParam || await getStore()
  const books = await getBooks(storeParam)
  return books.find(book => book.id == id)
}
export async function storeBook(book: SavedBookData, storeParam?: Store) {

  let store = storeParam || await getStore()
  const books = await getBooks(store);
  if (!books) {
    await store.set("books", [book]);
    return;
  }
  const savedBook = books.find(currBook => currBook.id == book.id)
  if (!savedBook)
    books.push(book);
  else
    books.map(currBook => {
      if (currBook.id != book.id) return currBook
      return {
        ...currBook,
        ...book,
        version: (currBook.version || 0) + 1
      }
    })


  await store.set("books", books);
}
export async function updateCoverImage(blob: Blob, id: String, storeParam?: Store) {
  let store = storeParam || await getStore()

  const book = await getBook(id, store)
  if (!book) return
  // only update it once
  if (book.version && book.version > 0) return
  if (book.version && book.version != "fallback") return
  const bytes = await blob.bytes()
  const cover = Array.from(bytes)
  await updateBook({
    id: book.id,
    cover
  }, store)

}
export async function getStore() {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { books: [] },
  });
  return store
}

export async function deleteBook(book: BookData) {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { books: [] },
  });
  const books = await store.get<BookData[]>("books");
  if (!books) {
    return;
  }
  const index = books.findIndex((b) => b.id === book.id);
  if (index === -1) {
    return;
  }
  books.splice(index, 1);
  await store.set("books", books);
}
export async function updateBook(bookSlice: Partial<SavedBookData> & { id: string }, storeParam?: Store) {

  const book = await getBook(bookSlice.id, storeParam)
  if (!book) return
  await storeBook({ ...book, ...bookSlice }, storeParam)
}

export async function updateBookLocation(bookId: string, location: string, storeParam?: Store) {
  let store = storeParam || await getStore()
  await updateBook({ id: bookId, current_location: location }, store)
}

export async function getBookLocation(bookId: string, storeParam?: Store) {
  let store = storeParam || await getStore()
  const books = await store.get<BookData[]>("books");
  if (!books) {
    return;
  }
  const book = books.find((b) => b.id === bookId);
  if (!book) {
    return;
  }
  return book.current_location;
}
