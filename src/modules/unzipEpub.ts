import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import { getBookPath } from "./getBookPath";
import { updateBookStore } from "./getBookStore";
import { invoke } from "@tauri-apps/api/core";

export async function unzipEpub(
  filePath: string,
  outDir: string
): Promise<string> {
  const outputDirUrl = await path.join(await getBookPath(), outDir); // Crea

  // only unzip if not already unzipped
  if (await fs.exists(outputDirUrl)) {
    return outputDirUrl;
  }

  //const zip = new AdmZip(filePath);
  await invoke("unzip", { filePath, outDir: outputDirUrl });

  //zip.extractAllTo(outputDirUrl, true);

  // const newZipFilePath = await path.join(
  //   outputDirUrl,
  //   await path.basename(filePath)
  // );
  // await fs.copyFile(filePath, newZipFilePath);
  // console.log("File was copied to destination", newZipFilePath);
  // error: "failed to open file at path: /Users/faridmatovu/Library/Application Support/com.faridmatovu.rishi/public/books/Users/faridmatovu/Library/App…"

  const epubPath = await path.join(outputDirUrl, await path.basename(filePath));

  updateBookStore({ epubPath: epubPath }, outDir);

  return outputDirUrl;
}
