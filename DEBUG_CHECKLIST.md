# EPUB Reader Debug Checklist

## How to Use This Checklist

When the Rust EPUB reader isn't displaying content correctly, follow this systematic checklist to pinpoint the exact issue.

## ✅ Phase 1: Backend - Book Loading

### Expected Output:

```
[DEBUG:BOOK_OPEN] Opening file: /path/to/book.epub
[DEBUG:BOOK_OPEN] Successfully opened book_id: 1, spine_length: 111, resources: 219, title: Some("Book Title")
```

### ✓ Check:

- [ ] File path is correct
- [ ] Book ID is assigned (positive number)
- [ ] Spine length > 0 (should have chapters)
- [ ] Resources count > 0 (should have HTML/CSS files)
- [ ] Title is present

### ❌ Common Issues:

- **File not found**: Check path encoding, special characters
- **Spine length = 0**: EPUB may be corrupted
- **Resources = 0**: EPUB structure is invalid

---

## ✅ Phase 2: Layout Computation

### Expected Output:

```
[DEBUG:LAYOUT] book_id: 1, viewport: 1024x768, flow: Paginated, spine length: 111
[DEBUG:LAYOUT] Computed 111 pages, pages_per_spine: [1, 1, 1, ..., 1]
```

### ✓ Check:

- [ ] Total pages ≈ spine length (with new CSS-based approach)
- [ ] pages_per_spine array length = spine length
- [ ] All values in pages_per_spine are 1 (new approach)
- [ ] Viewport dimensions are reasonable (> 0)

### ❌ Common Issues:

- **Total pages = 0**: No valid HTML content in spine items
- **Viewport 0x0**: Layout options not passed correctly
- **Pages_per_spine has 0s**: Some spine items have no content

---

## ✅ Phase 3: Render Plan Request

### Expected Output:

```
[DEBUG:RENDER_PLAN] book_id: 1, requesting page 0-1
[DEBUG:RENDER_PLAN] total_pages: 111, plan.pages.len(): 111, from: 0, to: 1
```

### ✓ Check:

- [ ] Book ID matches opened book
- [ ] Requested page is within range (< total_pages)
- [ ] plan.pages.len() = total_pages
- [ ] from < to
- [ ] to <= total_pages

### ❌ Common Issues:

- **Layout not computed**: Backend hasn't computed layout yet
- **Page out of range**: Frontend requesting invalid page number

---

## ✅ Phase 4: Page Content Retrieval

### Expected Output:

```
[DEBUG:PAGE_CONTENT] page_index: 0, spine_index: 0, idref: titlepage, href: Some("titlepage.xhtml"), char_range: 0-246
[DEBUG:SPINE_VALIDATION] Expected idref from spine[0]: titlepage, actual idref from page: titlepage
[DEBUG:PAGE_CONTENT] Content preview: <?xml version='1.0' encoding='utf-8'?>...
```

### ✓ Check:

- [ ] page_index is correct
- [ ] spine_index is valid (< spine length)
- [ ] idref is present and matches spine item
- [ ] href is valid path
- [ ] Content preview shows actual HTML/XML

### ❌ Common Issues:

- **No content found**: idref doesn't match any resource
- **Content preview empty**: HTML file is empty or missing
- **Spine validation mismatch**: Internal error - page refs are wrong

---

## ✅ Phase 5: HTML Retrieval & Processing

### Expected Output:

```
[DEBUG:HTML_RETRIEVAL] book_id: 1, path: titlepage.xhtml
[DEBUG:HTML_RETRIEVAL] HTML size: 799 bytes
[DEBUG:HTML_RETRIEVAL] Base path for CSS resolution:
[DEBUG:HTML_RETRIEVAL] Found 0 CSS link tags to process
[DEBUG:HTML_RETRIEVAL] Injected base tag: asset://localhost/titlepage.xhtml
[DEBUG:HTML_RETRIEVAL] Returning HTML with 849 bytes
[DEBUG:HTML_STRUCTURE] has_html: true, has_head: true, has_body: true, has_base: true
[DEBUG:HTML_FINAL] First 500 chars:
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <base href="asset://localhost/titlepage.xhtml">
    ...
```

### ✓ Check:

- [ ] HTML size > 0
- [ ] Base path is determined (even if empty for root)
- [ ] CSS links found (or 0 if page has no styles)
- [ ] Base tag injected successfully
- [ ] Returned HTML is larger (due to base tag + inlined CSS)
- [ ] **has_html: true**
- [ ] **has_head: true**
- [ ] **has_body: true**
- [ ] **has_base: true**
- [ ] HTML preview looks valid

