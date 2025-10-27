import { qs, qsa, qsp, indexOfElementNode } from "./utils/core";

/**
 * Metadata object structure
 */
interface Metadata {
  title?: string;
  creator?: string;
  description?: string;
  pubdate?: string;
  publisher?: string;
  identifier?: string;
  language?: string;
  rights?: string;
  modified_date?: string;
  layout?: string;
  orientation?: string;
  flow?: string;
  viewport?: string;
  media_active_class?: string;
  spread?: string;
  direction?: string;
}

/**
 * Manifest item structure
 */
interface ManifestItem {
  href: string;
  type: string;
  overlay: string;
  properties: string[];
}

/**
 * Manifest object structure (key-value pairs)
 */
interface Manifest {
  [id: string]: ManifestItem;
}

/**
 * Spine item reference structure
 */
interface SpineItem {
  id?: string;
  idref: string;
  linear: string;
  properties: string[];
  index: number;
}

/**
 * Spine array structure
 */
type Spine = SpineItem[];

/**
 * TOC item structure for JSON-based manifests
 */
interface TocItem {
  title?: string;
  label?: string;
  href?: string;
  children?: TocItem[];
  [key: string]: any;
}

/**
 * JSON Manifest resource item
 */
interface JsonResource {
  href: string;
  rel?: string[];
  [key: string]: any;
}

/**
 * JSON Manifest structure (W3C Web Publication Manifest)
 */
interface JsonManifest {
  metadata: Metadata;
  readingOrder?: SpineItem[];
  spine?: SpineItem[];
  resources: JsonResource[];
  toc?: TocItem[];
}

/**
 * Package parse result structure
 */
interface ParseResult {
  metadata: Metadata | undefined;
  spine: Spine | undefined;
  manifest: Manifest | undefined;
  navPath: string | boolean | null | undefined;
  ncxPath: string | boolean | null | undefined;
  coverPath: string | boolean | null | undefined;
  spineNodeIndex: number | undefined;
  toc?: TocItem[];
}

/**
 * Open Packaging Format Parser
 * @class
 * @param {document} packageDocument OPF XML
 */
class Packaging {
  manifest: Manifest | undefined;
  navPath: string | boolean | null | undefined;
  ncxPath: string | boolean | null | undefined;
  coverPath: string | boolean | null | undefined;
  spineNodeIndex: number | undefined;
  spine: Spine | undefined;
  metadata: Metadata | undefined;
  uniqueIdentifier?: string;
  toc?: TocItem[];

  constructor(packageDocument?: Document) {
    this.manifest = {};
    this.navPath = "";
    this.ncxPath = "";
    this.coverPath = "";
    this.spineNodeIndex = 0;
    this.spine = [];
    this.metadata = {};

    if (packageDocument) {
      this.parse(packageDocument);
    }
  }

  /**
   * Parse OPF XML
   * @param  {document} packageDocument OPF XML
   * @return {ParsedPackage} parsed package parts
   */
  parse(packageDocument: Document): ParseResult {
    var metadataNode: Element | null;
    var manifestNode: Element | null;
    var spineNode: Element | null;

    if (!packageDocument) {
      throw new Error("Package File Not Found");
    }

    metadataNode = qs(packageDocument, "metadata");
    if (!metadataNode) {
      throw new Error("No Metadata Found");
    }

    manifestNode = qs(packageDocument, "manifest");
    if (!manifestNode) {
      throw new Error("No Manifest Found");
    }

    spineNode = qs(packageDocument, "spine");
    if (!spineNode) {
      throw new Error("No Spine Found");
    }

    this.manifest = this.parseManifest(manifestNode);
    this.navPath = this.findNavPath(manifestNode);
    this.ncxPath = this.findNcxPath(manifestNode, spineNode);
    this.coverPath = this.findCoverPath(packageDocument);

    this.spineNodeIndex = indexOfElementNode(spineNode);

    this.spine = this.parseSpine(spineNode, this.manifest);

    this.uniqueIdentifier = this.findUniqueIdentifier(packageDocument);
    this.metadata = this.parseMetadata(metadataNode);

    this.metadata.direction =
      spineNode.getAttribute("page-progression-direction") || undefined;

    return {
      metadata: this.metadata,
      spine: this.spine,
      manifest: this.manifest,
      navPath: this.navPath,
      ncxPath: this.ncxPath,
      coverPath: this.coverPath,
      spineNodeIndex: this.spineNodeIndex,
    };
  }

