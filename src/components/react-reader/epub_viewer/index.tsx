// Core imports for React component and ePub.js library
import React, { Component } from "react";

import type {
  NavItem,
  Contents,
  Rendition,
  Location,
  RenditionOptions,
  BookOptions,
  Book,
} from "@epubjs";
import Epub from "@epubjs";
import { EpubViewStyle as defaultStyles, type IEpubViewStyle } from "./style";
import type { ParagraphWithCFI } from "@//types";

export { EpubViewStyle } from "./style";

// Extended rendition options to include popup handling capability
export type RenditionOptionsFix = RenditionOptions & {
  allowPopups: boolean;
};

// Type definition for table of contents items
export type IToc = {
  label: string;
  href: string;
};

/**
 * Props interface for EpubView component
 * This component is the core viewer that handles rendering EPUB books
 */
export type IEpubViewProps = {
  url: string | ArrayBuffer; // The EPUB file source (can be URL or raw data)
  epubInitOptions?: Partial<BookOptions>; // Options for initializing the book
  epubOptions?: Partial<RenditionOptionsFix>; // Options for rendering the book
  epubViewStyles?: IEpubViewStyle; // Custom styling for the viewer
  loadingView?: React.ReactNode; // Custom loading indicator
  errorView?: React.ReactNode; // Custom error display
  location: string | number | null; // Current reading location (CFI or page number)
  locationChanged(value: string): void; // Callback when user navigates to new location
  showToc?: boolean; // Whether to display table of contents
  tocChanged?(value: NavItem[]): void; // Callback when TOC is loaded
  getRendition?(rendition: Rendition): void; // Callback to access rendition instance
  handleKeyPress?(): void; // Custom keyboard event handler
  handleTextSelected?(cfiRange: string, contents: Contents): void; // Callback when text is selected
  onPageTextExtracted?(data: { text: string }): void; // Callback when page text is extracted
  onPageParagraphsExtracted?(data: { paragraphs: ParagraphWithCFI[] }): void; // Callback when page paragraphs are extracted
  onNextPageParagraphs?(data: { paragraphs: ParagraphWithCFI[] }): void; // Callback when next page paragraphs are extracted
  onPreviousPageParagraphs?(data: { paragraphs: ParagraphWithCFI[] }): void; // Callback when previous page paragraphs are extracted
};

// Component state tracking loading status and table of contents
type IEpubViewState = {
  isLoaded: boolean; // Whether the book has finished loading
  isError: boolean; // Whether an error occurred during loading
  toc: NavItem[]; // Parsed table of contents
};

/**
 * EpubView Component
 * Core component responsible for rendering EPUB books using epub.js library
 * Handles book initialization, rendering, navigation, and event management
 */
export class EpubView extends Component<IEpubViewProps, IEpubViewState> {
  state: Readonly<IEpubViewState> = {
    isLoaded: false,
    isError: false,
    toc: [],
  };

  // Reference to the DOM element where the book will be rendered
  viewerRef = React.createRef<HTMLDivElement>();

  // Instance variables for tracking book state
  location?: string | number | null; // Current reading position
  book?: Book; // The epub.js Book instance
  rendition?: Rendition; // The epub.js Rendition instance (handles display)
  prevPage?: () => void; // Function to navigate to previous page
  nextPage?: () => void; // Function to navigate to next page

  constructor(props: IEpubViewProps) {
    super(props);
    this.location = props.location;
    // Initialize all book-related properties as undefined
    this.book = this.rendition = this.prevPage = this.nextPage = undefined;
  }

  /**
   * Component lifecycle: Setup
   * Initializes the book and sets up keyboard navigation when component mounts
   */
  componentDidMount() {
    this.initBook();
    document.addEventListener("keyup", this.handleKeyPress, false);
  }

  /**
   * Initialize the EPUB book
   * - Creates a new Book instance from the provided URL
   * - Sets up error handling
   * - Loads and parses the table of contents
   * - Triggers reader initialization once book is loaded
   */
  initBook() {
    const { url, tocChanged, epubInitOptions = {} } = this.props;
    // Destroy existing book instance if it exists (e.g., when switching books)
    if (this.book) {
      this.book.destroy();
    }
    // Create new book instance with epub.js
    this.book = Epub(url, epubInitOptions);

    // Handle book loading failures
    // this.book.on('openFailed', () => {
    //   this.setState({
    //     isError: true
    //   })
    // })

    // Once navigation data is loaded, extract TOC and initialize the reader
    this.book.loaded.navigation.then(({ toc }) => {
      this.setState(
        {
          isLoaded: true,
          isError: false,
          toc: toc,
        },
        () => {
          // Notify parent component of TOC and initialize the reader
          tocChanged && tocChanged(toc);
          this.initReader();
        }
      );
    });
  }

