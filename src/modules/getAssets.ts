import { path } from "@tauri-apps/api";
import type { ManifestAttr } from "@/types";
import { classifyAssets } from "./classifyAssets";

export async function getAssets(
  manifest: ManifestAttr[],
  workingFolder: string
) {
  const assets = classifyAssets(manifest);
  delete assets["other"];

  Object.entries(assets).forEach(([key, value]) => {
    value.forEach(async (file) => {
      file.href = await path.join(workingFolder, file.href);
      if (!file.properties) {
        file.properties = {};
      }
      if (key === "font")
        file.properties["name"] = await path.basename(file.href);
    });
  });

  return assets;
}
