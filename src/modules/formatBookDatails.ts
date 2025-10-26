import { path } from "@tauri-apps/api";
import type { ManifestAttr, OPFFileObj } from "@/types";
import { convertFileSrc } from "@tauri-apps/api/core";

export async function formatBookDatails(
  manifest: ManifestAttr[],
  opfFileObj: OPFFileObj,
  opfFilePath: string,
  absoluteBookPath: string
) {
  const manifestMap: Map<string, ManifestAttr> = new Map();
  manifest.forEach((item: ManifestAttr) => {
    manifestMap.set(item.id, item);
  });
  const metadata = opfFileObj.metadata;
  const title = metadata["dc:title"]._text;
  const opfDir = await path.dirname(opfFilePath);

  const spine = await Promise.all(
    opfFileObj.spine.itemref
      .map((item) => item._attributes)
      .map(async (item) => {
        const manifestItem = manifestMap.get(item.idref);
        if (!manifestItem) {
          return {
            idref: item.idref,
            path: "",
            mediaType: "",
          };
        }

        const route = await path.join(
          absoluteBookPath,
          opfDir,
          manifestItem.href
        );
        return {
          idref: item.idref,
          path: convertFileSrc(route) || "",
          mediaType: manifestItem["media-type"],
        };
      })
  );
  return { spine, title };
}
