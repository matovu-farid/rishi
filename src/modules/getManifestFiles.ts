import { path } from "@tauri-apps/api";
import convert from "xml-js";
import type { ManifestAttr, OPF, Container } from "@/types";
import { getBookPath } from "./getBookPath";
import { readTextFile } from "@tauri-apps/plugin-fs";

export async function getManifestFiles(bookFolder: string) {
  const absoluteBookPath = await path.join(await getBookPath(), bookFolder);
  const containerPath = await path.join(
    absoluteBookPath,
    "META-INF",
    "container.xml"
  );
  const containerData = await readTextFile(containerPath);
  const containerObj = convert.xml2js(containerData, {
    compact: true,
  }) as Container;
  const opfFilePath =
    containerObj.container.rootfiles.rootfile._attributes["full-path"];
  const workingFolder = await path.join(
    absoluteBookPath,
    await path.dirname(opfFilePath)
  );
  const opfFileData = await readTextFile(
    await path.join(absoluteBookPath, opfFilePath)
  );
  const opf: OPF = convert.xml2js(opfFileData, { compact: true }) as OPF;

  const opfFileObj = opf.package;
  const manifest: ManifestAttr[] = opfFileObj.manifest.item.map(
    (item) => item._attributes
  );
  return { manifest, opfFileObj, opfFilePath, workingFolder };
}
