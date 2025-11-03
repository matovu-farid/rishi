export type ParagraphWithIndex = {
  text: string;
  index: string;
};
export type PlayerControlInterface = {
  getCurrentViewParagraphs: () => Promise<ParagraphWithIndex[]>;
  getNextViewParagraphs: () => Promise<ParagraphWithIndex[]>;
  getPreviousViewParagraphs: () => Promise<ParagraphWithIndex[]>;
  removeHighlight: (index: string) => Promise<void>;
  highlightParagraph: (index: string) => Promise<void>;
  moveToNextPage: () => Promise<void>;
  moveToPreviousPage: () => Promise<void>;
};
