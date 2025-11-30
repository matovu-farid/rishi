import type { Book, Layout, Rendition } from "epubjs";
import type { BookOptions } from "epubjs/types/book";
import type View from "epubjs/types/managers/view";
import type Section from "epubjs/types/section";
import type { SpineItem } from "epubjs/types/section";
import Epub, { EpubCFI, Contents } from "epubjs";
import Mapping from "epubjs/types/mapping";

export type ParagraphWithCFI = {
  text: string;
  cfiRange: string;
  startCfi: string;
  endCfi: string;
};
// Overload 1: with urlOrData and optional options
export function initialize(
  urlOrData: string | ArrayBuffer,
  options?: BookOptions
): Book;

// Overload 2: with only optional options
export function initialize(options?: BookOptions): Book;

// Implementation
export function initialize(
  urlOrDataOrOptions?: string | ArrayBuffer | BookOptions,
  options?: BookOptions
): Book {
  let epub: Book;
  if (
    typeof urlOrDataOrOptions === "string" ||
    urlOrDataOrOptions instanceof ArrayBuffer
  ) {
    epub = Epub(urlOrDataOrOptions, options);
  } else {
    epub = Epub(urlOrDataOrOptions);
  }

  return epub;
}

export async function getNextViewParagraphsOld(
  rendition: Rendition,
  options = { minLength: 50 }
): Promise<ParagraphWithCFI[]> {
  const { minLength = 50 } = options;
  if (!rendition.manager) {
    return [];
  }

  const location = rendition.manager.currentLocation();

  if (
    !location ||
    !Array.isArray(location) ||
    !location.length ||
    !location[0]
  ) {
    return [];
  }

  const currentSection = location[0];

  const currentView = rendition.manager.views.find({
    index: currentSection.index,
  });

  if (!currentView || !currentView.section || !currentView.contents) {
    return [];
  }

  const hasNextPageInSection = _hasNextPageInCurrentSection(currentSection);

  /**
   * Paragraphs array
   * @type {Paragraph[]}
   */
  let paragraphs: any[];

  if (hasNextPageInSection) {
    paragraphs = await _getNextPageParagraphsInSectionAsync(
      rendition,
      currentView,
      currentSection
    );
  } else {
    const nextSectionParagraphs = await _getFirstPageParagraphsInNextSection(
      rendition,
      currentView
    );

    paragraphs = nextSectionParagraphs;
  }

  // if (minLength > 0) {
  //   paragraphs = paragraphs.filter(
  //     (p: { text: string | any[] }) => p.text.length >= minLength
  //   );
  // }

  return paragraphs;
}
export async function getPreviousViewParagraphsOld(
  rendition: Rendition,
  options = { minLength: 50 }
): Promise<ParagraphWithCFI[]> {
  // const { minLength = 50 } = options;
  if (!rendition.manager) {
    return [];
  }

  const location = rendition.manager.currentLocation();

  if (
    !location ||
    !Array.isArray(location) ||
    !location.length ||
    !location[0]
  ) {
    return [];
  }

  const currentSection = location[0];
  // if (
  //   !currentSection.mapping ||
  //   !currentSection.mapping.start ||
  //   !currentSection.mapping.end
  // ) {
  //   return [];
  // }

  const currentView = rendition.manager.views.find({
    index: currentSection.index,
  });

  if (!currentView || !currentView.section || !currentView.contents) {
    return [];
  }

  const hasPreviousPageInSection =
    _hasPreviousPageInCurrentSection(currentSection);
  /**
   * Paragraphs array
   * @type {Paragraph[]}
   */
  let paragraphs: any[];
  if (hasPreviousPageInSection) {
    paragraphs = await _getPreviousPageParagraphsInSectionAsync(
      rendition,
      currentView,
      currentSection
    );
  } else {
    const previousSectionParagraphs =
      await _getLastPageParagraphsInPreviousSection(rendition, currentView);
    paragraphs = previousSectionParagraphs;
  }

  // if (minLength > 0) {
  //   paragraphs = paragraphs.filter(
  //     (p: { text: string | any[] }) => p.text.length >= minLength
  //   );
  // }

  return paragraphs;
}
export function getCurrentViewText(rendition: Rendition) {
  if (!rendition.manager) {
    return null;
  }

  // Get the current location which includes the visible range
  const location = rendition.manager.currentLocation();

  if (!location || !location.length || !location[0]) {
    return null;
  }

  // Get the first visible section's mapping which contains the CFI range
  const visibleSection = location[0];

  if (
    !visibleSection.mapping ||
    !visibleSection.mapping.start ||
    !visibleSection.mapping.end
  ) {
    return null;
  }

  // Find the view for this section
  const view = rendition.manager.views.find({ index: visibleSection.index });

  if (!view || !view.contents || !view.contents.document) {
    return null;
  }

  try {
    // Create CFI ranges for the visible page
    const startCfi = new EpubCFI(visibleSection.mapping.start);
    const endCfi = new EpubCFI(visibleSection.mapping.end);

    // Convert CFIs to DOM ranges
    const startRange = startCfi.toRange(view.contents.document);
    const endRange = endCfi.toRange(view.contents.document);

    if (!startRange || !endRange) {
      return null;
    }

    // Create a range that encompasses the visible content
    const range = view.contents.document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.endContainer, endRange.endOffset);

    // Extract text from the range
    const text = range.toString();

    return {
      text: text,
      startCfi: visibleSection.mapping.start,
      endCfi: visibleSection.mapping.end,
    };
  } catch (e) {
    console.error("Error extracting visible text:", e);
    return null;
  }
}