  /**
   * Component lifecycle: Cleanup
   * Destroys book instance and removes event listeners to prevent memory leaks
   */
  componentWillUnmount() {
    if (this.book) {
      this.book.destroy();
    }
    // Clean up all references
    this.book = this.rendition = this.prevPage = this.nextPage = undefined;
    document.removeEventListener("keyup", this.handleKeyPress, false);
  }

  /**
   * Performance optimization: Control when component should re-render
   * Only re-render when:
   * - Book is not yet loaded (to show loading states)
   * - Location has changed (user navigated to different page)
   * - URL has changed (different book is being loaded)
   */
  shouldComponentUpdate(nextProps: IEpubViewProps) {
    return (
      !this.state.isLoaded ||
      nextProps.location !== this.props.location ||
      nextProps.url !== this.props.url
    );
  }

  /**
   * Component lifecycle: Handle prop changes
   * Responds to location changes and book URL changes
   */
  componentDidUpdate(prevProps: IEpubViewProps) {
    // Navigate to new location if location prop changed externally
    if (
      prevProps.location !== this.props.location &&
      this.location !== this.props.location
    ) {
      this.rendition?.display(this.props.location + "");
    }
    // Reload book if URL changed (switching to different book)
    if (prevProps.url !== this.props.url) {
      this.initBook();
    }
  }

  /**
   * Initialize the EPUB reader (rendition)
   * This creates the visual rendering of the book in the DOM
   * - Sets up the rendition with proper dimensions
   * - Configures navigation functions (prev/next page)
   * - Registers event listeners
   * - Displays initial location or first page
   */
  initReader() {
    const { toc } = this.state;
    const { location, epubOptions, getRendition } = this.props;
    if (this.viewerRef.current) {
      const node = this.viewerRef.current;
      if (this.book) {
        // Create rendition instance that displays book in the DOM
        const rendition = this.book.renderTo(node, {
          width: "100%",
          height: "100%",
          manager: "continuous",
          ...epubOptions,
        });
        this.rendition = rendition;

        // Set up pagination navigation functions
        this.prevPage = () => {
          rendition.prev();
        };
        this.nextPage = () => {
          rendition.next();
          rendition.emit("nextPage");
        };

        // Set up event listeners for user interactions
        this.registerEvents();

        // Provide rendition instance to parent component if callback exists
        getRendition && getRendition(rendition);

        // Display the book at the specified location or start from beginning
        if (typeof location === "string" || typeof location === "number") {
          rendition.display(location + "");
        } else if (toc.length > 0 && toc[0].href) {
          rendition.display(toc[0].href);
        } else {
          rendition.display("");
        }
      }
    }
  }

  /**
   * Register event listeners for the rendition
   * Handles:
   * - Location changes (user navigating through book)
   * - Keyboard input (arrow keys for navigation)
   * - Text selection (for highlighting, notes, etc.)
   */
  registerEvents() {
    const { handleKeyPress, handleTextSelected } = this.props;
    if (this.rendition) {
      this.rendition.on("locationChanged", this.onLocationChange);
      this.rendition.on("keyup", handleKeyPress || this.handleKeyPress);
      if (handleTextSelected) {
        this.rendition.on("selected", handleTextSelected);
      }
      // call onPageTextExtracted, onPageParagraphsExtracted, onNextPageParagraphs, and onPreviousPageParagraphs on initial load
      const {
        onPageTextExtracted,
        onPageParagraphsExtracted,
        onNextPageParagraphs,
        onPreviousPageParagraphs,
      } = this.props;
      if (
        onPageTextExtracted ||
        onPageParagraphsExtracted ||
        onNextPageParagraphs ||
        onPreviousPageParagraphs
      ) {
        this.rendition.on("rendered", () => {
          if (onPageTextExtracted) {
            const pageTextData = this.getCurrentPageText();
            onPageTextExtracted(pageTextData);
          }
          if (onPageParagraphsExtracted) {
            const pageParagraphsData = this.getCurrentPageParagraphs();
            onPageParagraphsExtracted(pageParagraphsData);
          }
          if (onNextPageParagraphs) {
            this.getNextViewParagraphs().then((nextPageParagraphsData) => {
              onNextPageParagraphs(nextPageParagraphsData);
            });
          } else {
            // Always log next page paragraphs even if no callback is provided
            this.getNextViewParagraphs();
          }
          if (onPreviousPageParagraphs) {
            this.getPreviousViewParagraphs().then(
              (previousPageParagraphsData) => {
                onPreviousPageParagraphs(previousPageParagraphsData);
              }
            );
          } else {
            // Always log previous page paragraphs even if no callback is provided
            this.getPreviousViewParagraphs();
          }
        });
      }
    }
  }

