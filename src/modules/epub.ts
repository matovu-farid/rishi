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
  const bookPath = await path.join(await getBookPath(), bookFolder);
  await fs.remove(bookPath, { recursive: true });
}

export async function getBooks(): Promise<Book[]> {
  debugger;
  const baseBookPath = await getBookPath();

  const booksNames = (await fs.readDir(baseBookPath)).filter(
    (bookName) => !bookName.name.startsWith(".")
  );
  const booksPaths = await Promise.all(
    booksNames.map((bookName) => path.join(baseBookPath, bookName.name))
  );
  return Promise.all(booksPaths.map((bookPath) => parseEpub(bookPath)));
}

async function parseEpub(bookFolder: string): Promise<Book> {
  debugger;
  try {
    const { manifest, workingFolder, opfFileObj, opfFilePath } =
      await getManifestFiles(bookFolder);

    const assets = await getAssets(manifest, workingFolder);

    const store = await getBookStore(bookFolder).catch(() => ({
      currentBookId: 0,
      epubPath: "",
    }));

    const { spine, title } = await formatBookDatails(
      manifest,
      opfFileObj,
      opfFilePath,
      bookFolder
    );
    // await updateSpineImageUrls(spine, bookFolder)

    const cover = await getEpubCover(opfFileObj);
    const coverPath = await path.join(bookFolder, cover);
    return {
      currentBookId: store.currentBookId,
      id: md5(bookFolder),
      cover: coverPath || "",
      spine,
      title,
      internalFolderName: bookFolder,
      assets,
      epubPath: store.epubPath,
    };
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
      internalFolderName: bookFolder,
      assets: {},
      epubPath: "",
    };
  }
}
