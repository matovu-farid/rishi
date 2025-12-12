import { atom } from "jotai";
import { observe } from "jotai-effect";
import { customStore } from "./jotai";
import { bookIdAtom } from "./epub_atoms";
import { startRealtime } from "@/modules/realtime";

export const isChattingAtom = atom(false);
isChattingAtom.debugLabel = "isChattingAtom";

observe((get) => {
  const isChatting = get(isChattingAtom);
  const bookId = get(bookIdAtom);
  if (isChatting && bookId) {
    void startRealtime(Number(bookId));
  }
}, customStore);
