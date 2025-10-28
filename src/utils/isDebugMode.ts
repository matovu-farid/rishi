/**
 * Check if debug mode is enabled
 * Debug mode is active when:
 * 1. Running in development (import.meta.env.DEV)
 * 2. VITE_EPUB_DEBUG environment variable is set
 * 3. localStorage has 'epub_debug' set to 'true'
 */
export function isDebugMode(): boolean {
  // Always enable in development
  if (import.meta.env.DEV) {
    return true;
  }

  // Check environment variable
  if (import.meta.env.VITE_EPUB_DEBUG === "true") {
    return true;
  }

  // Check localStorage (allows runtime toggle in production if needed)
  try {
    return localStorage.getItem("epub_debug") === "true";
  } catch {
    return false;
  }
}

/**
 * Enable debug mode at runtime (stored in localStorage)
 */
export function enableDebugMode(): void {
  try {
    localStorage.setItem("epub_debug", "true");
    console.log("[Debug] Debug mode enabled. Reload the page to activate.");
  } catch (e) {
    console.error("[Debug] Failed to enable debug mode:", e);
  }
}

/**
 * Disable debug mode at runtime (stored in localStorage)
 */
export function disableDebugMode(): void {
  try {
    localStorage.removeItem("epub_debug");
    console.log("[Debug] Debug mode disabled. Reload the page to deactivate.");
  } catch (e) {
    console.error("[Debug] Failed to disable debug mode:", e);
  }
}

