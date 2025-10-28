import { useState, useEffect } from "react";
import { errorTracker, type ErrorEvent } from "@/services/errorTracking";
import { isDebugMode } from "@/utils/isDebugMode";

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [errors, setErrors] = useState<ErrorEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"errors" | "pipeline">("errors");
  const [filterSeverity, setFilterSeverity] = useState<
    ErrorEvent["severity"] | "all"
  >("all");
  const [filterStage, setFilterStage] = useState<string>("all");

  // Don't render if debug mode is disabled
  if (!isDebugMode()) {
    return null;
  }

  useEffect(() => {
    // Subscribe to error updates
    const unsubscribe = errorTracker.subscribe((error) => {
      setErrors((prev) => [...prev, error]);
    });

    // Load existing errors
    setErrors(errorTracker.getErrors());

    // Keyboard shortcut: Ctrl+Shift+D
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const filteredErrors = errors.filter((error) => {
    if (filterSeverity !== "all" && error.severity !== filterSeverity) {
      return false;
    }
    if (filterStage !== "all" && error.stage !== filterStage) {
      return false;
    }
    return true;
  });

  const stages = Array.from(new Set(errors.map((e) => e.stage)));

  const handleClear = () => {
    errorTracker.clearErrors();
    setErrors([]);
  };

  const handleExport = () => {
    errorTracker.exportToFile();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-700 text-sm font-mono"
      >
        Debug (Ctrl+Shift+D)
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-end p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-3/4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">EPUB Reader Debug Panel</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("errors")}
            className={`px-4 py-2 font-medium ${
              activeTab === "errors"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-600"
            }`}
          >
            Errors ({errors.length})
          </button>
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`px-4 py-2 font-medium ${
              activeTab === "pipeline"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-600"
            }`}
          >
            Pipeline
          </button>
        </div>

        {/* Filters */}
        {activeTab === "errors" && (
          <div className="flex gap-4 p-4 border-b bg-gray-50">
            <div>
              <label
                htmlFor="severity-filter"
                className="text-sm font-medium mr-2"
              >
                Severity:
              </label>
              <select
                id="severity-filter"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value as any)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="stage-filter"
                className="text-sm font-medium mr-2"
              >
                Stage:
              </label>
              <select
                id="stage-filter"
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                {stages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1"></div>
            <button
              onClick={handleClear}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Clear
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Export
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === "errors" && (
            <div className="space-y-2">
              {filteredErrors.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No errors to display
                </div>
              )}
              {filteredErrors.map((error, index) => (
                <div
                  key={index}
                  className={`border-l-4 p-3 rounded ${
                    error.severity === "critical"
                      ? "border-red-600 bg-red-50"
                      : error.severity === "error"
                        ? "border-red-400 bg-red-50"
                        : error.severity === "warning"
                          ? "border-yellow-400 bg-yellow-50"
                          : error.severity === "info"
                            ? "border-blue-400 bg-blue-50"
                            : "border-gray-400 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-gray-500">
                          {new Date(error.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="font-semibold text-sm">
                          {error.stage}
                        </span>
                        {error.book_id && (
                          <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                            Book #{error.book_id}
                          </span>
                        )}
                        <span
                          className={`text-xs uppercase px-2 py-0.5 rounded ${
                            error.severity === "critical"
                              ? "bg-red-600 text-white"
                              : error.severity === "error"
                                ? "bg-red-500 text-white"
                                : error.severity === "warning"
                                  ? "bg-yellow-500 text-white"
                                  : error.severity === "info"
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-500 text-white"
                          }`}
                        >
                          {error.severity}
                        </span>
                      </div>
                      <div className="text-sm mb-2">{error.message}</div>
                      {error.context && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                            Context
                          </summary>
                          <pre className="mt-2 p-2 bg-white rounded border overflow-x-auto">
                            {JSON.stringify(error.context, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "pipeline" && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 mb-4">
                Pipeline visualization showing the flow of EPUB loading and
                rendering
              </div>
              {stages.map((stage) => {
                const stageErrors = errors.filter((e) => e.stage === stage);
                const hasErrors = stageErrors.some(
                  (e) => e.severity === "error" || e.severity === "critical"
                );
                const isActive = stageErrors.length > 0;

                return (
                  <div
                    key={stage}
                    className={`p-4 rounded border-2 ${
                      hasErrors
                        ? "border-red-500 bg-red-50"
                        : isActive
                          ? "border-green-500 bg-green-50"
                          : "border-gray-300 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono font-semibold">{stage}</div>
                      <div className="text-sm text-gray-600">
                        {stageErrors.length} events
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
