import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import { BOOKS, PUBLIC } from "./epub_constants";

export async function getBookPath(): Promise<string> {
  try {
    const bookPath = await path.join(await path.appDataDir(), PUBLIC, BOOKS);
    fs.exists(bookPath).catch(() => fs.mkdir(bookPath, { recursive: true }));
    return bookPath;
  } catch (e) {
    console.log(e);
    return "";
  }
}
