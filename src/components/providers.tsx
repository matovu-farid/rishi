import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type JSX, PropsWithChildren, useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { atom, Provider, useAtomValue } from "jotai";
import { DevTools } from "jotai-devtools";
import "jotai-devtools/styles.css";
import { customStore } from "@/stores/jotai";
import { isDev } from "@/generated";
import { setupDeepLinking } from "@/modules/deep-linking";
import { observe } from "jotai-effect";

export const queryClient = new QueryClient();
const isDevAtom = atom(false);
observe((get, set) => {
  void isDev().then((isDev) => {
    set(isDevAtom, isDev);
  });
});

function Providers({ children }: PropsWithChildren): JSX.Element {
  const isDev = useAtomValue(isDevAtom);
  useEffect(() => {
    void setupDeepLinking();
  }, []);
  if (!isDev) {
    console.log("Production mode - DevTools disabled");
    return (
      <div>
        <QueryClientProvider client={queryClient}>
          <Provider store={customStore}>{children}</Provider>
        </QueryClientProvider>
        <ToastContainer />
      </div>
    );
  }
  return (
    <div>
      <QueryClientProvider client={queryClient}>
        <Provider store={customStore}>
          {isDev && <DevTools store={customStore} />}
          {children}
        </Provider>

        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
      <ToastContainer />
    </div>
  );
}
export default Providers;