  /**
   * Handle location changes in the book
   * Called when user navigates to a different page
   * Updates internal state and notifies parent component
   */
  onLocationChange = (loc: Location) => {
    const {
      location,
      locationChanged,
      onPageTextExtracted,
      onPageParagraphsExtracted,
      onNextPageParagraphs,
      onPreviousPageParagraphs,
    } = this.props;
    const newLocation = `${loc.start}`;
    if (location !== newLocation) {
      this.location = newLocation;
      locationChanged && locationChanged(newLocation);

      // Extract and provide page text if callback is provided
      if (onPageTextExtracted) {
        const pageTextData = this.getCurrentPageText();
        onPageTextExtracted(pageTextData);
      }

      // Extract and provide page paragraphs if callback is provided
      if (onPageParagraphsExtracted) {
        const pageParagraphsData = this.getCurrentPageParagraphs();
        onPageParagraphsExtracted(pageParagraphsData);
      }

      // Extract and log next page paragraphs on every new page
      if (onNextPageParagraphs) {
        this.getNextViewParagraphs().then((nextPageParagraphsData) => {
          onNextPageParagraphs(nextPageParagraphsData);
        });
      } else {
        // Always log next page paragraphs even if no callback is provided
        this.getNextViewParagraphs().then((nextPageParagraphsData) => {
          console.log(
            "Next page paragraphs:",
            nextPageParagraphsData.paragraphs
          );
        });
      }

      // Extract and log previous page paragraphs on every new page
      if (onPreviousPageParagraphs) {
        this.getPreviousViewParagraphs().then((previousPageParagraphsData) => {
          onPreviousPageParagraphs(previousPageParagraphsData);
        });
      } else {
        // Always log previous page paragraphs even if no callback is provided
        this.getPreviousViewParagraphs().then((previousPageParagraphsData) => {
          console.log(
            "Previous page paragraphs:",
            previousPageParagraphsData.paragraphs
          );
        });
      }
    }
  };

  /**
   * Render the book container
   * Creates the DOM element that will hold the rendered EPUB content
   */
  renderBook() {
    const { epubViewStyles = defaultStyles } = this.props;
    return <div ref={this.viewerRef} style={epubViewStyles.view} />;
  }

  /**
   * Extract visible text from the currently displayed page
   * Returns structured data with text content and location metadata
   */
  getCurrentPageText = () => {
    if (!this.rendition) {
      return { text: "" };
    }
    const currentView = this.rendition?.getCurrentViewText();
    // Handle both string and object return types from getCurrentViewText
    const textValue =
      typeof currentView === "string" ? currentView : currentView?.text || "";
    return { text: textValue };
  };

  /**
   * Extract paragraphs from the currently displayed page using rendition.getContents()
   * Returns structured data with array of paragraph objects including CFI ranges
   */
  getCurrentPageParagraphs = () => {
    if (!this.rendition) {
      return { paragraphs: [] };
    }
    return this.getCurrentViewParagraphs();
  };

  /**
   * Extract paragraphs from a rendition instance
   * Returns full paragraph objects with text and CFI ranges
   */
  getCurrentViewParagraphs = () => {
    try {
      if (!this.rendition) {
        return { paragraphs: [] };
      }

      const result = this.rendition.getCurrentViewParagraphs();
      if (result && Array.isArray(result)) {
        // Return full paragraph objects with CFI ranges
        const paragraphs: ParagraphWithCFI[] = result.map((item) => ({
          text: item.text || "",
          cfiRange: item.cfiRange || "",
        }));
        return { paragraphs };
      }

      return { paragraphs: [] };
    } catch (error) {
      console.warn("Error extracting paragraphs:", error);
      return { paragraphs: [] };
    }
  };

