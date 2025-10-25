import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import type { Store } from "@/types";

export async function saveBookStore(
  data: Store,
  outputDir: string
): Promise<string> {
  let encoder = new TextEncoder();

  const jsonString = encoder.encode(JSON.stringify(data));
  const bookStorePath = await path.join(
    outputDir,
    "store.json"
  );
  await fs.writeFile(bookStorePath, jsonString);
  return bookStorePath;
}
export async function updateBookStore(
  data: Partial<Store>,
  outputDir: string
): Promise<string> {
  const store = await getBookStore(outputDir);
  const updatedStore = { ...store, ...data };
  return saveBookStore(updatedStore, outputDir);
}

async function fetchBookStoreData(bookStorePath: string): Promise<Store> {
  try {
    // debugger;
    const jsonString = await fs.readTextFile(bookStorePath);
    return JSON.parse(jsonString);
  } catch {
    return { currentBookId: 0, epubPath: "" };
  }
}
export async function getBookStore(bookFolder: string): Promise<Store> {
  const bookStorePath = await path.join(bookFolder, "store.json");
  return fs
    .exists(bookStorePath)
    .then(() => fetchBookStoreData(bookStorePath))
    .catch(() => {
      return saveBookStore({ currentBookId: 0, epubPath: "" }, bookFolder).then(
        () => fetchBookStoreData(bookStorePath)
      );
    });
}
