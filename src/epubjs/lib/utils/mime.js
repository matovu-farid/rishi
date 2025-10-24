'use strict'

Object.defineProperty(exports, '__esModule', {
  value: true
})
exports.default = void 0

/**
 * @typedef {string|string[]} MimeTypeValue - Either a single file extension or array of extensions
 */

/**
 * @typedef {Object.<string, MimeTypeValue>} MimeTypeCategory - Category of MIME types with extensions as values
 */

/**
 * @typedef {Object.<string, MimeTypeCategory>} MimeTypeTable - Complete MIME type lookup table
 */

/**
 * @typedef {Object.<string, string>} MimeTypesMap - Map of file extensions to MIME types
 */

/**
 * MIME type lookup table mapping file extensions to their corresponding MIME types
 * From Zip.js, by Gildas Lormeau, edited down
 * @type {MimeTypeTable}
 */
var table = {
  application: {
    ecmascript: ['es', 'ecma'],
    javascript: 'js',
    ogg: 'ogx',
    pdf: 'pdf',
    postscript: ['ps', 'ai', 'eps', 'epsi', 'epsf', 'eps2', 'eps3'],
    'rdf+xml': 'rdf',
    smil: ['smi', 'smil'],
    'xhtml+xml': ['xhtml', 'xht'],
    xml: ['xml', 'xsl', 'xsd', 'opf', 'ncx'],
    zip: 'zip',
    'x-httpd-eruby': 'rhtml',
    'x-latex': 'latex',
    'x-maker': ['frm', 'maker', 'frame', 'fm', 'fb', 'book', 'fbdoc'],
    'x-object': 'o',
    'x-shockwave-flash': ['swf', 'swfl'],
    'x-silverlight': 'scr',
    'epub+zip': 'epub',
    'font-tdpfr': 'pfr',
    'inkml+xml': ['ink', 'inkml'],
    json: 'json',
    'jsonml+json': 'jsonml',
    'mathml+xml': 'mathml',
    'metalink+xml': 'metalink',
    mp4: 'mp4s',
    // "oebps-package+xml" : "opf",
    'omdoc+xml': 'omdoc',
    oxps: 'oxps',
    'vnd.amazon.ebook': 'azw',
    widget: 'wgt',
    // "x-dtbncx+xml" : "ncx",
    'x-dtbook+xml': 'dtb',
    'x-dtbresource+xml': 'res',
    'x-font-bdf': 'bdf',
    'x-font-ghostscript': 'gsf',
    'x-font-linux-psf': 'psf',
    'x-font-otf': 'otf',
    'x-font-pcf': 'pcf',
    'x-font-snf': 'snf',
    'x-font-ttf': ['ttf', 'ttc'],
    'x-font-type1': ['pfa', 'pfb', 'pfm', 'afm'],
    'x-font-woff': 'woff',
    'x-mobipocket-ebook': ['prc', 'mobi'],
    'x-mspublisher': 'pub',
    'x-nzb': 'nzb',
    'x-tgif': 'obj',
    'xaml+xml': 'xaml',
    'xml-dtd': 'dtd',
    'xproc+xml': 'xpl',
    'xslt+xml': 'xslt',
    'internet-property-stream': 'acx',
    'x-compress': 'z',
    'x-compressed': 'tgz',
    'x-gzip': 'gz'
  },
  audio: {
    flac: 'flac',
    midi: ['mid', 'midi', 'kar', 'rmi'],
    mpeg: ['mpga', 'mpega', 'mp2', 'mp3', 'm4a', 'mp2a', 'm2a', 'm3a'],
    mpegurl: 'm3u',
    ogg: ['oga', 'ogg', 'spx'],
    'x-aiff': ['aif', 'aiff', 'aifc'],
    'x-ms-wma': 'wma',
    'x-wav': 'wav',
    adpcm: 'adp',
    mp4: 'mp4a',
    webm: 'weba',
    'x-aac': 'aac',
    'x-caf': 'caf',
    'x-matroska': 'mka',
    'x-pn-realaudio-plugin': 'rmp',
    xm: 'xm',
    mid: ['mid', 'rmi']
  },
  image: {
    gif: 'gif',
    ief: 'ief',
    jpeg: ['jpeg', 'jpg', 'jpe'],
    pcx: 'pcx',
    png: 'png',
    'svg+xml': ['svg', 'svgz'],
    tiff: ['tiff', 'tif'],
    'x-icon': 'ico',
    bmp: 'bmp',
    webp: 'webp',
    'x-pict': ['pic', 'pct'],
    'x-tga': 'tga',
    'cis-cod': 'cod'
  },
  text: {
    'cache-manifest': ['manifest', 'appcache'],
    css: 'css',
    csv: 'csv',
    html: ['html', 'htm', 'shtml', 'stm'],
    mathml: 'mml',
    plain: ['txt', 'text', 'brf', 'conf', 'def', 'list', 'log', 'in', 'bas'],
    richtext: 'rtx',
    'tab-separated-values': 'tsv',
    'x-bibtex': 'bib'
  },
  video: {
    mpeg: ['mpeg', 'mpg', 'mpe', 'm1v', 'm2v', 'mp2', 'mpa', 'mpv2'],
    mp4: ['mp4', 'mp4v', 'mpg4'],
    quicktime: ['qt', 'mov'],
    ogg: 'ogv',
    'vnd.mpegurl': ['mxu', 'm4u'],
    'x-flv': 'flv',
    'x-la-asf': ['lsf', 'lsx'],
    'x-mng': 'mng',
    'x-ms-asf': ['asf', 'asx', 'asr'],
    'x-ms-wm': 'wm',
    'x-ms-wmv': 'wmv',
    'x-ms-wmx': 'wmx',
    'x-ms-wvx': 'wvx',
    'x-msvideo': 'avi',
    'x-sgi-movie': 'movie',
    'x-matroska': ['mpv', 'mkv', 'mk3d', 'mks'],
    '3gpp2': '3g2',
    h261: 'h261',
    h263: 'h263',
    h264: 'h264',
    jpeg: 'jpgv',
    jpm: ['jpm', 'jpgm'],
    mj2: ['mj2', 'mjp2'],
    'vnd.ms-playready.media.pyv': 'pyv',
    'vnd.uvvu.mp4': ['uvu', 'uvvu'],
    'vnd.vivo': 'viv',
    webm: 'webm',
    'x-f4v': 'f4v',
    'x-m4v': 'm4v',
    'x-ms-vob': 'vob',
    'x-smv': 'smv'
  }
}

