//! Manages the epub doc.
//!
//! Provides easy methods to navigate through the epub content, cover,
//! chapters, etc.
//!
//! Main references to EPUB specs:
//! - https://www.w3.org/TR/epub-33
//! - https://idpf.org/epub/201

use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::io::{Read, Seek};
use std::path::{Component, Path, PathBuf};
use xmlutils::XMLError;

use crate::epub::archive::EpubArchive;
use crate::epub::nav::{parse_nav_document, NavData};
use crate::epub::packaging::parse_packaging_extras;

use crate::epub::xmlutils;

#[derive(Debug, thiserror::Error)]
pub enum DocError {
    #[error("Archive Error: {0}")]
    ArchiveError(#[from] super::archive::ArchiveError),
    #[error("XML Error: {0}")]
    XmlError(#[from] super::xmlutils::XMLError),
    #[error("I/O Error: {0}")]
    IOError(#[from] std::io::Error),
    #[error("Invalid EPub")]
    InvalidEpub,
}

#[derive(Clone, Debug, PartialEq, PartialOrd)]
pub enum EpubVersion {
    Version2_0,
    Version3_0,
    Unknown(String),
}

/// Struct that represent a navigation point in a table of content
#[derive(Clone, Debug, Eq)]
pub struct NavPoint {
    /// the title of this navpoint
    pub label: String,
    /// the resource path
    pub content: PathBuf,
    /// nested navpoints
    pub children: Vec<NavPoint>,
    /// the order in the toc
    pub play_order: Option<usize>,
}

impl Ord for NavPoint {
    fn cmp(&self, other: &Self) -> Ordering {
        self.play_order.cmp(&other.play_order)
    }
}

impl PartialOrd for NavPoint {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for NavPoint {
    fn eq(&self, other: &Self) -> bool {
        self.play_order == other.play_order
    }
}

/// An EPUB3 metadata subexpression.
/// It is associated with another metadata expression.
/// The design follows EPUB3 but can be approximated when facing EPUB2 using attributes.
#[derive(Clone, Debug)]
pub struct MetadataRefinement {
    pub property: String,
    pub value: String,
    pub lang: Option<String>,
    pub scheme: Option<String>,
}

/// An EPUB3 Dublin Core metadata item.
/// The design follows EPUB3's dcterms element but can draw information both
/// dcterms and primary `<meta>` expressions.
///
/// When facing EPUB2, it also draws information from XHTML1.1 `<meta>`.
#[derive(Clone, Debug)]
pub struct MetadataItem {
    pub(crate) id: Option<String>,
    pub property: String,
    pub value: String,
    pub lang: Option<String>,
    pub refined: Vec<MetadataRefinement>,
}

impl MetadataItem {
    pub fn refinement(&self, property: &str) -> Option<&MetadataRefinement> {
        self.refined.iter().find(|r| r.property == property)
    }
}

#[derive(Clone, Debug)]
pub struct SpineItem {
    pub idref: String,
    pub id: Option<String>,
    pub properties: Option<String>,
    pub linear: bool,
}

#[derive(Clone, Debug)]
pub struct ResourceItem {
    pub path: PathBuf,
    pub mime: String,
    pub properties: Option<String>,
}

#[derive(Clone, Debug)]
pub struct GuideRef {
    pub r#type: Option<String>,
    pub title: Option<String>,
    pub href: Option<String>,
}

/// Struct to control the epub document
///
/// The general policy for `EpubDoc` is to support both EPUB2 (commonly used)
/// and EPUB3 (standard). Considering epub files that have mixed EPUB2 and
/// EPUB3 features, the implementation of `EpubDoc` isn't strict and rejects
/// something not in accordance with the specified version only when necessary.
#[derive(Clone, Debug)]
pub struct EpubDoc<R: Read + Seek> {
    /// the zip archive
    archive: EpubArchive<R>,

    /// The current chapter, is an spine index
    current: usize,

    /// epub spec version
    pub version: EpubVersion,

    /// epub spine ids
    pub spine: Vec<SpineItem>,

    /// resource id -> (path, mime)
    pub resources: HashMap<String, ResourceItem>,

    /// table of content, list of `NavPoint` in the toc.ncx
    pub toc: Vec<NavPoint>,

    /// title of toc
    pub toc_title: String,

    /// The epub metadata.
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let doc = doc.unwrap();
    /// let title = doc.metadata.iter().find(|d| d.property == "title");
    /// assert_eq!(title.unwrap().value, "Todo es mío");
    /// ```
    ///
    /// See `mdata(property)` for a convenient method returning the first matching item.
    pub metadata: Vec<MetadataItem>,

    /// root file base path
    pub root_base: PathBuf,

    /// root file full path
    pub root_file: PathBuf,

    /// Custom css list to inject in every xhtml file
    pub extra_css: Vec<String>,

    /// unique identifier
    pub unique_identifier: Option<String>,

    /// OPF spine page-progression-direction
    pub page_progression_direction: Option<String>,

    /// EPUB2 guide references
    pub guides: Vec<GuideRef>,

    /// Rendition properties (EPUB3)
    pub rendition_layout: Option<String>,
    pub rendition_flow: Option<String>,
    pub rendition_orientation: Option<String>,
    pub rendition_spread: Option<String>,

    /// EPUB3 bindings: media handlers
    pub bindings: Vec<crate::epub::packaging::Binding>,

    /// EPUB3 collections
    pub collections: Vec<crate::epub::packaging::Collection>,
}

impl EpubDoc<BufReader<File>> {
    /// Opens the epub file in `path`.
    ///
    /// Initialize some internal variables to be able to access to the epub
    /// spine definition and to navigate through the epub.
    ///
    /// # Examples
    ///
    /// ```
    /// use epub::doc::EpubDoc;
    ///
    /// let doc = EpubDoc::new("test.epub");
    /// assert!(doc.is_ok());
    /// ```
    ///
    /// # Errors
    ///
    /// Returns an error if the epub is broken or if the file doesn't
    /// exists.
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, DocError> {
        let path = path.as_ref();
        let file = File::open(path)?;
        let mut doc = Self::from_reader(BufReader::new(file))?;
        doc.archive.path = path.to_path_buf();
        Ok(doc)
    }
}

impl<R: Read + Seek> EpubDoc<R> {
    /// Opens the epub contained in `reader`.
    ///
    /// Initialize some internal variables to be able to access to the epub
    /// spine definition and to navigate through the epub.
    ///
    /// # Examples
    ///
    /// ```
    /// use epub::doc::EpubDoc;
    /// use std::fs::File;
    /// use std::io::{Cursor, Read};
    ///
    /// let mut file = File::open("test.epub").unwrap();
    /// let mut buffer = Vec::new();
    /// file.read_to_end(&mut buffer).unwrap();
    ///
    /// let cursor = Cursor::new(buffer);
    ///
    /// let doc = EpubDoc::from_reader(cursor);
    /// assert!(doc.is_ok());
    /// ```
    ///
    /// # Errors
    ///
    /// Returns an error if the epub is broken.
    pub fn from_reader(reader: R) -> Result<Self, DocError> {
        let mut archive = EpubArchive::from_reader(reader)?;

        let container = archive.get_container_file()?;
        let root_file = get_root_file(&container)?;
        let base_path = root_file.parent().expect("All files have a parent");
        let mut doc = Self {
            archive,
            version: EpubVersion::Version2_0,
            spine: vec![],
            toc: vec![],
            toc_title: String::new(),
            resources: HashMap::new(),
            metadata: Vec::new(),
            root_file: root_file.clone(),
            root_base: base_path.to_path_buf(),
            current: 0,
            extra_css: vec![],
            unique_identifier: None,
            page_progression_direction: None,
            guides: vec![],
            rendition_layout: None,
            rendition_flow: None,
            rendition_orientation: None,
            rendition_spread: None,
            bindings: vec![],
            collections: vec![],
        };
        doc.fill_resources()?;
        Ok(doc)
    }

    /// Returns the first metadata found with this property name.
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let doc = doc.unwrap();
    /// let language = doc.mdata("language");
    /// assert_eq!(language.unwrap().value, "es");
    pub fn mdata(&self, property: &str) -> Option<&MetadataItem> {
        self.metadata.iter().find(|data| data.property == property)
    }

    /// Returns the title.
    ///
    /// An EPUB file may provide multiple titles. This method only returns the
    /// primary one. Access `metadata` directly to gain more control.
    pub fn get_title(&self) -> Option<String> {
        self.mdata("title").map(|item| item.value.clone())
    }

    /// Returns the id of the epub cover.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use epub::doc::EpubDoc;
    ///
    /// let doc = EpubDoc::new("test.epub");
    /// assert!(doc.is_ok());
    /// let mut doc = doc.unwrap();
    ///
    /// let cover_id = doc.get_cover_id();
    /// ```
    ///
    /// This returns the cover id, which can be used to get the cover data.
    /// The id is not guaranteed to be valid.
    pub fn get_cover_id(&self) -> Option<String> {
        match self.version {
            // EPUB3 requires zero or one cover-image resource
            EpubVersion::Version3_0 => self.resources.iter().find_map(|(id, resource)| {
                resource
                    .properties
                    .as_ref()
                    .and_then(|ps| ps.split_ascii_whitespace().find(|p| *p == "cover-image"))
                    .map(|_| id.clone())
            }),
            // EPUB2 doesn't include cover identification, but a common practice is `<meta name="cover">`
            _ => self.mdata("cover").map(|item| item.value.clone()),
        }
    }

    /// Returns the id of the navigation document (EPUB3 only).
    ///
    /// **Relationship with `toc`**:
    /// "Navigation document" is a concept formalized in EPUB3, superseding NCX
    /// format used in EPUB2. NCX is required in EPUB2 and not EPUB3, though
    /// some authors provide both in the archive. `self.toc` (parsed from NCX)
    /// and this are independent on each other.
    pub fn get_nav_id(&self) -> Option<String> {
        match self.version {
            // EPUB3 requires exactly one nav resource
            EpubVersion::Version3_0 => self.resources.iter().find_map(|(id, resource)| {
                resource
                    .properties
                    .as_ref()
                    .and_then(|ps| ps.split_ascii_whitespace().find(|p| *p == "nav"))
                    .map(|_| id.clone())
            }),
            // The concept of navigation document doesn't exist in EPUB2.
            _ => None,
        }
    }

    /// Parses the EPUB3 navigation document (nav.xhtml) if available and returns
    /// table of contents, page list and landmarks. Returns None if no nav document exists.
    pub fn get_nav_data(&mut self) -> Option<NavData> {
        let nav_id = self.get_nav_id()?;
        let (bytes, _mime) = self.get_resource(&nav_id)?;
        parse_nav_document(bytes.as_slice()).ok()
    }

    /// Returns the cover's content and mime-type
    ///
    /// # Examples
    ///
    /// ```rust,ignore
    /// use std::fs;
    /// use std::io::Write;
    /// use epub::doc::EpubDoc;
    ///
    /// let doc = EpubDoc::new("test.epub");
    /// assert!(doc.is_ok());
    /// let mut doc = doc.unwrap();
    ///
    /// let cover_data = doc.get_cover().unwrap();
    ///
    /// let f = fs::File::create("/tmp/cover.png");
    /// assert!(f.is_ok());
    /// let mut f = f.unwrap();
    /// let resp = f.write_all(&cover_data);
    /// ```
    ///
    /// Returns [`None`] if the cover can't be found.
    pub fn get_cover(&mut self) -> Option<(Vec<u8>, String)> {
        let cover_id = self.get_cover_id();
        cover_id.and_then(|cid| self.get_resource(&cid))
    }

    /// Returns Release Identifier defined at
    /// https://www.w3.org/publishing/epub32/epub-packages.html#sec-metadata-elem-identifiers-pid
    pub fn get_release_identifier(&self) -> Option<String> {
        match (
            self.unique_identifier.as_ref(),
            self.mdata("dcterms:modified"),
        ) {
            (Some(unique_identifier), Some(modified)) => {
                Some(format!("{}@{}", unique_identifier, modified.value))
            }
            _ => None,
        }
    }

    /// Returns the resource content by full path in the epub archive
    ///
    /// Returns [`None`] if the path doesn't exist in the epub
    pub fn get_resource_by_path<P: AsRef<Path>>(&mut self, path: P) -> Option<Vec<u8>> {
        self.archive.get_entry(path).ok()
    }

    /// Returns the resource content and mime-type by the id defined in the spine
    ///
    /// Returns [`None`] if the id doesn't exists in the epub
    pub fn get_resource(&mut self, id: &str) -> Option<(Vec<u8>, String)> {
        let ResourceItem { path, mime, .. } = self.resources.get(id)?;
        let path = path.clone();
        let mime = mime.clone();
        let content = self.get_resource_by_path(&path)?;
        Some((content, mime))
    }

    /// Returns the resource content by full path in the epub archive, as String
    ///
    /// Returns [`None`] if the path doesn't exists in the epub
    pub fn get_resource_str_by_path<P: AsRef<Path>>(&mut self, path: P) -> Option<String> {
        self.archive.get_entry_as_str(path).ok()
    }

    /// Returns the resource content and mime-type by the id defined in the spine, as String
    ///
    /// Returns [`None`] if the id doesn't exists in the epub
    pub fn get_resource_str(&mut self, id: &str) -> Option<(String, String)> {
        let ResourceItem { path, mime, .. } = self.resources.get(id)?;
        let mime = mime.clone();
        let path = path.clone();
        let content = self.get_resource_str_by_path(path)?;
        Some((content, mime))
    }

    /// Returns the resource mime-type
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let doc = doc.unwrap();
    /// let mime = doc.get_resource_mime("portada.png");
    /// assert_eq!("image/png", mime.unwrap());
    /// ```
    ///
    /// Returns [`None`] the resource can't be found.
    pub fn get_resource_mime(&self, id: &str) -> Option<String> {
        self.resources.get(id).map(|r| r.mime.clone())
    }

    /// Returns the resource mime searching by source full path
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let doc = doc.unwrap();
    /// let mime = doc.get_resource_mime_by_path("OEBPS/Images/portada.png");
    /// assert_eq!("image/png", mime.unwrap());
    /// ```
    ///
    /// Returns [`None`] the resource can't be found.
    pub fn get_resource_mime_by_path<P: AsRef<Path>>(&self, path: P) -> Option<String> {
        let path = path.as_ref();

        self.resources.iter().find_map(|(_, r)| {
            if r.path == path {
                Some(r.mime.clone())
            } else {
                None
            }
        })
    }

    /// Returns the current chapter content and mime-type
    ///
    /// The current follows the epub spine order. You can modify the current
    /// calling to `go_next`, `go_prev` or `set_current` methods.
    ///
    /// Can return [`None`] if the epub is broken.
    pub fn get_current(&mut self) -> Option<(Vec<u8>, String)> {
        let current_id = self.get_current_id()?;
        self.get_resource(&current_id)
    }

    /// See [`Self::get_current`]
    pub fn get_current_str(&mut self) -> Option<(String, String)> {
        let current_id = self.get_current_id()?;
        self.get_resource_str(&current_id)
    }

    /// Returns the current chapter data, with resource uris renamed so they
    /// have the epub:// prefix and all are relative to the root file
    ///
    /// This method is useful to render the content with a html engine, because inside the epub
    /// local paths are relatives, so you can provide that content, because the engine will look
    /// for the relative path in the filesystem and that file isn't there. You should provide files
    /// with epub:// using [`Self::get_resource_by_path`]
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let mut doc = EpubDoc::new("test.epub").unwrap();
    /// let current = doc.get_current_with_epub_uris().unwrap();
    /// let text = String::from_utf8(current).unwrap();
    /// assert!(text.contains("epub://OEBPS/Images/portada.png"));

    /// doc.go_next();
    /// let current = doc.get_current_with_epub_uris().unwrap();
    /// let text = String::from_utf8(current).unwrap();
    /// assert!(text.contains("epub://OEBPS/Styles/stylesheet.css"));
    /// assert!(text.contains("http://creativecommons.org/licenses/by-sa/3.0/"));
    /// ```
    ///
    /// # Errors
    ///
    /// Returns [`DocError::InvalidEpub`] if the epub is broken.
    pub fn get_current_with_epub_uris(&mut self) -> Result<Vec<u8>, DocError> {
        let path = self.get_current_path().ok_or(DocError::InvalidEpub)?;
        let (current, _mime) = self.get_current().ok_or(DocError::InvalidEpub)?;

        let resp = xmlutils::replace_attrs(
            current.as_slice(),
            |element, attr, value| match (element, attr) {
                ("link", "href") | ("image", "href") | ("a", "href") | ("img", "src") => {
                    build_epub_uri(&path, value)
                }
                _ => String::from(value),
            },
            &self.extra_css,
        );

        resp.map_err(From::from)
    }

    /// Returns the current chapter mimetype
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let doc = doc.unwrap();
    /// let m = doc.get_current_mime();
    /// assert_eq!("application/xhtml+xml", m.unwrap());
    /// ```
    ///
    /// Can return [`None`] if the epub is broken.
    pub fn get_current_mime(&self) -> Option<String> {
        let current_id = self.get_current_id()?;
        self.get_resource_mime(&current_id)
    }

    /// Returns the current chapter full path
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # use std::path::Path;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let doc = doc.unwrap();
    /// let p = doc.get_current_path();
    /// assert_eq!(Path::new("OEBPS/Text/titlepage.xhtml"), p.unwrap());
    /// ```
    ///
    /// Can return [`None`] if the epub is broken.
    pub fn get_current_path(&self) -> Option<PathBuf> {
        let current_id = self.get_current_id()?;
        self.resources.get(&current_id).map(|r| r.path.clone())
    }

    /// Returns the current chapter id
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let doc = doc.unwrap();
    /// let id = doc.get_current_id();
    /// assert_eq!("titlepage.xhtml", id.unwrap());
    /// ```
    ///
    /// Can return [`None`] if the epub is broken.
    pub fn get_current_id(&self) -> Option<String> {
        self.spine.get(self.current).cloned().map(|i| i.idref)
    }

    /// Changes current to the next chapter
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let mut doc = doc.unwrap();
    /// doc.go_next();
    /// assert_eq!("000.xhtml", doc.get_current_id().unwrap());
    ///
    /// let len = doc.spine.len();
    /// for i in 1..len {
    ///     doc.go_next();
    /// }
    /// assert!(!doc.go_next());
    /// ```
    ///
    /// Returns [`false`] if the current chapter is the last one
    pub fn go_next(&mut self) -> bool {
        if self.current + 1 >= self.spine.len() {
            false
        } else {
            self.current += 1;
            true
        }
    }

    /// Changes current to the prev chapter
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let mut doc = doc.unwrap();
    /// assert!(!doc.go_prev());
    ///
    /// doc.go_next(); // 000.xhtml
    /// doc.go_next(); // 001.xhtml
    /// doc.go_next(); // 002.xhtml
    /// doc.go_prev(); // 001.xhtml
    /// assert_eq!("001.xhtml", doc.get_current_id().unwrap());
    /// ```
    ///
    /// Returns [`false`] if the current chapter is the first one
    pub fn go_prev(&mut self) -> bool {
        if self.current < 1 {
            false
        } else {
            self.current -= 1;
            true
        }
    }

    /// Returns the number of chapters
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let mut doc = doc.unwrap();
    /// assert_eq!(17, doc.get_num_chapters());
    /// ```
    pub fn get_num_chapters(&self) -> usize {
        self.spine.len()
    }

    #[deprecated(note = "please use `get_num_chapters` instead")]
    pub fn get_num_pages(&self) -> usize {
        self.get_num_chapters()
    }

    /// Returns the current chapter number, starting from 0
    pub fn get_current_chapter(&self) -> usize {
        self.current
    }

    #[deprecated(note = "please use `get_current_chapter` instead")]
    pub fn get_current_page(&self) -> usize {
        self.get_current_chapter()
    }

    /// Changes the current chapter
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let mut doc = doc.unwrap();
    /// assert_eq!(0, doc.get_current_chapter());
    /// doc.set_current_chapter(2);
    /// assert_eq!("001.xhtml", doc.get_current_id().unwrap());
    /// assert_eq!(2, doc.get_current_chapter());
    /// assert!(!doc.set_current_chapter(50));
    /// ```
    ///
    /// Returns [`false`] if the chapter is out of bounds
    pub fn set_current_chapter(&mut self, n: usize) -> bool {
        if n >= self.spine.len() {
            false
        } else {
            self.current = n;
            true
        }
    }

    #[deprecated(note = "please use `set_current_chapter` instead")]
    pub fn set_current_page(&mut self, n: usize) -> bool {
        self.set_current_chapter(n)
    }

    /// This will inject arbitrary css into every queried html page
    /// [`Self::get_current_with_epub_uris`]
    ///
    /// # Examples
    ///
    /// ```
    /// # use epub::doc::EpubDoc;
    /// # let doc = EpubDoc::new("test.epub");
    /// # let mut doc = doc.unwrap();
    /// # let _ = doc.set_current_chapter(2);
    /// let extracss = "body { background-color: black; color: white }";
    /// doc.add_extra_css(extracss);
    /// let current = doc.get_current_with_epub_uris().unwrap();
    /// let text = String::from_utf8(current).unwrap();
    /// assert!(text.contains(extracss));
    /// ```
    pub fn add_extra_css(&mut self, css: &str) {
        self.extra_css.push(String::from(css));
    }

    /// Function to convert a resource path to a chapter number in the spine
    /// If the resource isn't in the spine list, None will be returned
    ///
    /// This method is useful to convert a toc [`NavPoint`] content to a chapter number
    /// to be able to navigate easily
    pub fn resource_uri_to_chapter(&self, uri: &PathBuf) -> Option<usize> {
        for (k, ResourceItem { path, .. }) in &self.resources {
            if path == uri {
                return self.resource_id_to_chapter(k);
            }
        }

        None
    }

    /// Function to convert a resource id to a chapter number in the spine
    /// If the resourse isn't in the spine list, None will be returned
    pub fn resource_id_to_chapter(&self, uri: &str) -> Option<usize> {
        self.spine.iter().position(|item| item.idref == uri)
    }

    /// Resolve a content href (may include a fragment) to a chapter index in the spine
    pub fn href_to_spine_index(&self, href: &str) -> Option<usize> {
        let path_str = href.split('#').next().unwrap_or(href);
        let abs_path = self.convert_path_seps(path_str);
        let maybe_id = self.resources.iter().find_map(|(rid, res)| {
            if res.path == abs_path {
                Some(rid.clone())
            } else {
                None
            }
        });
        maybe_id.and_then(|id| self.resource_id_to_chapter(&id))
    }

    fn fill_resources(&mut self) -> Result<(), DocError> {
        let container = self.archive.get_entry(&self.root_file)?;
        let root = xmlutils::XMLReader::parse(container.as_slice())?;
        self.version = match root.borrow().get_attr("version") {
            Some(v) if v == "2.0" => EpubVersion::Version2_0,
            Some(v) if v == "3.0" => EpubVersion::Version3_0,
            Some(v) => EpubVersion::Unknown(String::from(v)),
            _ => EpubVersion::Unknown(String::from("Unknown")),
        };
        let unique_identifier_id = &root.borrow().get_attr("unique-identifier");

        // resources from manifest
        // This should be run before everything else, because other functions relies on
        // self.resources and should be filled before calling `fill_toc`
        let manifest = root
            .borrow()
            .find("manifest")
            .ok_or(DocError::InvalidEpub)?;
        for r in &manifest.borrow().children {
            let item = r.borrow();
            let _ = self.insert_resource(&item);
        }

        // items from spine
        let spine = root.borrow().find("spine").ok_or(DocError::InvalidEpub)?;
        for r in &spine.borrow().children {
            let item = r.borrow();
            let _ = self.insert_spine(&item);
        }

        // toc.ncx
        if let Some(toc) = spine.borrow().get_attr("toc") {
            let _ = self.fill_toc(&toc);
        }

        // metadata
        let metadata_elem = root
            .borrow()
            .find("metadata")
            .ok_or(DocError::InvalidEpub)?;
        self.fill_metadata(&metadata_elem.borrow());

        // packaging extras
        let extras = parse_packaging_extras(&root.borrow());
        self.page_progression_direction = extras.page_progression_direction;
        self.rendition_layout = extras.rendition_layout;
        self.rendition_flow = extras.rendition_flow;
        self.rendition_orientation = extras.rendition_orientation;
        self.rendition_spread = extras.rendition_spread;
        self.bindings = extras.bindings;
        self.collections = extras.collections;

        // EPUB2 guide
        if let Some(guide_ref) = root.borrow().find("guide") {
            let guide = guide_ref.borrow();
            for r in &guide.children {
                let item = r.borrow();
                if item.name.local_name != "reference" {
                    continue;
                }
                self.guides.push(GuideRef {
                    r#type: item.get_attr("type"),
                    title: item.get_attr("title"),
                    href: item.get_attr("href"),
                });
            }
        }

        let identifier = if let Some(uid) = unique_identifier_id {
            // find identifier with id
            self.metadata
                .iter()
                .find(|d| d.property == "identifier" && d.id.as_ref().is_some_and(|id| id == uid))
        } else {
            // fallback with the first identifier.
            self.metadata.iter().find(|d| d.property == "identifier")
        };
        self.unique_identifier = identifier.map(|data| data.value.clone());

        Ok(())
    }

    fn fill_metadata(&mut self, elem: &xmlutils::XMLNode) {
        // refinements are inserted here with ID as key, these are later associated to metadata
        let mut refinements: HashMap<String, Vec<MetadataRefinement>> = HashMap::new();
        for r in &elem.children {
            let item = r.borrow();
            // for each acceptable element, either push a metadata item or push a refinement
            match (item.name.namespace_ref(), &item.name.local_name) {
                // dcterms
                (Some("http://purl.org/dc/elements/1.1/"), name) => {
                    let id = item.get_attr("id");
                    let lang = item.get_attr("lang");
                    let property = name.clone();
                    let value = item.text.clone().unwrap_or_default();

                    let refined: Vec<MetadataRefinement> =
                        if let EpubVersion::Version3_0 = self.version {
                            vec![]
                        } else {
                            // treat it as EPUB2 dcterms, storing additional info in attributes
                            item.attrs
                                .iter()
                                .filter_map(|attr| {
                                    if let Some("http://www.idpf.org/2007/opf") =
                                        attr.name.namespace_ref()
                                    {
                                        let property = attr.name.local_name.clone();
                                        let value = attr.value.clone();
                                        Some(MetadataRefinement {
                                            property,
                                            value,
                                            lang: None,
                                            scheme: None,
                                        })
                                    } else {
                                        None
                                    }
                                })
                                .collect()
                        };
                    self.metadata.push(MetadataItem {
                        id,
                        property,
                        value,
                        lang,
                        refined,
                    });
                }

                // <meta>
                (Some("http://www.idpf.org/2007/opf"), name)
                    if name.eq_ignore_ascii_case("meta") =>
                {
                    if let Some(property) = item.get_attr("property") {
                        // EPUB3 <meta>, value in its text content
                        let value = item.text.clone().unwrap_or_default();
                        let lang = item.get_attr("lang");
                        if let Some(refines) = item.get_attr("refines") {
                            // refinement (subexpression in EPUB3 terminology)
                            let tid = refines.strip_prefix('#').unwrap_or_else(|| &refines);
                            let scheme = item.get_attr("scheme");
                            let refinement = MetadataRefinement {
                                property,
                                value,
                                lang,
                                scheme,
                            };
                            if let Some(refs) = refinements.get_mut(tid) {
                                refs.push(refinement);
                            } else {
                                refinements.insert(tid.to_string(), vec![refinement]);
                            }
                        } else {
                            // primary
                            let id = item.get_attr("id");
                            self.metadata.push(MetadataItem {
                                id,
                                property,
                                value,
                                lang,
                                refined: vec![],
                            });
                        }
                    } else if let (Some(property), Some(value)) =
                        (item.get_attr("name"), item.get_attr("content"))
                    {
                        // Legacy XHTML1.1 <meta>
                        self.metadata.push(MetadataItem {
                            id: None,
                            property,
                            value,
                            lang: None,
                            refined: vec![],
                        });
                    }
                }

                _ => (),
            }
        }

        // associate refinements
        self.metadata.iter_mut().for_each(|item| {
            if let Some(id) = &item.id {
                if let Some(mut refs) = refinements.remove(id) {
                    item.refined.append(&mut refs);
                }
            }
        });
    }

    // Forcibly converts separators in a filepath to unix separators to
    // to ensure that ZipArchive's by_name method will retrieve the proper
    // file. Failing to convert to unix-style on Windows causes the
    // ZipArchive not to find the file.
    fn convert_path_seps<P: AsRef<Path>>(&self, href: P) -> PathBuf {
        let mut path = self.root_base.join(href);
        if cfg!(windows) {
            path = PathBuf::from(path.to_string_lossy().replace('\\', "/"));
        }
        path
    }

    fn insert_resource(&mut self, item: &xmlutils::XMLNode) -> Result<(), XMLError> {
        let id = item
            .get_attr("id")
            .ok_or_else(|| XMLError::AttrNotFound("id".into()))?;
        let href = item
            .get_attr("href")
            .ok_or_else(|| XMLError::AttrNotFound("href".into()))?;
        let mime = item
            .get_attr("media-type")
            .ok_or_else(|| XMLError::AttrNotFound("media-type".into()))?;
        let properties = item.get_attr("properties");

        self.resources.insert(
            id,
            ResourceItem {
                path: self.convert_path_seps(href),
                mime,
                properties,
            },
        );
        Ok(())
    }

    fn insert_spine(&mut self, item: &xmlutils::XMLNode) -> Result<(), DocError> {
        let idref = item
            .get_attr("idref")
            .ok_or_else(|| XMLError::AttrNotFound("idref".into()))?;
        let linear = item.get_attr("linear").unwrap_or("yes".into()) == "yes";
        let properties = item.get_attr("properties");
        let id = item.get_attr("id");
        self.spine.push(SpineItem {
            idref,
            id,
            linear,
            properties,
        });
        Ok(())
    }

    fn fill_toc(&mut self, id: &str) -> Result<(), DocError> {
        let toc_res = self.resources.get(id).ok_or(DocError::InvalidEpub)?; // this should be turned into it's own error type, but

        let container = self.archive.get_entry(&toc_res.path)?;
        let root = xmlutils::XMLReader::parse(container.as_slice())?;

        self.toc_title = root
            .borrow()
            .find("docTitle")
            .and_then(|dt| {
                dt.borrow()
                    .children
                    .get(0)
                    .and_then(|t| t.borrow().text.clone())
            })
            .unwrap_or_default();

        let mapnode = root
            .borrow()
            .find("navMap")
            .ok_or_else(|| XMLError::AttrNotFound("navMap".into()))?;

        self.toc.append(&mut self.get_navpoints(&mapnode.borrow()));
        self.toc.sort();

        Ok(())
    }

    /// Recursively extract all navpoints from a node.
    fn get_navpoints(&self, parent: &xmlutils::XMLNode) -> Vec<NavPoint> {
        let mut navpoints = Vec::new();

        // TODO: parse metadata (dtb:totalPageCount, dtb:depth, dtb:maxPageNumber)

        for nav in &parent.children {
            let item = nav.borrow();
            if item.name.local_name != "navPoint" {
                continue;
            }
            let play_order = item
                .get_attr("playOrder")
                .and_then(|n| n.parse::<usize>().ok());
            let content = item
                .find("content")
                .and_then(|c| c.borrow().get_attr("src").map(|p| self.root_base.join(p)));

            let label = item.find("navLabel").and_then(|l| {
                l.borrow()
                    .children
                    .get(0)
                    .and_then(|t| t.borrow().text.clone())
            });

            if let (order, Some(content_path), Some(label_text)) = (play_order, content, label) {
                let navpoint = NavPoint {
                    label: label_text.clone(),
                    content: content_path.clone(),
                    children: self.get_navpoints(&item),
                    play_order: order,
                };
                navpoints.push(navpoint);
            }
        }

        navpoints.sort();
        navpoints
    }
}

fn get_root_file(container: &[u8]) -> Result<PathBuf, DocError> {
    let root = xmlutils::XMLReader::parse(container)?;
    let el = root.borrow();
    let element = el
        .find("rootfile")
        .ok_or_else(|| XMLError::AttrNotFound("rootfile".into()))?;
    let el2 = element.borrow();

    let attr = el2
        .get_attr("full-path")
        .ok_or_else(|| XMLError::AttrNotFound("full-path".into()))?;

    Ok(PathBuf::from(attr))
}

fn build_epub_uri<P: AsRef<Path>>(path: P, append: &str) -> String {
    // allowing external links
    if append.starts_with("http") {
        return String::from(append);
    }

    let path = path.as_ref();
    let mut cpath = path.to_path_buf();

    // current file base dir
    cpath.pop();
    for p in Path::new(append).components() {
        match p {
            Component::ParentDir => {
                cpath.pop();
            }
            Component::Normal(s) => {
                cpath.push(s);
            }
            _ => {}
        };
    }

    // If on Windows, replace all Windows path separators with Unix path separators
    let path = if cfg!(windows) {
        cpath.to_string_lossy().replace('\\', "/")
    } else {
        cpath.to_string_lossy().to_string()
    };

    format!("epub://{}", path)
}