export function highlightRange(
  rendition: Rendition,
  cfiRange: string,
  data?: Record<string, unknown>,
  cb?: () => void,
  className = "epubjs-hl",
  styles?: Record<string, unknown>
) {
  if (!rendition.manager) {
    return Promise.reject(new Error("Rendition manager not available"));
  }

  try {
    // Parse the CFI range to validate it
    const rangeCfi = new EpubCFI(cfiRange);

    // Check if this is a range CFI (should have start and end)
    if (!rangeCfi.range) {
      return Promise.reject(
        new Error("CFI string is not a range: " + cfiRange)
      );
    }

    // Find the view that contains this CFI range
    const found = rendition.manager
      .visible()
      .filter((view: { index: any }) => rangeCfi.spinePos === view.index);

    if (!found.length) {
      return Promise.reject(
        new Error("No view found for CFI range: " + cfiRange)
      );
    }

    const view = found[0];
    if (!view.contents) {
      return Promise.reject(new Error("View contents not available"));
    }

    // Verify the CFI range can be converted to a DOM range
    const domRange = rangeCfi.toRange(
      view.contents.document,
      rendition.settings.ignoreClass
    );

    if (!domRange) {
      return Promise.reject(
        new Error("Could not convert CFI range to DOM range")
      );
    }

    // Apply default yellow highlight styles if no custom styles provided
    const defaultStyles = {
      fill: "yellow",
      // "fill-opacity": "0.5",
      // "mix-blend-mode": "screen",
    };
    const mergedStyles = Object.assign(defaultStyles, styles);
    const hash = encodeURI(cfiRange + "highlight");
    const annotationExists = hash in rendition.annotations._annotations;
    if (annotationExists) {
      return Promise.resolve(annotationExists);
    }
    // Use the existing highlight method with the CFI range
    // Pass the parsed EpubCFI instance as expected by the API
    const annotation = rendition.annotations.highlight(
      rangeCfi,
      data,
      cb || (() => {}),
      className,
      mergedStyles
    );

    // Return a resolved promise since highlight is synchronous
    return Promise.resolve(annotation);
  } catch (error) {
    return Promise.reject(
      new Error(
        "Error highlighting range: " +
          (error instanceof Error ? error.message : String(error))
      )
    );
  }
}

/**
 * Remove a highlight from a CFI range
 * @param {string} cfiRange - CFI range string to remove highlight from
 * @returns {Promise<boolean>} Promise that resolves to true if highlight was removed, false if not found
 */
export function removeHighlight(rendition: Rendition, cfiRange: string) {
  if (!rendition.manager) {
    return Promise.reject(new Error("Rendition manager not available"));
  }

  try {
    // Parse the CFI range to validate it
    const rangeCfi = new EpubCFI(cfiRange);

    // Check if this is a range CFI (should have start and end)
    if (!rangeCfi.range) {
      return Promise.reject(
        new Error("CFI string is not a range: " + cfiRange)
      );
    }

    // Find the view that contains this CFI range
    const found = rendition.manager.visible().filter(function (view: {
      index: any;
    }) {
      return rangeCfi.spinePos === view.index;
    });

    if (!found.length) {
      // If no view is found, the highlight might still exist in the store
      // but not be visible, so we can still try to remove it
      console.warn(
        "No visible view found for CFI range, attempting to remove from store: " +
          cfiRange
      );
    }

    // Check if the annotation exists before removal
    const hash = encodeURI(cfiRange + "highlight");
    const annotationExists = hash in rendition.annotations._annotations;
    // Remove the highlight annotation
    // Pass the parsed EpubCFI instance as expected by the API
    if (annotationExists) rendition.annotations.remove(rangeCfi, "highlight");

    // Return a resolved promise with the result
    return Promise.resolve(annotationExists);
  } catch (error) {
    return Promise.reject(
      new Error(
        "Error removing highlight: " +
          (error instanceof Error ? error.message : String(error))
      )
    );
  }
}

function _getTextNodesInRange(range: Range) {
  const textNodes: Node[] = [];

  try {
    // Validate range first
    if (!range || !range.commonAncestorContainer) {
      console.error("_getTextNodesInRange: Invalid range provided");
      return textNodes;
    }

    const walker =
      range.commonAncestorContainer.ownerDocument?.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            try {
              // Skip empty or whitespace-only text nodes
              if (!node.textContent || !node.textContent.trim()) {
                return NodeFilter.FILTER_REJECT;
              }
              return range.intersectsNode(node)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
            } catch (e) {
              return NodeFilter.FILTER_REJECT;
            }
          },
        }
      );
    if (!walker) {
      return textNodes;
    }

    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }
  } catch (e) {
    console.error("Error getting text nodes in range:", e);
  }

  return textNodes;
}

