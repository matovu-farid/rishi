import { load } from "@tauri-apps/plugin-store";
import * as fs from "@tauri-apps/plugin-fs";

export interface PdfData {
  id: string;
  pdf: string;
  current_location: string;
}

export const getPdf = async (id: string) => {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { pdfs: [] },
  });
  const pdfs = await store.get<PdfData[]>("pdfs");
  if (!pdfs) {
    return null;
  }
  const pdf = pdfs.find((pdf) => pdf.id === id);
  if (!pdf) {
    return null;
  }
  return pdf.pdf;
};

export const storePdf = async (pdf: PdfData) => {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { pdfs: [] },
  });
  const pdfs = await store.get<PdfData[]>("pdfs");
  if (!pdfs) {
    await store.set("pdfs", [pdf]);
    return;
  }
  pdfs.push(pdf);
  await store.set("pdfs", pdfs);
};

export const deletePdf = async (id: string) => {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { pdfs: [] },
  });
  const pdfs = await store.get<PdfData[]>("pdfs");
  if (!pdfs) {
    return;
  }
  const pdf = pdfs.find((pdf) => pdf.id === id);
  if (!pdf) {
    return;
  }
  // delete the pdf file
  await fs.remove(pdf.pdf);
  await store.set(
    "pdfs",
    pdfs.filter((pdf) => pdf.id !== id)
  );
};

export const updatePdfLocation = async (id: string, location: string) => {
  const store = await load("store.json", {
    autoSave: true,
    defaults: { pdfs: [] },
  });
  const pdfs = await store.get<PdfData[]>("pdfs");
  if (!pdfs) {
    return;
  }
  const pdf = pdfs.find((pdf) => pdf.id === id);
  if (!pdf) {
    return;
  }
  pdf.current_location = location;
  await store.set("pdfs", pdfs);
};
