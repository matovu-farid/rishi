import { path } from "@tauri-apps/api";
import md5 from "md5";
import * as fs from "@tauri-apps/plugin-fs";
import type { Book } from "@/types";
import { getAssets } from "./getAssets";
import { getEpubCover } from "./getEpubCover";
import { getManifestFiles } from "./getManifestFiles";
import { getBookPath } from "./getBookPath";
import { formatBookDatails } from "./formatBookDatails";
import { getBookStore, saveBookStore } from "./getBookStore";
import { convertFileSrc } from "@tauri-apps/api/core";

export async function updateCurrentBookId(
  bookFolder: string,
  currentBookId: string
): Promise<string> {
  const store = await getBookStore(bookFolder);
  store.currentBookId = currentBookId;
  return saveBookStore(store, bookFolder);
}
// function to delete a book from a book folder
export async function deleteBook(bookFolder: string): Promise<void> {
  const bookPath = await path.join(bookFolder);
  await fs.remove(bookPath, { recursive: true });
}
export async function getBook(bookId: string) {
  const baseBookPath = await getBookPath();
  const bookPath = await path.join(baseBookPath, bookId);
  const book = await parseEpub(bookPath);
  return book;
}

export async function getBooks(): Promise<Book[]> {
  const baseBookPath = await getBookPath();

  const booksNames = (await fs.readDir(baseBookPath)).filter(
    (bookName) => !bookName.name.startsWith(".")
  );
  const booksPaths = await Promise.all(
    booksNames.map((bookName) => path.join(baseBookPath, bookName.name))
  );
  const books = await Promise.all(
    booksPaths.map((bookPath) => parseEpub(bookPath))
  );

  return books;
}

async function parseEpub(bookPath: string): Promise<Book> {
  try {
    const { manifest, workingFolder, opfFileObj, opfFilePath } =
      await getManifestFiles(bookPath);

    const assets = await getAssets(manifest, workingFolder);

    const store = await getBookStore(bookPath).catch(() => ({
      currentBookId: 0,
      epubPath: "",
    }));

    const { spine, title } = await formatBookDatails(
      manifest,
      opfFileObj,
      opfFilePath,
      bookPath
    );
    // await updateSpineImageUrls(spine, bookFolder)

    const cover = await getEpubCover(opfFileObj);
    const result = {
      currentBookId: store.currentBookId,
      id: md5(bookPath),
      cover: cover || "",
      spine,
      title,
      internalFolderName: bookPath,
      assets,
      epubPath: convertFileSrc(store.epubPath),
    };
    return result;
  } catch (e) {
    if (e instanceof Error) {
      console.log({ messege: "Failed to parse epub", error: e.message });
    }
    console.log({ messege: "Failed to parse epub", error: e });
    return {
      currentBookId: 0,
      id: "",
      cover: "",
      spine: [],
      title: "",
      internalFolderName: bookPath,
      assets: {},
      epubPath: "",
    };
  }
}
