import { atom } from "jotai";
import type Rendition from "epubjs/types/rendition";
export const renditionAtom = atom<Rendition | null>(null);