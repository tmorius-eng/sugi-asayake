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

export function adminTabId(): string {
  if (memory) return memory;
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored && /^[A-Za-z0-9-]{8,64}$/.test(stored)) return (memory = stored);
    const fresh = newRequestId().replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
    sessionStorage.setItem(KEY, fresh);
    return (memory = fresh);
  } catch {
    return (memory = newRequestId().replace(/[^A-Za-z0-9-]/g, "").slice(0, 64));
  }
}
