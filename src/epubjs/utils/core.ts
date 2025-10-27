/**
 * Core Utilities and Helpers
 * @module Core
 */
import { DOMParser as XMLDOMParser } from "@xmldom/xmldom";

/**
 * Vendor prefixed requestAnimationFrame
 * @returns {function} requestAnimationFrame
 * @memberof Core
 */
export const requestAnimationFrame:
  | ((callback: FrameRequestCallback) => number)
  | false =
  typeof window != "undefined"
    ? window.requestAnimationFrame ||
      (window as any).mozRequestAnimationFrame ||
      (window as any).webkitRequestAnimationFrame ||
      (window as any).msRequestAnimationFrame
    : false;

const ELEMENT_NODE: number = 1;
const TEXT_NODE: number = 3;
const _URL: typeof URL | undefined =
  typeof URL != "undefined"
    ? URL
    : typeof window != "undefined"
      ? (window as any).URL ||
        (window as any).webkitURL ||
        (window as any).mozURL
      : undefined;

/**
 * Generates a UUID
 * based on: http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
 * @returns {string} uuid
 * @memberof Core
 */
export function uuid(): string {
  var d = new Date().getTime();
  var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c == "x" ? r : (r & 0x7) | 0x8).toString(16);
    },
  );
  return uuid;
}

/**
 * Gets the height of a document
 * @returns {number} height
 * @memberof Core
 */
export function documentHeight(): number {
  return Math.max(
    document.documentElement.clientHeight,
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
  );
}

/**
 * Checks if a node is an element
 * @param {object} obj
 * @returns {boolean}
 * @memberof Core
 */
export function isElement(obj: any): obj is Element {
  return !!(obj && obj.nodeType == 1);
}

/**
 * @param {any} n
 * @returns {boolean}
 * @memberof Core
 */