function _findContainingBlockElement(textNode: Node) {
  const blockSelectors =
    "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, article, section, aside, header, footer, main, nav, figure, figcaption, dd, dt";

  let element = textNode.parentElement;

  while (element) {
    try {
      if (element.matches && element.matches(blockSelectors)) {
        return element;
      }
    } catch (e) {
      // Fallback for older browsers
      const selectors = blockSelectors.split(", ");
      for (const selector of selectors) {
        try {
          if (element.matches && element.matches(selector)) {
            return element;
          }
        } catch (e2) {
          continue;
        }
      }
    }
    element = element.parentElement;
  }

  return null;
}
function _getParagraphsFromRange(
  rendition: Rendition,
  range: Range,
  contents: Contents
): ParagraphWithCFI[] {
  const paragraphs: ParagraphWithCFI[] = [];

  try {
    // Get the full text from the range (same as getCurrentViewText)
    const fullText = range.toString();

    if (!fullText.trim()) {
      return [];
    }

    // Get the document from the range
    const document = range.commonAncestorContainer.ownerDocument;
    if (!document) {
      return [];
    }

    // Find all text nodes within the range
    const textNodes = _getTextNodesInRange(range);

    if (textNodes.length === 0) {
      return [];
    }

    // Group text nodes by their containing block elements
    const blockElementToTextNodes = new Map();

    for (const textNode of textNodes) {
      const blockElement = _findContainingBlockElement(textNode);
      if (blockElement) {
        if (!blockElementToTextNodes.has(blockElement)) {
          blockElementToTextNodes.set(blockElement, []);
        }
        blockElementToTextNodes.get(blockElement).push(textNode);
      }
    }

    // Create paragraphs from grouped text nodes
    for (const [blockElement, textNodes] of blockElementToTextNodes) {
      try {
        // Extract text from these specific text nodes
        let elementText = "";
        let firstTextNode = null;
        let lastTextNode = null;
        let firstTextOffset = 0;
        let lastTextOffset = 0;

        for (const textNode of textNodes) {
          const nodeText = textNode.textContent || "";

          // Track first and last text nodes for range creation
          if (!firstTextNode) {
            firstTextNode = textNode;
          }
          lastTextNode = textNode;

          // Check if this is the same node as both start and end container
          if (
            textNode === range.startContainer &&
            textNode === range.endContainer
          ) {
            elementText += nodeText.substring(
              range.startOffset,
              range.endOffset
            );
            firstTextOffset = range.startOffset;
            lastTextOffset = range.endOffset;
          }
          // If this is the start node, trim from the beginning
          else if (textNode === range.startContainer) {
            elementText += nodeText.substring(range.startOffset);
            firstTextOffset = range.startOffset;
            // If this is also the last node, set lastTextOffset
            if (textNode === lastTextNode) {
              lastTextOffset = nodeText.length;
            }
          }
          // If this is the end node, trim from the end
          else if (textNode === range.endContainer) {
            elementText += nodeText.substring(0, range.endOffset);
            lastTextOffset = range.endOffset;
            // If this is also the first node, set firstTextOffset
            if (textNode === firstTextNode) {
              firstTextOffset = 0;
            }
          }
          // Otherwise, include the full text (middle node)
          else {
            elementText += nodeText;
            // If this is the first node, set firstTextOffset
            if (textNode === firstTextNode) {
              firstTextOffset = 0;
            }
            // If this is the last node, set lastTextOffset
            if (textNode === lastTextNode) {
              lastTextOffset = nodeText.length;
            }
          }
        }

        // Don't normalize whitespace here - preserve original spacing
        // The normalization should happen at the test level for comparison
        elementText = elementText.trim();

        // Skip empty paragraphs
        if (!elementText || !firstTextNode || !lastTextNode) {
          continue;
        }

        // Create a DOM Range for the paragraph's actual text content
        const paragraphRange = document.createRange();

        // Validate offsets before setting range boundaries
        const maxStartOffset = firstTextNode.textContent
          ? firstTextNode.textContent.length
          : 0;
        const maxEndOffset = lastTextNode.textContent
          ? lastTextNode.textContent.length
          : 0;

        // Ensure offsets are within valid bounds
        const validFirstOffset = Math.min(
          Math.max(firstTextOffset, 0),
          maxStartOffset
        );
        const validLastOffset = Math.min(
          Math.max(lastTextOffset, 0),
          maxEndOffset
        );

        // Set start to the beginning of the first text node (accounting for trimming)
        paragraphRange.setStart(firstTextNode, validFirstOffset);

        // Set end to the end of the last text node (accounting for trimming)
        paragraphRange.setEnd(lastTextNode, validLastOffset);

        // Generate CFI for the block element itself to ensure uniqueness
        // This creates a single-point CFI that uniquely identifies this paragraph element
        const elementCfi = new EpubCFI(
          blockElement,
          contents.cfiBase,
          rendition.settings.ignoreClass
        );

        let startCfi: string, endCfi: string, cfiRange: string;

        // For paragraphs, we treat each as a single element with the same start and end CFI
        // This matches the test expectation that startCfi === endCfi for single paragraphs
        const mainCfi = elementCfi.toString();
        startCfi = mainCfi;
        endCfi = mainCfi;

        // For highlighting, we can use the range CFI that spans the text content
        const rangeCfiObj = new EpubCFI(
          paragraphRange,
          contents.cfiBase,
          rendition.settings.ignoreClass
        );
        cfiRange = rangeCfiObj.toString();

        // // Verify CFI can be parsed
        // try {
        //   const testCfi = new EpubCFI(mainCfi);
        //   if (!testCfi.path || !testCfi.base) {
        //     continue;
        //   }

        //   // Also verify the range CFI
        //   const testRangeCfi = new EpubCFI(cfiRange);
        //   if (!testRangeCfi.path || !testRangeCfi.base) {
        //     cfiRange = mainCfi; // Fallback to element CFI
        //   }
        // } catch (e) {
        //   continue;
        // }

        paragraphs.push({
          text: elementText,
          startCfi: startCfi,
          endCfi: endCfi,
          cfiRange: cfiRange, // Add full range CFI for highlighting
        });
      } catch (e) {
        console.error("❌ Error processing block element:", e);
        continue;
      }
    }

    // Fallback: if no paragraphs found but we have text, create one paragraph from entire range
    if (paragraphs.length === 0 && fullText.trim()) {
      try {
        const cfi = new EpubCFI(
          range,
          contents.cfiBase,
          rendition.settings.ignoreClass
        );
        const cfiString = cfi.toString();
        paragraphs.push({
          text: fullText.trim(),
          cfiRange: cfiString,
          startCfi: cfiString,
          endCfi: cfiString,
        });
      } catch (e) {
        console.error("Error creating fallback paragraph:", e);
      }
    }

    return paragraphs;
  } catch (e) {
    console.error("Error getting paragraphs from range:", e);
    return [];
  }
}

function _getEndFomStart(nextPageStart: number, pageWidth: number) {
  const pagesViewed = 2;
  return nextPageStart + pageWidth * pagesViewed;
}

async function _getNextPageParagraphsInSectionAsync(
  rendition: Rendition,
  currentView: View,
  currentSection: Section
) {
  try {
    const layout = rendition.manager.layout;
    const currentPage = currentSection.pages
      ? currentSection.pages[currentSection.pages.length - 1]
      : 1;

    const nextPageStart = currentPage * layout.pageWidth;

    const nextPageEnd = _getEndFomStart(nextPageStart, layout.pageWidth);

    return await _getParagraphs({
      rendition,
      currentView,
      startPageNumberPx: nextPageStart,
      endPageNumberPx: nextPageEnd,
    });
  } catch (e) {
    console.error("Error extracting next page paragraphs:", e);
    return [];
  }
}
async function _getParagraphs({
  rendition,
  currentView,
  startPageNumberPx,
  endPageNumberPx,
}: {
  rendition: Rendition;
  currentView: View;
  startPageNumberPx: number;
  endPageNumberPx: number;
}) {
  try {
    const pageMappings = rendition.manager.mapping.page(
      currentView.contents,
      currentView.section.cfiBase,
      startPageNumberPx,
      endPageNumberPx
    );

    if (!pageMappings || !pageMappings.start || !pageMappings.end) {
      return [];
    }

    const startCfi = new EpubCFI(pageMappings.start);
    const endCfi = new EpubCFI(pageMappings.end);

    let startRange = startCfi.toRange(currentView.contents.document);
    let endRange = endCfi.toRange(currentView.contents.document);

    if (!startRange || !endRange) {
      return [];
    }

    try {
      const comparison = startRange.compareBoundaryPoints(
        Range.START_TO_START,
        endRange
      );
      if (comparison > 0) {
        const temp = startRange;
        startRange = endRange;
        endRange = temp;
      }
    } catch (e) {
      console.error("Error comparing range boundaries:", e);
    }

    const range = currentView.contents.document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.endContainer, endRange.endOffset);
    const paragraphs = _getParagraphsFromRange(
      rendition,
      range,
      currentView.contents
    );

    return paragraphs;
  } catch (e) {
    console.error("Error extracting next page paragraphs:", e);
    return [];
  }
}

