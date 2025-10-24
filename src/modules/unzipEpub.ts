import { path } from "@tauri-apps/api";

import { getBookPath } from "./getBookPath";
import { updateBookStore } from "./getBookStore";
import { invoke } from "@tauri-apps/api/core";

export async function unzipEpub(
  filePath: string,
  outDir: string
): Promise<string> {
  const outputDirUrl = await path.join(await getBookPath(), outDir); // Crea

  //const zip = new AdmZip(filePath);
  await invoke("unzip", { file_path: filePath, out_dir: outputDirUrl });

  //zip.extractAllTo(outputDirUrl, true);

  // const newZipFilePath = await path.join(
  //   outputDirUrl,
  //   await path.basename(filePath)
  // );
  // await fs.copyFile(filePath, newZipFilePath);
  // console.log("File was copied to destination", newZipFilePath);

  const epubPath = await path.join(outputDirUrl, await path.basename(filePath));

  updateBookStore({ epubPath: epubPath }, outDir);

  return outputDirUrl;
}
