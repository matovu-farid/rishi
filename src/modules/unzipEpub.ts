import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import { getBookPath } from "./getBookPath";
import { updateBookStore } from "./getBookStore";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

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
  const epubPath = await path.join(outputDirUrl, await path.basename(filePath));

  await updateBookStore({ epubPath: convertFileSrc(epubPath) }, outputDirUrl);

  return outputDirUrl;
}