function _hasNextPageInCurrentSection(currentSection: Section) {
  // Use page numbers from location data
  // If pagination data isn't ready yet (on first load), assume we might have more pages
  // This will attempt to get the next page, which will fail gracefully if none exists
  if (!currentSection.pages || !currentSection.totalPages) {
    return true; // Changed from false to handle initial load race condition
  }

  // Check if current page is less than total pages
  const currentPage = currentSection.pages[currentSection.pages.length - 1];
  const hasNext = currentPage < currentSection.totalPages;

  return hasNext;
}

async function _getFirstPageParagraphsInNextSection(
  rendition: Rendition,
  currentView: View
) {
  const nextSection = currentView.section.next();

  if (!nextSection) {
    return []; // No next section available
  }

  // Try to find if the next section is already loaded as a view
  let nextView = rendition.manager.views.find({ index: nextSection.index });
  //
  if (!nextView) {
    // The next section is not loaded as a view yet
    // Load the section content directly without creating a view
    try {
      // Load the section content directly using the book's load method with timeout
      const loadPromise = nextSection.load(
        rendition.book.load.bind(rendition.book)
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Section load timeout")), 10000)
      );

      const loadedContent = (await Promise.race([
        loadPromise,
        timeoutPromise,
      ])) as Section;

      if (!loadedContent || !loadedContent.document) {
        return [];
      }

      const document = loadedContent.document;
      const body = document.body;

      if (!body) {
        return [];
      }

      // Create a Contents object from the loaded section
      const contents = new Contents(
        document,
        body,
        nextSection.cfiBase,
        nextSection.index
      );

      // Get the first page mapping instead of the entire section
      const firstPageMapping = _getFirstPageMapping(
        rendition,
        contents,
        nextSection
      );

      if (
        !firstPageMapping ||
        !firstPageMapping.start ||
        !firstPageMapping.end
      ) {
        return [];
      }

      // Convert CFIs to DOM ranges
      const startCfi = new EpubCFI(firstPageMapping.start);
      const endCfi = new EpubCFI(firstPageMapping.end);

      const startRange = startCfi.toRange(document);
      const endRange = endCfi.toRange(document);

      if (!startRange || !endRange) {
        return [];
      }

      // Create a range that encompasses the first page content
      const range = document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      // Extract paragraphs from the range
      const paragraphs = _getParagraphsFromRange(rendition, range, contents);

      return paragraphs;
    } catch (e) {
      console.error("Error loading next section content:", e);
      return [];
    }
  }

  // If the view is already loaded, use it
  if (!nextView.contents || !nextView.contents.document) {
    return [];
  }

  try {
    // Get the first page mapping instead of the entire section
    const firstPageMapping = _getFirstPageMapping(
      rendition,
      nextView.contents,
      nextView.section
    );

    if (!firstPageMapping || !firstPageMapping.start || !firstPageMapping.end) {
      return [];
    }

    // Convert CFIs to DOM ranges
    const startCfi = new EpubCFI(firstPageMapping.start);
    const endCfi = new EpubCFI(firstPageMapping.end);

    const startRange = startCfi.toRange(nextView.contents.document);
    const endRange = endCfi.toRange(nextView.contents.document);

    if (!startRange || !endRange) {
      return [];
    }

    // Create a range that encompasses the first page content
    const range = nextView.contents.document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.endContainer, endRange.endOffset);

    // Extract paragraphs from the range
    const paragraphs = _getParagraphsFromRange(
      rendition,
      range,
      nextView.contents
    );

    return paragraphs;
  } catch (e) {
    console.error("Error extracting paragraphs from next view:", e);
    return [];
  }
}

function _getFirstPageMapping(
  rendition: Rendition,
  contents: Contents,
  section: Section | SpineItem
) {
  const layout = rendition.manager.layout;

  // For the first page, start at 0 and use page width/height
  let start = 0;
  let end: any;

  if (rendition.manager.settings.axis === "horizontal") {
    end = layout.pageWidth;
  } else {
    end = layout.height;
  }

  return rendition.manager.mapping.page(contents, section.cfiBase, start, end);
}

/**
 * Get paragraphs from the previous page within the current section
 * @param {View} currentView - The current view
 * @param {Section} currentSection - The current section location data
 * @returns {Promise<Paragraph[]>} Promise that resolves to array of paragraph objects containing text content and CFI range, or null if no previous page exists
 */
async function _getPreviousPageParagraphsInSectionAsync(
  rendition: Rendition,
  currentView: View,
  currentSection: Section
) {
  try {
    const layout = rendition.manager.layout;
    const currentPage = currentSection.pages ? currentSection.pages[0] : 1; // First page in the current view
    const previousPageStart =
      currentPage * layout.pageWidth - layout.pageWidth * 2;

    const previousPageEnd = _getEndFomStart(
      previousPageStart,
      layout.pageWidth
    );
    return await _getParagraphs({
      rendition,
      currentView,
      startPageNumberPx: previousPageStart,
      endPageNumberPx: previousPageEnd,
    });
  } catch (e) {
    console.error("Error extracting previous page paragraphs:", e);
    return [];
  }
}

/**
 * Check if there's a previous page within the current section
 * @param {Object} currentSection - The current section location data
 * @returns {boolean} True if there's a previous page in the current section
 * @private
 */
