import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { errorTracker } from "@/services/errorTracking";
import { DebugPanel } from "./DebugPanel";

export const queryClient = new QueryClient();

function Providers({ children }: PropsWithChildren): JSX.Element {
  useEffect(() => {
    // Initialize error tracker
    errorTracker.init().catch((err) => {
      console.error("[Providers] Failed to initialize error tracker:", err);
    });

    return () => {
      errorTracker.destroy();
    };
  }, []);

  return (
    <div>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
      <ToastContainer />
      <DebugPanel />
    </div>
  );
}
export default Providers;
