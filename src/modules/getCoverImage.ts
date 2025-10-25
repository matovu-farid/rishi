import md5 from "md5";
import * as fs from "@tauri-apps/plugin-fs";
import { filetypemime, filetypename } from "magic-bytes.js";
import { getEpubCover } from "./getEpubCover";
import { getManifestFiles } from "./getManifestFiles";
import { unzipEpub } from "./unzipEpub";
import { path } from "@tauri-apps/api";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getBookPath } from "./getBookPath";

export async function getCoverImage(filePath: string): Promise<string | null> {
  try {
    debugger;
    const bookFolder = md5(filePath);
    const file = await fs.readFile(filePath);
    const types = filetypename(file);
    const mimes = filetypemime(file);
    const isEpubOrZip = types.some((type) => type === "epub" || type === "zip");
    if (!isEpubOrZip) {
      console.log({ types, mimes });
      return null;
    }
    await unzipEpub(filePath, bookFolder);
    const bookPath = await path.join(await getBookPath(),bookFolder);
    const { opfFileObj,workingFolder } = await getManifestFiles(bookPath);
    const cover = await getEpubCover(opfFileObj);

    const coverPath = await path.join(workingFolder, cover);

    return convertFileSrc(coverPath);
  } catch (e) {
    console.log(e);
    return null;
  }
}