/**
 * Creates a reverse lookup map from file extensions to MIME types
 * @returns {MimeTypesMap} Object mapping file extensions to MIME type strings
 */
var mimeTypes = (function () {
  /** @type {string} */
  var type
  /** @type {string} */
  var subtype
  /** @type {MimeTypeValue} */
  var val
  /** @type {number} */
  var index
  /** @type {MimeTypesMap} */
  var mimeTypes = {}

  for (type in table) {
    if (Object.prototype.hasOwnProperty.call(table, type)) {
      for (subtype in table[type]) {
        if (Object.prototype.hasOwnProperty.call(table[type], subtype)) {
          val = table[type][subtype]

          if (typeof val == 'string') {
            mimeTypes[val] = type + '/' + subtype
          } else {
            for (index = 0; index < val.length; index++) {
              mimeTypes[val[index]] = type + '/' + subtype
            }
          }
        }
      }
    }
  }

  return mimeTypes
})()

/** @type {string} */
var defaultValue = 'text/plain' //"application/octet-stream";

/**
 * Looks up the MIME type for a given filename based on its file extension
 * @param {string} [filename] - The filename to look up (can be undefined/null)
 * @returns {string} The MIME type string or default value if not found
 * @example
 * lookup('document.pdf') // returns 'application/pdf'
 * lookup('image.jpg') // returns 'image/jpeg'
 * lookup('unknown.xyz') // returns 'text/plain'
 */
function lookup(filename) {
  if (!filename) return defaultValue
  const extension = filename.split('.').pop()
  if (!extension) return defaultValue
  return mimeTypes[extension.toLowerCase()] || defaultValue
}

/**
 * @typedef {Object} MimeModule
 * @property {function(string): string} lookup - Function to lookup MIME type by filename
 */

/** @type {MimeModule} */
var _default = {
  lookup
}
exports.default = _default
