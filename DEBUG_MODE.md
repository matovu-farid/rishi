# Debug Mode Documentation

## Overview

The EPUB Reader includes comprehensive debugging infrastructure that is **automatically disabled in production builds** to ensure no debug code ships to end users.

## How Debug Mode Works

### Automatic Behavior

- **Development builds** (`bunx tauri dev`): Debug mode is **always enabled**
- **Production builds** (`bunx tauri build`): Debug mode is **always disabled**

### Manual Override (Advanced)

In rare cases where you need debug mode in a production build:

#### Frontend

1. Set environment variable: `VITE_EPUB_DEBUG=true` during build
2. Or enable at runtime in browser console:
   ```javascript
   localStorage.setItem("epub_debug", "true");
   // Reload the page
   ```

#### Backend

Set environment variable before launching the app:

```bash
EPUB_DEBUG=1 ./rishi
```

## Debug Features

When debug mode is enabled, you get:

### 1. Debug Panel (Frontend)

- Press `Ctrl+Shift+D` to toggle
- Real-time error stream
- Pipeline visualization
- Filtering by severity and stage
- Export logs as JSON

### 2. Detailed Logging (Backend)

All critical pipeline stages log to stderr:

- `[DEBUG:BOOK_OPEN]` - File opening, spine/resource counts
- `[DEBUG:LAYOUT]` - Layout computation, viewport dimensions
- `[DEBUG:RENDER_PLAN]` - Page requests, content previews
- `[DEBUG:HTML_RETRIEVAL]` - HTML fetching, CSS inlining
- `[DEBUG:PAGE_CONTENT]` - Actual content being rendered

### 3. File Logging

- All errors written to `~/.rishi/logs/epub-reader.log`
- Persistent across sessions
- Only created when debug mode is active

### 4. Structured Frontend Logging

All reader operations emit structured logs:

```
[EPUB_READER:BOOK_OPENING] { timestamp, path, ... }
[EPUB_READER:LAYOUT_COMPLETE] { totalPages, pagesPerSpine, ... }
[EPUB_READER:CONTENT_VERIFICATION] { signature, htmlLength, ... }
```

## Implementation Details

### Backend (Rust)

- Uses `#[cfg(debug_assertions)]` for conditional compilation
- Debug logs are completely stripped from release builds
- Zero performance impact in production
- Environment variable check: `std::env::var("EPUB_DEBUG")`

### Frontend (TypeScript)

- Checks `import.meta.env.DEV` for development mode
- Checks `VITE_EPUB_DEBUG` environment variable
- Checks `localStorage.getItem('epub_debug')`
- Early returns prevent any debug code execution

## Testing

### Verify Debug Mode is Disabled

Build a production version:

```bash
bunx tauri build
```

Launch the built app and verify:

1. No debug panel appears
2. No `[DEBUG:*]` or `[EPUB_READER:*]` console logs
3. No `~/.rishi/logs/epub-reader.log` file is created
4. Press `Ctrl+Shift+D` - nothing happens

### Verify Debug Mode Works in Dev

```bash
bunx tauri dev
```

Verify:

1. Debug button appears in bottom-right corner
2. `Ctrl+Shift+D` toggles debug panel
3. Console shows structured logs
4. Log file is created at `~/.rishi/logs/epub-reader.log`

## Security Considerations

- Debug mode never ships to production builds automatically
- Manual override requires explicit environment variables
- Log files stored in user directory (not exposed to other processes)
- No sensitive data logged (only structure and metadata)

## Troubleshooting

### "Debug panel not appearing in dev mode"

1. Check browser console for initialization errors
2. Verify `import.meta.env.DEV` is true
3. Try manually: `localStorage.setItem('epub_debug', 'true')` and reload

### "Logs not appearing in terminal"

1. Verify you're running `bunx tauri dev` (not a production build)
2. Check that stderr is not being redirected
3. Look for `[DEBUG:*]` prefixed messages

### "Want debug mode in production build"

This is intentionally difficult. If absolutely necessary:

```bash
# Build with debug flag
VITE_EPUB_DEBUG=true bunx tauri build

# Then run with backend debug
EPUB_DEBUG=1 ./path/to/built/app
```

**Warning**: Don't distribute builds with debug mode enabled.

