import { lazy, type ComponentType } from "react";
import { CHUNK_RELOAD_FLAG, isChunkLoadError } from "@shared/chunk-error";

/**
 * Reloads the page once when a code-split chunk cannot be loaded because the
 * site was redeployed under this tab (see shared/chunk-error.ts). Returns
 * true if a reload was triggered, false if this tab has already used its one
 * reload -- the caller then surfaces the error normally.
 */
export function reloadOnceForStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return false;
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()));
  } catch {
    // Storage unavailable (private mode with storage blocked): reload anyway,
    // a loop is still bounded by the user closing the tab.
  }
  window.location.reload();
  return true;
}

/** Clears the one-reload guard once a page has actually rendered, so the
 *  next deploy (hours later) gets its own reload. Called from App. */
export function markChunksHealthy(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // ignore
  }
}

/**
 * Drop-in for React.lazy that turns "deployed while this tab was open" into
 * a silent reload instead of an error screen. Any other import failure (a
 * genuine network outage, a real bug) is rethrown unchanged.
 */
export function lazyRetry<P>(importer: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isChunkLoadError(error) && reloadOnceForStaleChunk()) {
        // The reload is in flight; keep React suspended rather than showing
        // an error frame for the few hundred milliseconds before it lands.
        return new Promise<{ default: ComponentType<P> }>(() => undefined);
      }
      throw error;
    }
  });
}
