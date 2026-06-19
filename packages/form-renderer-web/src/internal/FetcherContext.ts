import { createContext, useContext } from "react";

/** Injectable `fetch` for the renderer's remote calls (dataSource options + async value
 *  checks). The host passes `FormRenderer.fetcher` to add auth headers / a custom base; it
 *  flows to option controls through this context so they don't have to prop-drill. `undefined`
 *  means "no override" — consumers fall back to the global `fetch`, keeping runtime unchanged. */
export const FetcherContext = createContext<typeof fetch | undefined>(undefined);

/** The injected fetcher, or the global `fetch` when the host didn't provide one. */
export function useFetcher(): typeof fetch {
  return useContext(FetcherContext) ?? fetch;
}
