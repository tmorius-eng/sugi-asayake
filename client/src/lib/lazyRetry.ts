import { lazy, type ComponentType } from "react";
import { CHUNK_RELOAD_FLAG, isChunkLoadError } from "@shared/chunk-error";

/**
 * 2026-09-23: хамгаалалт ХУГАЦААГААР. Өмнө нь "нэг удаа" тугийг App-ийн
 * анхны commit (`markChunksHealthy`) арилгадаг байсан — харин Suspense App
 * дотор тул тэр commit route-ийн chunk ачаалагдахаас ӨМНӨ болдог. Chunk
 * байнга унадаг үед (сүлжээ, байхгүй файл) туг reload бүрийн дараа арилж,
 * хуудас мөнхөд reload хийдэг байв. Одоо сүүлийн reload-оос хойш 60 с
 * дотор дахин reload хийхгүй; хэдэн цагийн дараах дараагийн deploy өөрийн
 * reload-оо авна.
 */
const RELOAD_WINDOW_MS = 60_000;

/**
 * Reloads the page once when a code-split chunk cannot be loaded because the
 * site was redeployed under this tab (see shared/chunk-error.ts). Returns
 * true if a reload was triggered, false if this tab already reloaded for
 * this reason within the last minute -- the caller then surfaces the error.
 */
export function reloadOnceForStaleChunk(): boolean {
  try {
    const previous = Number(sessionStorage.getItem(CHUNK_RELOAD_FLAG) ?? 0);
    if (previous && Date.now() - previous < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()));
  } catch {
    // Storage unavailable (private mode with storage blocked): no way to
    // remember a reload, so do not risk a loop -- show the error instead.
    return false;
  }
  window.location.reload();
  return true;
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
