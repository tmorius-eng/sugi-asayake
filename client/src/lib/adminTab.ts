import { newRequestId } from "./requestId";

/**
 * A random id that lives exactly as long as this browser tab (2026-09-14).
 *
 * sessionStorage is per tab and is gone when the tab closes, which is the
 * property the admin face gate needs: the server binds a face proof to the
 * tab ids it was verified in (server/_core/faceProof.ts), so a tab opened
 * later -- or a copied cookie used elsewhere -- has to pass the camera
 * again. Sent as the `x-admin-tab` header on every API call (main.tsx).
 *
 * Guarded because sessionStorage can throw in a private window; the fallback
 * is a per-page-load id, which still locks on close.
 */
const KEY = "sugi-admin-tab";
let memory: string | null = null;

const freshId = () => newRequestId().replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);

/**
 * 2026-09-23: sessionStorage нь "таб хаагдахад алга" гэсэн баталгаа биш —
 * хөтөч табыг ХУУЛБАРЛАХАД (Duplicate) sessionStorage-ийг хуулдаг, Ctrl+Shift+T
 * / session restore нь сэргээдэг. Тэгэхээр хаасан /admin табыг дахин нээхэд
 * ижил id-тай буцаж ирээд камергүйгээр шууд нэвтэрч байв — 2026-09-14-ний
 * засвар хаах гэсэн яг тэр тохиолдол. Хоёр хамгаалалт:
 *  1. Баримт "back_forward"-оор ачаалагдсан бол (сэргээсэн/хуулбарласан таб)
 *     шинэ id — reload ("reload") нь id-гаа хадгална.
 *  2. BroadcastChannel: шинэ таб id-гаа зарлана; ижил id-тай АМЬД таб
 *     хариулбал энэ нь хуулбар тул шинэ id авна (хуучин таб хэвээр).
 */
function restoredOrDuplicated(): boolean {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type === "back_forward";
  } catch {
    return false;
  }
}

let channel: BroadcastChannel | null = null;
function watchForDuplicates(id: string) {
  if (channel || typeof BroadcastChannel === "undefined") return;
  try {
    channel = new BroadcastChannel("sugi-admin-tab");
    channel.onmessage = event => {
      const data = event.data as { type?: string; id?: string } | null;
      if (!data || data.id !== memory) return;
      if (data.type === "claim") channel?.postMessage({ type: "taken", id: memory });
      else if (data.type === "taken") {
        const fresh = freshId();
        memory = fresh;
        try { sessionStorage.setItem(KEY, fresh); } catch { /* memory-only */ }
        channel?.postMessage({ type: "claim", id: fresh });
      }
    };
    channel.postMessage({ type: "claim", id });
  } catch {
    channel = null;
  }
}

export function adminTabId(): string {
  if (memory) return memory;
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored && /^[A-Za-z0-9-]{8,64}$/.test(stored) && !restoredOrDuplicated()) {
      memory = stored;
    } else {
      memory = freshId();
      sessionStorage.setItem(KEY, memory);
    }
  } catch {
    memory = freshId();
  }
  watchForDuplicates(memory);
  return memory;
}