  /**
   * Parse Metadata
   * @private
   * @param  {node} xml
   * @return {object} metadata
   */
  parseMetadata(xml: Element): Metadata {
    var metadata: Metadata = {};

    metadata.title = this.getElementText(xml, "title");
    metadata.creator = this.getElementText(xml, "creator");
    metadata.description = this.getElementText(xml, "description");

    metadata.pubdate = this.getElementText(xml, "date");

    metadata.publisher = this.getElementText(xml, "publisher");

    metadata.identifier = this.getElementText(xml, "identifier");
    metadata.language = this.getElementText(xml, "language");
    metadata.rights = this.getElementText(xml, "rights");

    metadata.modified_date = this.getPropertyText(xml, "dcterms:modified");

    metadata.layout = this.getPropertyText(xml, "rendition:layout");
    metadata.orientation = this.getPropertyText(xml, "rendition:orientation");
    metadata.flow = this.getPropertyText(xml, "rendition:flow");
    metadata.viewport = this.getPropertyText(xml, "rendition:viewport");
    metadata.media_active_class = this.getPropertyText(
      xml,
      "media:active-class",
    );
    metadata.spread = this.getPropertyText(xml, "rendition:spread");

    return metadata;
  }

  /**
   * Parse Manifest
   * @private
   * @param  {node} manifestXml
   * @return {object} manifest
   */
  parseManifest(manifestXml: Element): Manifest {
    var manifest: Manifest = {};

    var selected = qsa(manifestXml, "item");
    var items = Array.prototype.slice.call(selected) as Element[];

    items.forEach(function (item: Element): void {
      var id = item.getAttribute("id");
      var href = item.getAttribute("href") || "";
      var type = item.getAttribute("media-type") || "";
      var overlay = item.getAttribute("media-overlay") || "";
      var properties = item.getAttribute("properties") || "";

      if (id) {
        manifest[id] = {
          href: href,
          type: type,
          overlay: overlay,
          properties: properties.length ? properties.split(" ") : [],
        };
      }
    });

    return manifest;
  }

  /**
   * Parse Spine
   * @private
   * @param  {node} spineXml
   * @param  {Packaging.manifest} manifest
   * @return {object} spine
   */
  parseSpine(spineXml: Element, _manifest: Manifest): Spine {
    var spine: Spine = [];

    var selected = qsa(spineXml, "itemref");
    var items = Array.prototype.slice.call(selected) as Element[];

    items.forEach(function (item: Element, index: number): void {
      var idref = item.getAttribute("idref");
      var props = item.getAttribute("properties") || "";
      var propArray = props.length ? props.split(" ") : [];

      var itemref: SpineItem = {
        id: item.getAttribute("id") || undefined,
        idref: idref || "",
        linear: item.getAttribute("linear") || "yes",
        properties: propArray,
        index: index,
      };
      spine.push(itemref);
    });

    return spine;
  }

  /**
   * Find Unique Identifier
   * @private
   * @param  {node} packageXml
   * @return {string} Unique Identifier text
   */
  findUniqueIdentifier(packageXml: Document): string {
    var uniqueIdentifierId =
      packageXml.documentElement?.getAttribute("unique-identifier");
    if (!uniqueIdentifierId) {
      return "";
    }
    var identifier = packageXml.getElementById(uniqueIdentifierId);
    if (!identifier) {
      return "";
    }

    if (
      identifier.localName === "identifier" &&
      identifier.namespaceURI === "http://purl.org/dc/elements/1.1/"
    ) {
      return identifier.childNodes.length > 0
        ? (identifier.childNodes[0].nodeValue || "").trim()
        : "";
    }

    return "";
  }