export function isNumber(n: any): boolean {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * @param {any} n
 * @returns {boolean}
 * @memberof Core
 */
export function isFloat(n: any): boolean {
  let f = parseFloat(n);

  if (isNumber(n) === false) {
    return false;
  }

  if (typeof n === "string" && n.indexOf(".") > -1) {
    return true;
  }

  return Math.floor(f) !== f;
}

/**
 * Get a prefixed css property
 * @param {string} unprefixed
 * @returns {string}
 * @memberof Core
 */
export function prefixed(unprefixed: string): string {
  var vendors = ["Webkit", "webkit", "Moz", "O", "ms"];
  var prefixes = ["-webkit-", "-webkit-", "-moz-", "-o-", "-ms-"];
  var lower = unprefixed.toLowerCase();
  var length = vendors.length;

  if (
    typeof document === "undefined" ||
    typeof (document.body.style as any)[lower] != "undefined"
  ) {
    return unprefixed;
  }

  for (var i = 0; i < length; i++) {
    if (
      typeof (document.body.style as any)[prefixes[i] + lower] != "undefined"
    ) {
      return prefixes[i] + lower;
    }
  }

  return unprefixed;
}

/**
 * Apply defaults to an object
 * @param {object} obj
 * @returns {object}
 * @memberof Core
 */
export function defaults(obj: any, ..._args: any[]): any {
  for (var i = 1, length = arguments.length; i < length; i++) {
    var source = arguments[i];
    for (var prop in source) {
      if (obj[prop] === void 0) obj[prop] = source[prop];
    }
  }
  return obj;
}

/**
 * Extend properties of an object
 * @param {object} target
 * @returns {object}
 * @memberof Core
 */
export function extend(target: any, ..._sources: any[]): any {
  var sourceArray = [].slice.call(arguments, 1);
  sourceArray.forEach(function (source: any) {
    if (!source) return;
    Object.getOwnPropertyNames(source).forEach(function (propName: string) {
      const descriptor = Object.getOwnPropertyDescriptor(source, propName);
      if (descriptor) {
        Object.defineProperty(target, propName, descriptor);
      }
    });
  });
  return target;
}

/**
 * Fast quicksort insert for sorted array -- based on:
 *  http://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
 * @param {any} item
 * @param {array} array
 * @param {function} [compareFunction]
 * @returns {number} location (in array)
 * @memberof Core
 */
export function insert(
  item: any,
  array: any[],
  compareFunction?: (a: any, b: any) => number,
): number {
  var location = locationOf(item, array, compareFunction);
  array.splice(location, 0, item);

  return location;
}

/**
 * Finds where something would fit into a sorted array
 * @param {any} item
 * @param {array} array
 * @param {function} [compareFunction]
 * @param {function} [_start]
 * @param {function} [_end]
 * @returns {number} location (in array)
 * @memberof Core
 */
export function locationOf(
  item: any,
  array: any[],
  compareFunction?: (a: any, b: any) => number,
  _start?: number,
  _end?: number,
): number {
  var start = _start || 0;
  var end = _end || array.length;
  var pivot = Math.floor(start + (end - start) / 2);
  var compared: number;

  if (!compareFunction) {
    compareFunction = function (a, b) {
      if (a > b) return 1;
      if (a < b) return -1;
      if (a == b) return 0;
      return 0;
    };
  }

  if (end - start <= 0) {
    return pivot;
  }

  compared = compareFunction(array[pivot], item);
  if (end - start === 1) {
    return compared >= 0 ? pivot : pivot + 1;
  }
  if (compared === 0) {
    return pivot;
  }
  if (compared === -1) {
    return locationOf(item, array, compareFunction, pivot, end);
  } else {
    return locationOf(item, array, compareFunction, start, pivot);
  }
}

/**
 * Finds index of something in a sorted array
 * Returns -1 if not found
 * @param {any} item
 * @param {array} array
 * @param {function} [compareFunction]
 * @param {function} [_start]
 * @param {function} [_end]
 * @returns {number} index (in array) or -1
 * @memberof Core
 */
export function indexOfSorted(
  item: any,
  array: any[],
  compareFunction?: (a: any, b: any) => number,
  _start?: number,
  _end?: number,
): number {
  var start = _start || 0;
  var end = _end || array.length;
  var pivot = Math.floor(start + (end - start) / 2);
  var compared: number;

  if (!compareFunction) {
    compareFunction = function (a, b) {
      if (a > b) return 1;
      if (a < b) return -1;
      if (a == b) return 0;
      return 0;
    };
  }

  if (end - start <= 0) {
    return -1; // Not found
  }

  compared = compareFunction(array[pivot], item);
  if (end - start === 1) {
    return compared === 0 ? pivot : -1;
  }
  if (compared === 0) {
    return pivot; // Found
  }
  if (compared === -1) {
    return indexOfSorted(item, array, compareFunction, pivot, end);
  } else {
    return indexOfSorted(item, array, compareFunction, start, pivot);
  }
}

/**
 * Find the bounds of an element
 * taking padding and margin into account
 * @param {element} el
 * @returns {{ width: Number, height: Number}}
 * @memberof Core
 */
export function bounds(el: Element): { width: number; height: number } {
  var style = window.getComputedStyle(el);
  var widthProps = [
    "width",
    "paddingRight",
    "paddingLeft",
    "marginRight",
    "marginLeft",
    "borderRightWidth",
    "borderLeftWidth",
  ];
  var heightProps = [
    "height",
    "paddingTop",
    "paddingBottom",
    "marginTop",
    "marginBottom",
    "borderTopWidth",
    "borderBottomWidth",
  ];

  var width = 0;
  var height = 0;

  widthProps.forEach(function (prop) {
    width += parseFloat(style.getPropertyValue(prop)) || 0;
  });

  heightProps.forEach(function (prop) {
    height += parseFloat(style.getPropertyValue(prop)) || 0;
  });

  return {
    height: height,
    width: width,
  };
}

/**
 * Find the bounds of an element
 * taking padding, margin and borders into account
 * @param {element} el
 * @returns {{ width: Number, height: Number}}
 * @memberof Core
 */
export function borders(el: Element): { width: number; height: number } {
  var style = window.getComputedStyle(el);
  var widthProps = [
    "paddingRight",
    "paddingLeft",
    "marginRight",
    "marginLeft",
    "borderRightWidth",
    "borderLeftWidth",
  ];
  var heightProps = [
    "paddingTop",
    "paddingBottom",
    "marginTop",
    "marginBottom",
    "borderTopWidth",
    "borderBottomWidth",
  ];

  var width = 0;
  var height = 0;

  widthProps.forEach(function (prop) {
    width += parseFloat(style.getPropertyValue(prop)) || 0;
  });

  heightProps.forEach(function (prop) {
    height += parseFloat(style.getPropertyValue(prop)) || 0;
  });

  return {
    height: height,
    width: width,
  };
}

/**
 * Find the bounds of any node
 * allows for getting bounds of text nodes by wrapping them in a range
 * @param {node} node
 * @returns {BoundingClientRect}
 * @memberof Core
 */
export function nodeBounds(node: Node): DOMRect {
  let elPos: DOMRect;
  let doc = node.ownerDocument;
  if (node.nodeType == Node.TEXT_NODE) {
    let elRange = doc!.createRange();
    elRange.selectNodeContents(node);
    elPos = elRange.getBoundingClientRect();
  } else {
    elPos = (node as Element).getBoundingClientRect();
  }
  return elPos;
}

/**
 * Find the equivalent of getBoundingClientRect of a browser window
 * @returns {{ width: Number, height: Number, top: Number, left: Number, right: Number, bottom: Number }}
 * @memberof Core
 */
export function windowBounds(): {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  var width = window.innerWidth;
  var height = window.innerHeight;

  return {
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width: width,
    height: height,
  };
}

/**
 * Gets the index of a node in its parent
 * @param {Node} node
 * @param {string} typeId
 * @return {number} index
 * @memberof Core
 */
export function indexOfNode(node: Node, typeId: number): number {
  var parent = node.parentNode;
  var children = parent!.childNodes;
  var sib: Node;
  var index = -1;
  for (var i = 0; i < children.length; i++) {
    sib = children[i];
    if (sib.nodeType === typeId) {
      index++;
    }
    if (sib == node) break;
  }

  return index;
}

/**
 * Gets the index of a text node in its parent
 * @param {node} textNode
 * @returns {number} index
 * @memberof Core
 */
export function indexOfTextNode(textNode: Node): number {
  return indexOfNode(textNode, TEXT_NODE);
}

/**
 * Gets the index of an element node in its parent
 * @param {element} elementNode
 * @returns {number} index
 * @memberof Core
 */
export function indexOfElementNode(elementNode: Node): number {
  return indexOfNode(elementNode, ELEMENT_NODE);
}

/**
 * Check if extension is xml
 * @param {string} ext
 * @returns {boolean}
 * @memberof Core
 */
export function isXml(ext: string): boolean {
  return ["xml", "opf", "ncx"].indexOf(ext) > -1;
}

/**
 * Create a new blob
 * @param {any} content
 * @param {string} mime
 * @returns {Blob}
 * @memberof Core
 */
export function createBlob(content: any, mime: string): Blob {
  return new Blob([content], { type: mime });
}

/**
 * Create a new blob url
 * @param {any} content
 * @param {string} mime
 * @returns {string} url
 * @memberof Core
 */
export function createBlobUrl(content: any, mime: string): string {
  var tempUrl: string;
  var blob = createBlob(content, mime);

  tempUrl = _URL!.createObjectURL(blob);

  return tempUrl;
}

/**
 * Remove a blob url
 * @param {string} url
 * @memberof Core
 */
export function revokeBlobUrl(url: string): void {
  _URL!.revokeObjectURL(url);
}

/**
 * Create a new base64 encoded url
 * @param {any} content
 * @param {string} mime
 * @returns {string} url
 * @memberof Core
 */
export function createBase64Url(
  content: any,
  mime: string,
): string | undefined {
  var data: string;
  var datauri: string;

  if (typeof content !== "string") {
    // Only handles strings
    return;
  }

  data = btoa(content);

  datauri = "data:" + mime + ";base64," + data;

  return datauri;
}

/**
 * Get type of an object
 * @param {object} obj
 * @returns {string} type
 * @memberof Core
 */
export function type(obj: any): string {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

/**
 * Parse xml (or html) markup
 * @param {string} markup
 * @param {string} mime
 * @param {boolean} forceXMLDom force using xmlDom to parse instead of native parser
 * @returns {document} document
 * @memberof Core
 */
export function parse(
  markup: string,
  mime: string,
  forceXMLDom?: boolean,
): Document {
  var doc: Document;
  var Parser: typeof DOMParser | typeof XMLDOMParser;

  if (typeof DOMParser === "undefined" || forceXMLDom) {
    Parser = XMLDOMParser;
  } else {
    Parser = DOMParser;
  }

  // Remove byte order mark before parsing
  // https://www.w3.org/International/questions/qa-byte-order-mark
  if (markup.charCodeAt(0) === 0xfeff) {
    markup = markup.slice(1);
  }

  doc = new Parser().parseFromString(markup, mime as DOMParserSupportedType);

  return doc;
}

/**
 * querySelector polyfill
 * @param {element} el
 * @param {string} sel selector string
 * @returns {element} element
 * @memberof Core
 */
export function qs(el: Element | Document, sel: string): Element | null {
  if (!el) {
    throw new Error("No Element Provided");
  }

  if (typeof el.querySelector != "undefined") {
    return el.querySelector(sel);
  } else {
    var elements = (el as Element).getElementsByTagName(sel);
    if (elements.length) {
      return elements[0];
    }
  }
  return null;
}

/**
 * querySelectorAll polyfill
 * @param {element} el
 * @param {string} sel selector string
 * @returns {element[]} elements
 * @memberof Core
 */
export function qsa(
  el: Element | Document,
  sel: string,
): NodeListOf<Element> | HTMLCollection {
  if (typeof el.querySelector != "undefined") {
    return el.querySelectorAll(sel);
  } else {
    return (el as Element).getElementsByTagName(sel);
  }
}

/**
 * querySelector by property
 * @param {element} el
 * @param {string} sel selector string
 * @param {object[]} props
 * @returns {element[]} elements
 * @memberof Core
 */
export function qsp(
  el: Element | Document,
  sel: string,
  props: Record<string, string>,
): Element | null {
  let q: HTMLCollection;
  let filtered: Element[];

  if (typeof el.querySelector != "undefined") {
    sel += "[";
    for (var prop in props) {
      sel += prop + "~='" + props[prop] + "'";
    }
    sel += "]";
    return el.querySelector(sel);
  } else {
    q = (el as Element).getElementsByTagName(sel);
    filtered = Array.prototype.slice.call(q, 0).filter(function (
      element: Element,
    ) {
      for (var prop in props) {
        if (element.getAttribute(prop) === props[prop]) {
          return true;
        }
      }
      return false;
    });

    if (filtered && filtered.length > 0) {
      return filtered[0];
    }
  }
  return null;
}

/**
 * Sprint through all text nodes in a document
 * @memberof Core
 * @param  {element} root element to start with
 * @param  {function} func function to run on each element
 */
export function sprint(root: Node, func: (node: Node) => void): void {
  var doc = root.ownerDocument || (root as any);
  if (typeof doc.createTreeWalker !== "undefined") {
    treeWalker(root, func, NodeFilter.SHOW_TEXT);
  } else {
    walk(root, function (node) {
      if (node && node.nodeType === 3) {
        // Node.TEXT_NODE
        func(node);
      }
      return false;
    });
  }
}

/**
 * Create a treeWalker
 * @memberof Core
 * @param  {element} root element to start with
 * @param  {function} func function to run on each element
 * @param  {function | object} filter function or object to filter with
 */
export function treeWalker(
  root: Node,
  func: (node: Node) => void,
  filter?: number | null,
): void {
  var tw = document.createTreeWalker(root, filter ?? NodeFilter.SHOW_ALL, null);
  let node: Node | null;
  while ((node = tw.nextNode())) {
    func(node);
  }
}

/**
 * @memberof Core
 * @param {node} node
 * @param {callback} return false for continue,true for break inside callback
 */
export function walk(node: Node, callback: (node: Node) => boolean): boolean {
  if (callback(node)) {
    return true;
  }
  node = node.firstChild!;
  if (node) {
    do {
      let walked = walk(node, callback);
      if (walked) {
        return true;
      }
      node = node.nextSibling!;
    } while (node);
  }
  return false;
}

/**
 * Convert a blob to a base64 encoded string
 * @param {Blog} blob
 * @returns {string}
 * @memberof Core
 */
export function blob2base64(blob: Blob): Promise<string | ArrayBuffer | null> {
  return new Promise(function (resolve) {
    var reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = function () {
      resolve(reader.result);
    };
  });
}

/**
 * Creates a new pending promise and provides methods to resolve or reject it.
 * From: https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Deferred#backwards_forwards_compatible
 * @memberof Core
 */
export class Deferred {
  resolve: ((value: any) => void) | null = null;
  reject: ((reason?: any) => void) | null = null;
  id: string;
  promise: Promise<any>;

  constructor() {
    /* A method to resolve the associated Promise with the value passed.
     * If the promise is already settled it does nothing.
     *
     * @param {anything} value : This value is used to resolve the promise
     * If the value is a Promise then the associated promise assumes the state
     * of Promise passed as value.
     */

    /* A method to reject the associated Promise with the value passed.
     * If the promise is already settled it does nothing.
     *
     * @param {anything} reason: The reason for the rejection of the Promise.
     * Generally its an Error object. If however a Promise is passed, then the Promise
     * itself will be the reason for rejection no matter the state of the Promise.
     */

    this.id = uuid();

    /* A newly created Pomise object.
     * Initially in pending state.
     */
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    Object.freeze(this);
  }
}

/**
 * Alias for Deferred class for backwards compatibility
 */
export function defer(): Deferred {
  return new Deferred();
}

/**
 * querySelector with filter by epub type
 * @param {element} html
 * @param {string} element element type to find
 * @param {string} type epub type to find
 * @returns {element[]} elements
 * @memberof Core
 */
export function querySelectorByType(
  html: Element | Document,
  element: string,
  type: string,
): Element | null {
  var query: Element | NodeListOf<Element> | null = null;
  if (typeof html.querySelector != "undefined") {
    query = html.querySelector(`${element}[*|type="${type}"]`);
  }
  // Handle IE not supporting namespaced epub:type in querySelector
  if (!query || (query instanceof NodeList && query.length === 0)) {
    var queryResults = qsa(html, element);
    for (var i = 0; i < queryResults.length; i++) {
      if (
        (queryResults[i] as Element).getAttributeNS(
          "http://www.idpf.org/2007/ops",
          "type",
        ) === type ||
        (queryResults[i] as Element).getAttribute("epub:type") === type
      ) {
        return queryResults[i] as Element;
      }
    }
  } else if (query instanceof Element) {
    return query;
  }
  return null;
}

/**
 * Find direct descendents of an element
 * @param {element} el
 * @returns {element[]} children
 * @memberof Core
 */
export function findChildren(el: Element): Element[] {
  var result: Element[] = [];
  var childNodes = el.childNodes;
  for (var i = 0; i < childNodes.length; i++) {
    let node = childNodes[i];
    if (node.nodeType === 1) {
      result.push(node as Element);
    }
  }
  return result;
}

/**
 * Find all parents (ancestors) of an element
 * @param {element} node
 * @returns {element[]} parents
 * @memberof Core
 */
export function parents(node: Node): Node[] {
  var nodes: Node[] = [node];
  for (; node; node = node.parentNode!) {
    nodes.unshift(node);
  }
  return nodes;
}

/**
 * Find all direct descendents of a specific type
 * @param {element} el
 * @param {string} nodeName
 * @param {boolean} [single]
 * @returns {element[]} children
 * @memberof Core
 */
export function filterChildren(
  el: Element,
  nodeName: string,
  single?: boolean,
): Element[] | Element | undefined {
  var result: Element[] = [];
  var childNodes = el.childNodes;
  for (var i = 0; i < childNodes.length; i++) {
    let node = childNodes[i];
    if (node.nodeType === 1 && node.nodeName.toLowerCase() === nodeName) {
      if (single) {
        return node as Element;
      } else {
        result.push(node as Element);
      }
    }
  }
  if (!single) {
    return result;
  }
}

/**
 * Filter all parents (ancestors) with tag name
 * @param {element} node
 * @param {string} tagname
 * @returns {element[]} parents
 * @memberof Core
 */
export function getParentByTagName(
  node: Node | null,
  tagname: string,
): Element | undefined {
  let parent: Node | null;
  if (node === null || tagname === "") return;
  parent = node.parentNode;
  while (parent && parent.nodeType === 1) {
    if ((parent as Element).tagName.toLowerCase() === tagname) {
      return parent as Element;
    }
    parent = parent.parentNode;
  }
}

/**
 * Lightweight Polyfill for DOM Range
 * @class
 * @memberof Core
 */
export class RangeObject {
  collapsed: boolean;
  commonAncestorContainer: Node | undefined;
  endContainer: Node | undefined;
  endOffset: number | undefined;
  startContainer: Node | undefined;
  startOffset: number | undefined;

  constructor() {
    this.collapsed = false;
    this.commonAncestorContainer = undefined;
    this.endContainer = undefined;
    this.endOffset = undefined;
    this.startContainer = undefined;
    this.startOffset = undefined;
  }

  setStart(startNode: Node, startOffset: number): void {
    this.startContainer = startNode;
    this.startOffset = startOffset;

    if (!this.endContainer) {
      this.collapse(true);
    } else {
      this.commonAncestorContainer = this._commonAncestorContainer();
    }

    this._checkCollapsed();
  }

  setEnd(endNode: Node, endOffset: number): void {
    this.endContainer = endNode;
    this.endOffset = endOffset;

    if (!this.startContainer) {
      this.collapse(false);
    } else {
      this.collapsed = false;
      this.commonAncestorContainer = this._commonAncestorContainer();
    }

    this._checkCollapsed();
  }

  collapse(toStart: boolean): void {
    this.collapsed = true;
    if (toStart) {
      this.endContainer = this.startContainer;
      this.endOffset = this.startOffset;
      this.commonAncestorContainer =
        this.startContainer!.parentNode || undefined;
    } else {
      this.startContainer = this.endContainer;
      this.startOffset = this.endOffset;
      this.commonAncestorContainer = (this.endOffset as any)?.parentNode;
    }
  }

  selectNode(referenceNode: Node): void {
    let parent = referenceNode.parentNode;
    let index = Array.prototype.indexOf.call(parent!.childNodes, referenceNode);
    this.setStart(parent!, index);
    this.setEnd(parent!, index + 1);
  }

  selectNodeContents(referenceNode: Node): void {
    let endIndex =
      referenceNode.nodeType === 3
        ? (referenceNode as Text).textContent!.length
        : referenceNode.childNodes.length;
    this.setStart(referenceNode, 0);
    this.setEnd(referenceNode, endIndex);
  }

  _commonAncestorContainer(
    startContainer?: Node,
    endContainer?: Node,
  ): Node | undefined {
    var startParents = parents(startContainer || this.startContainer!);
    var endParents = parents(endContainer || this.endContainer!);

    if (startParents[0] != endParents[0]) return undefined;

    for (var i = 0; i < startParents.length; i++) {
      if (startParents[i] != endParents[i]) {
        return startParents[i - 1];
      }
    }
  }

  _checkCollapsed(): void {
    if (
      this.startContainer === this.endContainer &&
      this.startOffset === this.endOffset
    ) {
      this.collapsed = true;
    } else {
      this.collapsed = false;
    }
  }

  toString(): string {
    // TODO: implement walking between start and end to find text
    return "";
  }
}
