import type { Book, Rendition } from "epubjs";
import type { BookOptions } from "epubjs/types/book";
import type View from "epubjs/types/managers/view";
import type Section from "epubjs/types/section";
import type { SpineItem } from "epubjs/types/section";
import Epub, { EpubCFI, Contents } from "epubjs";

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

export function getCurrentViewParagraphs(
  rendition: Rendition
): ParagraphWithCFI[] {
  if (!rendition.manager) {
    return [];
  }

  // Get the current location which includes the visible range
  const location = rendition.manager.currentLocation();

  if (!location || !location.length || !location[0]) {
    return [];
  }

  const visibleSection = location[0];

  if (
    !visibleSection.mapping ||
    !visibleSection.mapping.start ||
    !visibleSection.mapping.end
  ) {
    return [];
  }

  // Find the view for this section
  const view = rendition.manager.views.find({ index: visibleSection.index });

  if (!view || !view.contents || !view.contents.document) {
    return [];
  }

  try {
    // Create CFI ranges for the visible page
    const startCfi = new EpubCFI(visibleSection.mapping.start);
    const endCfi = new EpubCFI(visibleSection.mapping.end);

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
export async function getNextViewParagraphs(
  rendition: Rendition,
  options = { minLength: 50 }
) {
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

  if (minLength > 0) {
    paragraphs = paragraphs.filter(
      (p: { text: string | any[] }) => p.text.length >= minLength
    );
  }

  return paragraphs;
}
export async function getPreviousViewParagraphs(
  rendition: Rendition,
  options = { minLength: 50 }
) {
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
  if (
    !currentSection.mapping ||
    !currentSection.mapping.start ||
    !currentSection.mapping.end
  ) {
    return [];
  }

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

  if (minLength > 0) {
    paragraphs = paragraphs.filter(
      (p: { text: string | any[] }) => p.text.length >= minLength
    );
  }

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
      "fill-opacity": "0.3",
      "mix-blend-mode": "multiply",
    };
    const mergedStyles = Object.assign(defaultStyles, styles);

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
    rendition.annotations.remove(rangeCfi, "highlight");

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
    const nextPageEnd = nextPageStart + layout.pageWidth;

    const nextPageMapping = rendition.manager.mapping.page(
      currentView.contents,
      currentView.section.cfiBase,
      nextPageStart,
      nextPageEnd
    );

    if (!nextPageMapping || !nextPageMapping.start || !nextPageMapping.end) {
      return [];
    }

    const startCfi = new EpubCFI(nextPageMapping.start);
    const endCfi = new EpubCFI(nextPageMapping.end);

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

    const previousPageEnd = (currentPage - 1) * layout.pageWidth;
    const previousPageStart = Math.max(0, previousPageEnd - layout.pageWidth);

    const previousPageMapping = rendition.manager.mapping.page(
      currentView.contents,
      currentView.section.cfiBase,
      previousPageStart,
      previousPageEnd
    );

    if (
      !previousPageMapping ||
      !previousPageMapping.start ||
      !previousPageMapping.end
    ) {
      return [];
    }

    const startCfi = new EpubCFI(previousPageMapping.start);
    const endCfi = new EpubCFI(previousPageMapping.end);

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
  const previousSection = currentView.section.prev();

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