  /**
   * Find TOC NAV
   * @private
   * @param {element} manifestNode
   * @return {string|boolean}
   */
  findNavPath(manifestNode: Element): string | boolean | null {
    var node = qsp(manifestNode, "item", { properties: "nav" });
    return node ? node.getAttribute("href") : false;
  }

  /**
   * Find TOC NCX
   * media-type="application/x-dtbncx+xml" href="toc.ncx"
   * @private
   * @param {element} manifestNode
   * @param {element} spineNode
   * @return {string|boolean}
   */
  findNcxPath(
    manifestNode: Element,
    spineNode: Element,
  ): string | boolean | null {
    var node = qsp(manifestNode, "item", {
      "media-type": "application/x-dtbncx+xml",
    });
    var tocId: string | null;

    if (!node) {
      tocId = spineNode.getAttribute("toc");
      if (tocId) {
        node = manifestNode.querySelector(`#${tocId}`);
      }
    }

    return node ? node.getAttribute("href") : false;
  }

  /**
   * Find the Cover Path
   * <item properties="cover-image" id="ci" href="cover.svg" media-type="image/svg+xml" />
   * Fallback for Epub 2.0
   * @private
   * @param  {node} packageXml
   * @return {string|boolean} href
   */
  findCoverPath(packageXml: Document): string | boolean | null {
    var pkg = qs(packageXml, "package");
    if (!pkg) {
      return false;
    }

    var node = qsp(packageXml, "item", { properties: "cover-image" });
    if (node) return node.getAttribute("href");

    var metaCover = qsp(packageXml, "meta", { name: "cover" });

    if (metaCover) {
      var coverId = metaCover.getAttribute("content");
      if (coverId) {
        var cover = packageXml.getElementById(coverId);
        return cover ? cover.getAttribute("href") : "";
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  /**
   * Get text of a namespaced element
   * @private
   * @param  {node} xml
   * @param  {string} tag
   * @return {string} text
   */
  getElementText(xml: Element, tag: string): string {
    var found = xml.getElementsByTagNameNS(
      "http://purl.org/dc/elements/1.1/",
      tag,
    );

    if (!found || found.length === 0) return "";

    var el = found[0];

    if (el.childNodes.length) {
      return el.childNodes[0].nodeValue || "";
    }

    return "";
  }

  /**
   * Get text by property
   * @private
   * @param  {node} xml
   * @param  {string} property
   * @return {string} text
   */
  getPropertyText(xml: Element, property: string): string {
    var el = qsp(xml, "meta", { property: property });

    if (el && el.childNodes.length) {
      return el.childNodes[0].nodeValue || "";
    }

    return "";
  }

  /**
   * Load JSON Manifest
   * @param  {object} json JSON manifest object
   * @return {object} parsed package parts
   */
  load(json: JsonManifest): ParseResult {
    this.metadata = json.metadata;

    let spine = json.readingOrder || json.spine || [];
    this.spine = spine.map((item: SpineItem, index: number): SpineItem => {
      item.index = index;
      item.linear = item.linear || "yes";
      return item;
    });

    if (json.resources) {
      json.resources.forEach((item: JsonResource, index: number): void => {
        if (this.manifest) {
          this.manifest[String(index)] = {
            href: item.href,
            type: item.type || "",
            overlay: item.overlay || "",
            properties: item.properties || [],
          };
        }

        if (item.rel && item.rel[0] === "cover") {
          this.coverPath = item.href;
        }
      });
    }

    this.spineNodeIndex = 0;

    this.toc = json.toc?.map((item: TocItem, _index: number): TocItem => {
      item.label = item.title;
      return item;
    });

    return {
      metadata: this.metadata,
      spine: this.spine,
      manifest: this.manifest,
      navPath: this.navPath,
      ncxPath: this.ncxPath,
      coverPath: this.coverPath,
      spineNodeIndex: this.spineNodeIndex,
      toc: this.toc,
    };
  }

  destroy(): void {
    this.manifest = undefined;
    this.navPath = undefined;
    this.ncxPath = undefined;
    this.coverPath = undefined;
    this.spineNodeIndex = undefined;
    this.spine = undefined;
    this.metadata = undefined;
    this.toc = undefined;
  }
}

export default Packaging;
