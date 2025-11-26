import { TTSQueue } from "./ttsQueue";
import { expect, it, vi } from "vitest";
export const ttsQueue = new TTSQueue();

it("should add a request to the queue", async () => {
  vi.mock("@tauri-apps/plugin-http", () => ({
    fetch: fetch,
  }));
  vi.mock("@/modules/ttsCache", () => ({
    ttsCache: {
      saveCachedAudio: vi.fn(),
    },
  }));
  const audioData = await ttsQueue.generateAudio({
    bookId: "1",
    cfiRange: "1",
    text: "How are you?",
    priority: 0,
    resolve: () => {},
    reject: () => {},
    requestId: "1",
    timestamp: Date.now(),
    retryCount: 0,
  });
  expect(audioData.length).toBeGreaterThan(0);
});