function _hasPreviousPageInCurrentSection(currentSection: Section) {
  // Use page numbers from location data
  // If pagination data isn't ready yet (on first load), assume we might have previous pages
  // This will attempt to get the previous page, which will fail gracefully if none exists
  if (!currentSection.pages || !currentSection.totalPages) {
    return true; // Changed from false to handle initial load race condition
  }

  // Check if current page is greater than 1
  const currentPage = currentSection.pages[0]; // First page in the current view
  const hasPrevious = currentPage > 1;

  return hasPrevious;
}

/**
 * Get paragraphs from the last page of the previous section
 * @param {View} currentView - The current view
 * @returns {Promise<Paragraph[]>} Promise that resolves to array of paragraph objects
 * @private
 */
async function _getLastPageParagraphsInPreviousSection(
  rendition: Rendition,
  currentView: View
) {
  const previousSection = await currentView.section.prev();

  if (!previousSection) {
    return []; // No previous section available
  }

  // Try to find if the previous section is already loaded as a view
  let previousView = rendition.manager.views.find({
    index: previousSection.index,
  });

  if (!previousView) {
    // The previous section is not loaded as a view yet
    // Load the section content directly without creating a view
    try {
      // Load the section content directly using the book's load method with timeout
      const loadPromise = previousSection.load(
        rendition.book.load.bind(rendition.book)
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Section load timeout")), 10000)
      );

      const loadedContent = (await Promise.race([
        loadPromise,
        timeoutPromise,
      ])) as Section;

      if (!loadedContent || !loadedContent.document) {
        return [];
      }

      const document = loadedContent.document;
      const body = document.body;

      if (!body) {
        return [];
      }

      // Create a Contents object from the loaded section
      const contents = new Contents(
        document,
        body,
        previousSection.cfiBase,
        previousSection.index
      );

      // Get the last page mapping instead of the entire section
      const lastPageMapping = _getLastPageMapping(
        rendition,
        contents,
        previousSection
      );

      if (!lastPageMapping || !lastPageMapping.start || !lastPageMapping.end) {
        return [];
      }

      // Convert CFIs to DOM ranges
      const startCfi = new EpubCFI(lastPageMapping.start);
      const endCfi = new EpubCFI(lastPageMapping.end);

      const startRange = startCfi.toRange(document);
      const endRange = endCfi.toRange(document);

      if (!startRange || !endRange) {
        return [];
      }

      // Create a range that encompasses the last page content
      const range = document.createRange();
      range.setStart(startRange.startContainer, startRange.startOffset);
      range.setEnd(endRange.endContainer, endRange.endOffset);

      // Extract paragraphs from the range
      const paragraphs = _getParagraphsFromRange(rendition, range, contents);

      return paragraphs;
    } catch (e) {
      console.error("Error loading previous section content:", e);
      return [];
    }
  }

  // If the view is already loaded, use it
  if (!previousView.contents || !previousView.contents.document) {
    return [];
  }

  try {
    // Get the last page mapping instead of the entire section
    const lastPageMapping = _getLastPageMapping(
      rendition,
      previousView.contents,
      previousView.section
    );

    if (!lastPageMapping || !lastPageMapping.start || !lastPageMapping.end) {
      return [];
    }

    // Convert CFIs to DOM ranges
    const startCfi = new EpubCFI(lastPageMapping.start);
    const endCfi = new EpubCFI(lastPageMapping.end);

    const startRange = startCfi.toRange(previousView.contents.document);
    const endRange = endCfi.toRange(previousView.contents.document);

    if (!startRange || !endRange) {
      return [];
    }

    // Create a range that encompasses the last page content
    const range = previousView.contents.document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.endContainer, endRange.endOffset);

    // Extract paragraphs from the range
    const paragraphs = _getParagraphsFromRange(
      rendition,
      range,
      previousView.contents
    );

    return paragraphs;
  } catch (e) {
    console.error("Error extracting paragraphs from previous view:", e);
    return [];
  }
}

/**
 * Get the CFI mapping for the last page of a section
 * @param {Contents} contents - The contents object
 * @param {Section} section - The section object
 * @returns {Object|null} The CFI mapping for the last page
 * @private
 */
function _getLastPageMapping(
  rendition: Rendition,
  contents: Contents,
  section: Section | SpineItem
) {
  const layout = rendition.manager.layout;

  // For the last page, calculate based on total content height
  let start: number, end: number;

  if (rendition.manager.settings.axis === "horizontal") {
    // For horizontal layout, get the last page width
    const totalWidth = contents.content.scrollWidth;
    start = Math.max(0, totalWidth - layout.pageWidth);
    end = totalWidth;
  } else {
    // For vertical layout, get the last page height
    const totalHeight = contents.content.scrollHeight;
    start = Math.max(0, totalHeight - layout.height);
    end = totalHeight;
  }

  return rendition.manager.mapping.page(contents, section.cfiBase, start, end);
}
function paginatedLocation(rendition: Rendition) {
  const manager = rendition.manager;
  let visible = manager.visible();
  let container = manager.container.getBoundingClientRect();

  let scrolledX = 0;
  let pixelsUsedByPreviousPages = 0;

  if (manager.settings.fullsize) {
    scrolledX = window.scrollX;
  }

  let sections = visible.map((view) => {
    let { index, href } = view.section;
    let globalViewPortPosition;
    let globalChapterPosition = view.position();
    let width = view.width();

    // Find mapping
    let localViewPortStartPosition;
    let localViewPortEndPosition;
    let pageWidth;

    if (manager.settings.direction === "rtl") {
      globalViewPortPosition = container.right - scrolledX;
      pageWidth =
        Math.min(
          Math.abs(globalViewPortPosition - globalChapterPosition.left),
          manager.layout.width
        ) - pixelsUsedByPreviousPages;
      localViewPortEndPosition =
        globalChapterPosition.width -
        (globalChapterPosition.right - globalViewPortPosition) -
        pixelsUsedByPreviousPages;
      localViewPortStartPosition = localViewPortEndPosition - pageWidth;
    } else {
      globalViewPortPosition = container.left + scrolledX;
      pageWidth =
        Math.min(
          globalChapterPosition.right - globalViewPortPosition,
          manager.layout.width
        ) - pixelsUsedByPreviousPages;
      localViewPortStartPosition =
        globalViewPortPosition -
        globalChapterPosition.left +
        pixelsUsedByPreviousPages;
      localViewPortEndPosition = localViewPortStartPosition + pageWidth;
    }

    pixelsUsedByPreviousPages += pageWidth;

    let mapping = manager.mapping.page(
      view.contents,
      view.section.cfiBase,
      localViewPortStartPosition,
      localViewPortEndPosition
    );

    let totalPages = manager.layout.count(width).pages;
    let startPage = Math.floor(
      localViewPortStartPosition / manager.layout.pageWidth
    );
    let pages = [];
    let endPage = Math.floor(
      localViewPortEndPosition / manager.layout.pageWidth
    );

    // start page should not be negative
    if (startPage < 0) {
      startPage = 0;
      endPage = endPage + 1;
    }

    // Reverse page counts for rtl
    if (manager.settings.direction === "rtl") {
      let tempStartPage = startPage;
      startPage = totalPages - endPage;
      endPage = totalPages - tempStartPage;
    }

    for (var i = startPage + 1; i <= endPage; i++) {
      let pg = i;
      pages.push(pg);
    }

    return {
      index,
      href,
      pages,
      totalPages,
      mapping,
    };
  });

  return sections;
}

