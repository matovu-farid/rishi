import { BookData } from "@/generated";
import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";

export async function copyBookToAppData(filePath: string) {
  const appdataPath = await path.appDataDir();
  const fileName = await path.basename(filePath);
  const bookPath = await path.join(appdataPath, fileName);
  await fs.copyFile(filePath, bookPath);
  return bookPath;
}

export async function getBooks() {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { books: [] },
  });
  const books = await store.get<BookData[]>("books");
  if (!books) {
    return [];
  }
  return books;
}

export async function storeBook(book: BookData) {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { books: [] },
  });
  const books = await store.get<BookData[]>("books");
  if (!books) {
    await store.set("books", [book]);
    return;
  }
  books.push(book);

  await store.set("books", books);
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

export async function updateBookLocation(bookId: string, location: string) {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { books: [] },
  });
  const books = await store.get<BookData[]>("books");
  if (!books) {
    return;
  }
  const book = books.find((b) => b.id === bookId);
  if (!book) {
    return;
  }
  book.current_location = location;
  await store.set("books", books);
}

export async function getBookLocation(bookId: string) {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { books: [] },
  });
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
