import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isDebugMode } from "@/utils/isDebugMode";

export interface ErrorEvent {
  timestamp: string;
  stage: string;
  book_id?: number;
  message: string;
  context?: Record<string, any>;
  severity: "debug" | "info" | "warning" | "error" | "critical";
}

class ErrorTracker {
  private errors: ErrorEvent[] = [];
  private listeners: Set<(error: ErrorEvent) => void> = new Set();
  private unlisten: UnlistenFn | null = null;
  private maxErrors = 1000; // Limit to prevent memory issues
  private isDebugEnabled = false;

  async init() {
    // Check if debug mode is enabled
    this.isDebugEnabled = isDebugMode();

    if (!this.isDebugEnabled) {
      console.log(
        "[ErrorTracker] Debug mode disabled - error tracking will not be active"
      );
      return;
    }

    // Listen to Tauri error events
    this.unlisten = await listen<ErrorEvent>("epub-error", (event) => {
      this.addError(event.payload);
    });
    console.log(
      "[ErrorTracker] Initialized and listening for epub-error events"
    );
  }

  addError(error: ErrorEvent) {
    // Skip if debug mode is not enabled
    if (!this.isDebugEnabled) {
      return;
    }

    this.errors.push(error);

    // Limit number of errors stored
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    this.notifyListeners(error);

    // Log to console based on severity
    if (error.severity === "error" || error.severity === "critical") {
      console.error("[ErrorTracker]", error);
    } else if (error.severity === "warning") {
      console.warn("[ErrorTracker]", error);
    } else if (error.severity === "debug") {
      console.debug("[ErrorTracker]", error);
    } else {
      console.log("[ErrorTracker]", error);
    }
  }

  isEnabled(): boolean {
    return this.isDebugEnabled;
  }

  subscribe(listener: (error: ErrorEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(error: ErrorEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(error);
      } catch (e) {
        console.error("[ErrorTracker] Error in listener:", e);
      }
    });
  }

  getErrors(): ErrorEvent[] {
    return [...this.errors];
  }

  getErrorsByStage(stage: string): ErrorEvent[] {
    return this.errors.filter((e) => e.stage === stage);
  }

  getErrorsByBookId(bookId: number): ErrorEvent[] {
    return this.errors.filter((e) => e.book_id === bookId);
  }

  getErrorChain(bookId: number): ErrorEvent[] {
    return this.errors
      .filter((e) => e.book_id === bookId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  getErrorsBySeverity(severity: ErrorEvent["severity"]): ErrorEvent[] {
    return this.errors.filter((e) => e.severity === severity);
  }

  clearErrors() {
    this.errors = [];
    console.log("[ErrorTracker] Errors cleared");
  }

  exportToFile(): string {
    const data = JSON.stringify(this.errors, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `epub-errors-${new Date().toISOString()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    return data;
  }

  destroy() {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    this.listeners.clear();
    console.log("[ErrorTracker] Destroyed");
  }
}

// Create singleton instance
export const errorTracker = new ErrorTracker();