function getCurrentLocationPosition(rendition: Rendition) {
  const manager = rendition.manager;
  let visible = manager.visible();
  let container = manager.container.getBoundingClientRect();

  let scrolledX = 0;
  let pixelsUsedByPreviousPages = 0;

  if (manager.settings.fullsize) {
    scrolledX = window.scrollX;
  }
  if (visible.length === 0) {
    return null;
  }
  const view = visible[0];

  let { index, href } = view.section;
  let globalViewPortPosition;
  let globalChapterPosition = view.position();

  // Find mapping
  let localViewPortStartPosition;
  let localViewPortEndPosition;
  let pageWidth;

  if (manager.settings.direction === "rtl") {
    globalViewPortPosition = container.right - scrolledX;
    pageWidth =
      Math.min(
        Math.abs(globalViewPortPosition - globalChapterPosition.left),
        manager.layout.width
      ) - pixelsUsedByPreviousPages;
    localViewPortEndPosition =
      globalChapterPosition.width -
      (globalChapterPosition.right - globalViewPortPosition) -
      pixelsUsedByPreviousPages;
    localViewPortStartPosition = localViewPortEndPosition - pageWidth;
  } else {
    globalViewPortPosition = container.left + scrolledX;
    pageWidth =
      Math.min(
        globalChapterPosition.right - globalViewPortPosition,
        manager.layout.width
      ) - pixelsUsedByPreviousPages;
    localViewPortStartPosition =
      globalViewPortPosition -
      globalChapterPosition.left +
      pixelsUsedByPreviousPages;
    localViewPortEndPosition = localViewPortStartPosition + pageWidth;
  }

  pixelsUsedByPreviousPages += pageWidth;

  // let mapping = manager.mapping.page(
  //   view.contents,
  //   view.section.cfiBase,
  //   localViewPortStartPosition,
  //   localViewPortEndPosition
  // );

  // start page should not be negative

  return {
    index,
    href,
    localViewPortStartPosition,
    localViewPortEndPosition,
  };
}

function getMapping(
  rendition: Rendition,
  localViewPortStartPosition: number,
  localViewPortEndPosition: number,
  view: View
) {
  if (!view || !view.contents || !view.contents.document) {
    return null;
  }
  const manager = rendition.manager;
  let mapping = manager.mapping.page(
    view.contents,
    view.section.cfiBase,
    localViewPortStartPosition,
    localViewPortEndPosition
  );

  return mapping;
}

export function getCurrentView(rendition: Rendition) {
  const location = rendition.manager.currentLocation();

  if (!location || !location.length || !location[0]) {
    return null;
  }

  const visibleSection = location[0];

  if (
    !visibleSection.mapping ||
    !visibleSection.mapping.start ||
    !visibleSection.mapping.end
  ) {
    return null;
  }
  const index = visibleSection.index;
  const view = rendition.manager.views.find({ index });
  return view || null;
}

export function getCurrentIndex(rendition: Rendition) {
  const location = rendition.manager.currentLocation();

  if (!location || !location.length || !location[0]) {
    return null;
  }

  const visibleSection = location[0];

  if (
    !visibleSection.mapping ||
    !visibleSection.mapping.start ||
    !visibleSection.mapping.end
  ) {
    return null;
  }
  const index = visibleSection.index;

  return index;
}
export function getCurrentViewParagraphs(
  rendition: Rendition
): ParagraphWithCFI[] {
  if (!rendition.manager) {
    return [];
  }
  const locationPosition = getCurrentLocationPosition(rendition);

  if (!locationPosition) {
    return [];
  }
  const view = getCurrentView(rendition);
  if (!view) {
    return [];
  }

  const mapping = getMapping(
    rendition,
    locationPosition.localViewPortStartPosition,
    locationPosition.localViewPortEndPosition,
    view
  );
  if (!mapping) {
    return [];
  }

  return getParagraphsFromMapping({
    rendition,

    startCfiString: mapping.start,
    endCfiString: mapping.end,
  });
}

/**
 * Polls for a view to be created by epubjs after a section is loaded.
 * Checks repeatedly until the view exists or the maximum wait time is reached.
 * @param rendition - The epubjs Rendition instance
 * @param sectionIndex - The index of the section to find the view for
 * @param maxWaitTimeMs - Maximum time to wait in milliseconds (default: 2000)
 * @param pollIntervalMs - Interval between checks in milliseconds (default: 50)
 * @returns The View if found, null otherwise
 */
async function pollForViewToBeCreated(
  rendition: Rendition,
  sectionIndex: number,
  maxWaitTimeMs: number = 2000,
  pollIntervalMs: number = 50
): Promise<View | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTimeMs) {
    const view = rendition.manager.views.find({ index: sectionIndex });
    if (view) {
      return view;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return null;
}

async function getViewFromSpineItem(
  spineItem: SpineItem,
  rendition: Rendition
) {
  const loadPromise = spineItem.load(rendition.book.load.bind(rendition.book));

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Section load timeout")), 10000)
  );

  const loadedSection = (await Promise.race([
    loadPromise,
    timeoutPromise,
  ])) as Section;

  // if (!loadedSection || !loadedSection.document) {
  //   return null;
  // }
  //console.log(">>> loadedSection", loadedSection);
  let view = rendition.manager.views.find({ index: spineItem.index });
  if (view) {
    return view;
  }

  view = rendition.manager.views.find({ index: loadedSection.index });
  if (view) {
    return view;
  }

  // If view doesn't exist yet, poll for it
  // epubjs might need time to create the view after loading the section
  view =
    (await pollForViewToBeCreated(rendition, spineItem.index)) || undefined;
  if (view) {
    return view;
  }

  view =
    (await pollForViewToBeCreated(rendition, loadedSection.index)) || undefined;
  return view;
}