### ❌ Common Issues:

- **HTML size = 0**: File not found or empty
- **Missing <html> tag**: XML file, not HTML (WARNING)
- **Missing <body> tag**: Malformed HTML (WARNING)
- **No base tag injected**: Head tag not found in HTML
- **Returned HTML same size as input**: CSS inlining or base tag failed

### 🔧 CSS Inlining Issues:

```
[DEBUG:CSS_INLINE] Processing CSS: styles/main.css
[DEBUG:CSS_INLINE] Resolved CSS path: styles/main.css
[DEBUG:CSS_INLINE] Successfully inlined CSS: styles/main.css (1234 bytes)
```

OR

```
[DEBUG:CSS_INLINE] CSS not found at path: styles/main.css
```

- [ ] CSS files are being found and inlined
- [ ] If "CSS not found", check resource paths in EPUB

---

## ✅ Phase 6: Frontend Reception

### Expected Console Output:

```
[EPUB_READER:HTML_RETRIEVED] { bookId: 1, htmlLength: 849, href: "titlepage.xhtml" }
[EPUB_READER:CONTENT_VERIFICATION] {
  page: 0,
  signature: "<html xmlns=...",
  htmlLength: 849,
  structure: {
    hasHtmlTag: true,
    hasBodyTag: true,
    hasHeadTag: true,
    hasBaseTag: true,
    hasContent: true
  }
}
[RustEpubView] HTML content updated: { length: 849, preview: "...", hasHtml: true, hasBody: true }
```

### ✓ Check:

- [ ] HTML received in frontend
- [ ] HTML length matches backend
- [ ] Signature is valid HTML
- [ ] All structure checks pass
- [ ] RustEpubView logs content update

### ❌ Common Issues:

- **No logs in browser console**: Frontend not receiving HTML
- **HTML length = 0**: Empty response from backend
- **hasHtmlTag: false**: Structural issue (WARNING logged)

---

## ✅ Phase 7: Rendering

### Expected Console Output:

```
[RustEpubView] Rendered dimensions: {
  scrollWidth: 1024,
  clientWidth: 1024,
  scrollHeight: 2048,
  clientHeight: 768,
  hasOverflow: true,
  childCount: 5
}
```

### ✓ Check:

- [ ] scrollWidth > 0
- [ ] scrollHeight > 0
- [ ] childCount > 0 (content elements present)
- [ ] For paginated: hasOverflow should be true (content spans multiple columns)
- [ ] Container found in DOM

### ❌ Common Issues:

- **"Content container not found in DOM"**: React rendering failed
- **scrollWidth = 0**: Content not rendering
- **childCount = 0**: HTML not being inserted
- **No overflow**: Content too small or CSS columns not applied

---

## 🔍 Quick Diagnostic Commands

### In Browser Console:

```javascript
// Check if content is in DOM
document.querySelector("#epub-content-container");

// Check actual rendered HTML
document.querySelector("#epub-content-container")?.innerHTML.substring(0, 500);

// Check computed styles
const el = document.querySelector("#epub-content-container");
getComputedStyle(el).columnWidth;

// Check Debug Panel
localStorage.setItem("epub_debug", "true");
// Press Ctrl+Shift+D
```

### In Terminal (Backend):

```bash
# Check logs file
tail -f ~/.rishi/logs/epub-reader.log

# Run with extra debugging
EPUB_DEBUG=1 bunx tauri dev
```

---

## 🎯 Most Common Issues & Solutions

### 1. "Book opens but nothing displays"

**Check**: Phase 5 - HTML structure validation
**Look for**: Missing <html> or <body> tags
**Solution**: EPUB may have XML files instead of HTML

### 2. "CSS not loading"

**Check**: Phase 5 - CSS inlining logs
**Look for**: "CSS not found" messages
**Solution**: Verify CSS paths in EPUB resources

### 3. "Content appears but is blank"

**Check**: Phase 7 - Rendered dimensions
**Look for**: childCount = 0
**Solution**: CSS may be hiding content, check theme styles

### 4. "Only one line visible"

**Check**: Phase 7 - scrollHeight vs clientHeight
**Look for**: hasOverflow = false
**Solution**: CSS column layout not applied (check isPaginated)

### 5. "Navigation doesn't work"

**Check**: Phase 2 - Layout pages match spine items
**Look for**: pages_per_spine all = 1
**Solution**: This is correct with new CSS-based approach