  /**
   * Extract paragraphs from the next page using rendition.getNextViewParagraphs
   * Returns structured data with array of paragraph objects including CFI ranges
   */
  getNextViewParagraphs = async () => {
    try {
      if (!this.rendition) {
        return { paragraphs: [] };
      }

      // Check if getNextViewParagraphs method exists on rendition
      if (typeof this.rendition.getNextViewParagraphs === "function") {
        const result = await this.rendition.getNextViewParagraphs();
        if (result && Array.isArray(result)) {
          // Return full paragraph objects with CFI ranges
          const paragraphs: ParagraphWithCFI[] = result.map((item) => ({
            text: item.text || "",
            cfiRange: item.cfiRange || "",
          }));
          return { paragraphs };
        }
      } else {
        // Fallback: simulate next page paragraphs by getting current page and logging them
        // This is a placeholder implementation since getNextViewParagraphs doesn't exist in epub.js
        console.log(
          "getNextViewParagraphs method not available in epub.js rendition"
        );
        const currentParagraphs = this.getCurrentViewParagraphs();
        console.log(
          "Current page paragraphs (as fallback for next page):",
          currentParagraphs.paragraphs
        );
        return currentParagraphs;
      }

      return { paragraphs: [] };
    } catch (error) {
      console.warn("Error extracting next page paragraphs:", error);
      return { paragraphs: [] };
    }
  };

  /**
   * Extract paragraphs from the previous page using rendition.getPreviousViewParagraphs
   * Returns structured data with array of paragraph objects including CFI ranges
   */
  getPreviousViewParagraphs = async () => {
    try {
      if (!this.rendition) {
        return { paragraphs: [] };
      }

      // Check if getPreviousViewParagraphs method exists on rendition
      if (typeof this.rendition.getPreviousViewParagraphs === "function") {
        const result = await this.rendition.getPreviousViewParagraphs();
        if (result && Array.isArray(result)) {
          // Return full paragraph objects with CFI ranges
          const paragraphs: ParagraphWithCFI[] = result.map((item) => ({
            text: item.text || "",
            cfiRange: item.cfiRange || "",
          }));
          return { paragraphs };
        }
      } else {
        // Fallback: simulate previous page paragraphs by getting current page and logging them
        // This is a placeholder implementation since getPreviousViewParagraphs doesn't exist in epub.js
        console.log(
          "getPreviousViewParagraphs method not available in epub.js rendition"
        );
        const currentParagraphs = this.getCurrentViewParagraphs();
        console.log(
          "Current page paragraphs (as fallback for previous page):",
          currentParagraphs.paragraphs
        );
        return currentParagraphs;
      }

      return { paragraphs: [] };
    } catch (error) {
      console.warn("Error extracting previous page paragraphs:", error);
      return { paragraphs: [] };
    }
  };

  /**
   * Highlight a specific paragraph by CFI range
   */
  highlightParagraph = (cfiRange: string) => {
    if (this.rendition && cfiRange) {
      this.rendition.highlightRange(cfiRange);
    }
  };

  /**
   * Remove highlight from a specific paragraph by CFI range
   */
  removeHighlight = (cfiRange: string) => {
    if (this.rendition && cfiRange) {
      this.rendition.removeHighlight(cfiRange);
    }
  };

  /**
   * Handle keyboard navigation
   * Provides default keyboard controls if no custom handler is provided:
   * - Right Arrow: Next page
   * - Left Arrow: Previous page
   */
  handleKeyPress = (event: KeyboardEvent) => {
    if (!this.props.handleKeyPress) {
      if (event.key === "ArrowRight" && this.nextPage) {
        this.nextPage();
      }
      if (event.key === "ArrowLeft" && this.prevPage) {
        this.prevPage();
      }
    }
  };

  /**
   * Main render method
   * Conditionally renders:
   * - Loading view: While book is loading
   * - Error view: If book failed to load
   * - Book view: Once book is successfully loaded
   */
  render() {
    const { isLoaded, isError } = this.state;
    const {
      loadingView = null,
      errorView = null,
      epubViewStyles = defaultStyles,
    } = this.props;
    return (
      <div style={epubViewStyles.viewHolder}>
        {isLoaded && this.renderBook()}
        {!isLoaded && !isError && loadingView}
        {!isLoaded && isError && errorView}
      </div>
    );
  }
}