function getIntermediateParagraphs({
  rendition,
  firstChapter,
  secondChapter,
  localViewPortEndPosition,
  localViewPortStartPosition,
}: {
  rendition: Rendition;
  localViewPortStartPosition: number;
  localViewPortEndPosition: number;
  firstChapter: View;
  secondChapter: View;
}) {
  const pageWidth = rendition.manager.layout.width;
  const firstChapterUsedWidth =
    firstChapter.position().right - localViewPortStartPosition;
  const secondChapterRemainingWidth = pageWidth - firstChapterUsedWidth;
  const paragraphs = [];

  const firstMapping = getMapping(
    rendition,
    localViewPortStartPosition,
    Math.min(localViewPortEndPosition, firstChapter.position().right),
    firstChapter
  );
  const secondMapping = getMapping(
    rendition,
    0,
    secondChapterRemainingWidth,
    secondChapter
  );
  if (firstMapping) {
    paragraphs.push(
      ...getParagraphsFromMapping({
        rendition,
        startCfiString: firstMapping.start,
        endCfiString: firstMapping.end,
      })
    );
  }
  if (secondMapping) {
    paragraphs.push(
      ...getParagraphsFromMapping({
        rendition,
        startCfiString: secondMapping.start,
        endCfiString: secondMapping.end,
      })
    );
  }

  return paragraphs;
}
function clampedToChapterLocalDimentions(localPosition: number, chapter: View) {
  const localCurrentChapterEnd =
    chapter.position().right - chapter.position().left;
  if (localPosition > localCurrentChapterEnd) {
    return localCurrentChapterEnd;
  }
  if (localPosition < 0) {
    return 0;
  }
  return localPosition;
}
export async function getNextViewParagraphs(
  rendition: Rendition
): Promise<ParagraphWithCFI[]> {
  if (!rendition.manager) {
    return [];
  }
  const locationPosition = getCurrentLocationPosition(rendition);
  if (!locationPosition) {
    return [];
  }
  const viewPortWidth = rendition.manager.layout.width;

  let view = getCurrentView(rendition);
  if (!view) {
    return [];
  }

  const nextSpineItem = view.section.next();

  const secondChapter = nextSpineItem
    ? await getViewFromSpineItem(nextSpineItem, rendition).catch(() => null)
    : null;
  const firstChapterStart = clampedToChapterLocalDimentions(
    locationPosition.localViewPortStartPosition + viewPortWidth,
    view
  );
  const firstChapterEnd = clampedToChapterLocalDimentions(
    locationPosition.localViewPortEndPosition + viewPortWidth,
    view
  );
  const firstChapterWidth = firstChapterEnd - firstChapterStart;
  const secondChapterWidth = viewPortWidth - firstChapterWidth;

  const secondChapterEnd = secondChapter
    ? clampedToChapterLocalDimentions(secondChapterWidth, secondChapter)
    : 0;
  let positions: ParagraphPosition[] = [
    {
      start: firstChapterStart,
      end: firstChapterEnd,
      view: view,
    },
  ];
  if (secondChapter) {
    positions.push({
      start: 0,
      end: secondChapterEnd,
      view: secondChapter,
    });
  }
  positions = positions.filter((position) => position.end > position.start);
  console.log(">>> positions", positions);

  return createParagraphsFromPostions(positions, rendition);
}
type ParagraphPosition = {
  start: number;
  end: number;
  view: View;
};
function createParagraphsFromPostions(
  positions: ParagraphPosition[],
  rendition: Rendition
): ParagraphWithCFI[] {
  const paragraphs: ParagraphWithCFI[] = [];
  for (const position of positions) {
    const mapping = getMapping(
      rendition,
      position.start,
      position.end,
      position.view
    );

    if (!mapping) {
      continue;
    }

    const paragraphsGot = getParagraphsFromMapping({
      rendition,

      startCfiString: mapping.start,
      endCfiString: mapping.end,
      view: position.view,
    });
    paragraphs.push(...paragraphsGot);
  }

  return paragraphs;
}
export async function getPreviousViewParagraphs(
  rendition: Rendition
): Promise<ParagraphWithCFI[]> {
  if (!rendition.manager) {
    return [];
  }
  const locationPosition = getCurrentLocationPosition(rendition);
  if (!locationPosition) {
    return [];
  }
  const viewPortWidth = rendition.manager.layout.width;

  let view = getCurrentView(rendition);
  if (!view) {
    return [];
  }

  const previousSpineItem = view.section.prev();

  const secondChapter = previousSpineItem
    ? await getViewFromSpineItem(previousSpineItem, rendition).catch(() => null)
    : null;
  const firstChapterStart = clampedToChapterLocalDimentions(
    locationPosition.localViewPortStartPosition - viewPortWidth,
    view
  );
  const firstChapterEnd = clampedToChapterLocalDimentions(
    locationPosition.localViewPortEndPosition - viewPortWidth,
    view
  );
  const firstChapterWidth = firstChapterEnd - firstChapterStart;
  const remainingWidthForSecondChapter = viewPortWidth - firstChapterWidth;

  // If secondChapter is null but previousSpineItem exists, try to load the section directly
  let secondChapterParagraphs: ParagraphWithCFI[] = [];
  if (
    !secondChapter &&
    previousSpineItem &&
    remainingWidthForSecondChapter > 0
  ) {
    try {
      const loadPromise = previousSpineItem.load(
        rendition.book.load.bind(rendition.book)
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Section load timeout")), 10000)
      );

      const loadedSection = (await Promise.race([
        loadPromise,
        timeoutPromise,
      ])) as Section;

      if (loadedSection && loadedSection.document) {
        const document = loadedSection.document;
        const body = document.body;

        if (body) {
          // Create a Contents object from the loaded section
          const contents = new Contents(
            document,
            body,
            previousSpineItem.cfiBase,
            previousSpineItem.index
          );

          // Get dimensions
          const totalWidth =
            rendition.manager.settings.axis === "horizontal"
              ? body.scrollWidth
              : body.scrollHeight; // Using body dimensions as proxy for content dimensions

          const start = Math.max(
            0,
            totalWidth - remainingWidthForSecondChapter
          );
          const end = totalWidth;

          const mapping = rendition.manager.mapping.page(
            contents,
            previousSpineItem.cfiBase,
            start,
            end
          );

          if (mapping && mapping.start && mapping.end) {
            // Convert CFIs to DOM ranges
            const startCfi = new EpubCFI(mapping.start);
            const endCfi = new EpubCFI(mapping.end);

            const startRange = startCfi.toRange(document);
            const endRange = endCfi.toRange(document);

            if (startRange && endRange) {
              // Create a range that encompasses the content
              const range = document.createRange();
              range.setStart(startRange.startContainer, startRange.startOffset);
              range.setEnd(endRange.endContainer, endRange.endOffset);

              // Extract paragraphs from the range
              secondChapterParagraphs = _getParagraphsFromRange(
                rendition,
                range,
                contents
              );
            }
          }
        }
      }
    } catch (e) {
      console.error("Error loading previous section content:", e);
    }
  }

  const secondChapterLocalEnd = secondChapter
    ? secondChapter.position().right - secondChapter.position().left
    : 0;

  const secondChapterStart = secondChapter
    ? clampedToChapterLocalDimentions(
        secondChapterLocalEnd - remainingWidthForSecondChapter,
        secondChapter
      )
    : 0;
  let positions: ParagraphPosition[] = [
    {
      start: firstChapterStart,
      end: firstChapterEnd,
      view: view,
    },
  ];
  if (secondChapter) {
    positions.push({
      start: secondChapterStart,
      end: secondChapterLocalEnd,
      view: secondChapter,
    });
  }
  positions = positions.filter((position) => position.end > position.start);
  console.log(">>> positions", positions);

  const paragraphsFromPositions = createParagraphsFromPostions(
    positions,
    rendition
  );

  // If we got paragraphs from the loaded section directly, include them
  if (secondChapterParagraphs.length > 0) {
    return [...secondChapterParagraphs, ...paragraphsFromPositions];
  }

  return paragraphsFromPositions;
}

