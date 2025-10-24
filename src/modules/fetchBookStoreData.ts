import type { Store } from "@/types";
import { readTextFile } from "@tauri-apps/plugin-fs";

export async function fetchBookStoreData(
  bookStorePath: string
): Promise<Store> {
  try {
    const jsonString = await readTextFile(bookStorePath);
    return JSON.parse(jsonString);
  } catch {
    return { currentBookId: 0, epubPath: "" };
  }
}
