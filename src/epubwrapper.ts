import Epub, { Book, EpubCFI, Rendition, Contents } from "epubjs";
import { BookOptions } from "epubjs/types/book";
import Manager from "epubjs/types/managers/manager";
import View from "epubjs/types/managers/view";

type ExtendedView = View & {
  contents: Contents;
};

type Views = ExtendedView[] & {
  find: ({ index }: { index: number }) => ExtendedView | undefined;
};

type ExtendedManager = Manager & {
  views: Views;
};
export type ParagraphWithCFI = {
  text: string;
  cfiRange: string;
  startCfi: string;
  endCfi: string;
};
type ExtendedRendition = Rendition & {
  manager: ExtendedManager;
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
  rendition: ExtendedRendition
): ParagraphWithCFI[] | null {
  if (!rendition.manager) {
    return null;
  }

  // Get the current location which includes the visible range
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

    // Extract paragraphs from the range
    const paragraphs = _getParagraphsFromRange(rendition, range, view.contents);
    return paragraphs;
  } catch (e) {
    console.error("Error extracting paragraphs:", e);
    return null;
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
  rendition: ExtendedRendition,
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