export function getParagraphsFromMapping({
  rendition,
  startCfiString,
  endCfiString,
  view: providedView,
}: {
  rendition: Rendition;

  startCfiString: string;
  endCfiString: string;
  view?: View;
}) {
  // Use provided view or find the view for this section
  const view = providedView || getCurrentView(rendition);
  if (!view) {
    return [];
  }

  if (!view || !view.contents || !view.contents.document) {
    return [];
  }

  try {
    // Create CFI ranges for the visible page
    const startCfi = new EpubCFI(startCfiString);
    const endCfi = new EpubCFI(endCfiString);

    // Convert CFIs to DOM ranges
    const startRange = startCfi.toRange(view.contents.document);
    const endRange = endCfi.toRange(view.contents.document);

    if (!startRange || !endRange) {
      return [];
    }

    // Create a range that encompasses the visible content
    const range = view.contents.document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.endContainer, endRange.endOffset);

    // Extract paragraphs from the range
    const paragraphs = _getParagraphsFromRange(rendition, range, view.contents);
    return paragraphs;
  } catch (e) {
    console.error("Error extracting paragraphs:", e);
    return [];
  }
}
async function _getLastPageParagraphsInPreviousSection2(
  rendition: Rendition,
  currentView: View
) {
  const previousSection = await currentView.section.prev();

  if (!previousSection) {
    return []; // No previous section available
  }

  // Try to find if the previous section is already loaded as a view
  let previousView = rendition.manager.views.find({
    index: previousSection.index,
  });

  // If the view is already loaded, use it
  if (
    !previousView ||
    !previousView.contents ||
    !previousView.contents.document
  ) {
    return [];
  }

  try {
    const lastPageMapping = _getLastPageMapping2(
      rendition,
      previousView!.contents,
      previousSection
    );

    return getMapping(
      rendition,
      lastPageMapping.start,
      lastPageMapping.end,
      previousView
    );
  } catch (e) {
    console.error("Error extracting paragraphs from previous view:", e);
    return [];
  }
}

async function _getFirstPageParagraphsInPreviousSection2(
  rendition: Rendition,
  currentView: View
) {
  const nextSection = await currentView.section.next();

  if (!nextSection) {
    return []; // No previous section available
  }

  // Try to find if the previous section is already loaded as a view
  let nextView = rendition.manager.views.find({
    index: nextSection.index,
  });

  // If the view is already loaded, use it
  if (!nextView || !nextView.contents || !nextView.contents.document) {
    return [];
  }

  try {
    const firstPageMapping = _getFirstPageMapping2(rendition);

    return getMapping(
      rendition,
      firstPageMapping.start,
      firstPageMapping.end,
      nextView
    );
  } catch (e) {
    console.error("Error extracting paragraphs from previous view:", e);
    return [];
  }
}

function _getLastPageMapping2(
  rendition: Rendition,
  contents: Contents,
  section: Section | SpineItem
) {
  const layout = rendition.manager.layout;

  // For the last page, calculate based on total content height
  let start: number, end: number;

  if (rendition.manager.settings.axis === "horizontal") {
    // For horizontal layout, get the last page width
    const totalWidth = section.width();
    start = Math.max(0, totalWidth - layout.width);
    end = totalWidth;
  } else {
    // For vertical layout, get the last page height
    const totalHeight = contents.content.scrollHeight;
    start = Math.max(0, totalHeight - layout.height);
    end = totalHeight;
  }

  return {
    start,
    end,
  };
}
function _getFirstPageMapping2(rendition: Rendition) {
  const layout = rendition.manager.layout;

  // For the first page, start at 0 and use page width/height
  let start = 0;
  let end: any;

  if (rendition.manager.settings.axis === "horizontal") {
    end = layout.pageWidth;
  } else {
    end = layout.height;
  }

  return {
    start,
    end,
  };
}
