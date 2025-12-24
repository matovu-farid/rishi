import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

export async function setupDeepLinking() {
  const startUrls = await getCurrent();

  if (startUrls) {
    console.log("deep link:", startUrls);
  }
  await onOpenUrl((urls) => {
    console.log("deep link:", urls);
  });
}
