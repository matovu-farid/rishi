import Book from "./book";
import Rendition from "./rendition";
import CFI from "./epubcfi";
import Contents from "./contents";
import * as utils from "./utils/new_core";
import { EPUBJS_VERSION } from "./utils/constants";

import IframeView from "./managers/views/iframe";
import DefaultViewManager from "./managers/default";
import ContinuousViewManager from "./managers/continuous";
import { BookOptions } from "./book";

// declare function Epub(urlOrData: string | ArrayBuffer, options?: BookOptions): Book
// declare function Epub(options?: BookOptions): Book

/**
 * Creates a new Book
 * @param {string|ArrayBuffer} url URL, Path or ArrayBuffer
 * @param {object} options to pass to the book
 * @returns {Book} a new Book object
 * @example ePub("/path/to/book.epub", {})
 */
function ePub(url: string | ArrayBuffer, options: Partial<BookOptions>): Book {
  return new Book(url, options);
}

ePub.VERSION = EPUBJS_VERSION;

if (typeof global !== "undefined") {
  global.EPUBJS_VERSION = EPUBJS_VERSION;
}

ePub.Book = Book;
ePub.Rendition = Rendition;
ePub.Contents = Contents;
ePub.CFI = CFI;
ePub.utils = utils;

export default ePub;
