import { NTFY_DEFAULT_SERVER_URL } from "../../shared/integrations";

/**
 * Publishes one push notification to an ntfy server (2026-09-11) --
 * https://docs.ntfy.sh/publish/. The shop uses the public ntfy.sh with long
 * random topic names; `serverUrl` + `accessToken` exist so moving to ntfy Pro
 * (reserved topics) or a self-hosted server later is a settings change only.
 *
 * Same contract as deliverEmail in ./notification.ts: NEVER throws, returns a
 * result the caller can record. Differences, both deliberate:
 *   - JSON publishing (POST to the server root with `topic` in the body)
 *     rather than the header form, because Cyrillic in an HTTP header
 *     (X-Title) is not reliably preserved; the JSON body is plain UTF-8.
 *   - A hard 5s timeout. Nothing else in this codebase sets one on outbound
 *     fetch, but this runs from the notification dispatcher and must never
 *     hang it on an unreachable server.
 */

export type NtfyConfig = { serverUrl?: string; accessToken?: string };

export type NtfyMessage = {
  topic: string;
  title: string;
  message: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  tags?: readonly string[];
  /** Absolute URL opened when the notification is tapped. */
  click?: string;
};

export type NtfyResult = { ok: boolean; status: number | null; error: string | null; retryAfterMs: number | null };

// ntfy turns a message over 4,096 bytes into an attachment; stay well under.
const MAX_MESSAGE_BYTES = 3800;
const TIMEOUT_MS = 5000;

export function truncateUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let result = "";
  let used = 0;
  const ellipsisBytes = encoder.encode("…").length;
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (used + size + ellipsisBytes > maxBytes) break;
    result += char;
    used += size;
  }
  return `${result}…`;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

export async function publishNtfy(config: NtfyConfig, message: NtfyMessage): Promise<NtfyResult> {
  const serverUrl = (config.serverUrl?.trim() || NTFY_DEFAULT_SERVER_URL).replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.accessToken?.trim()) headers.Authorization = `Bearer ${config.accessToken.trim()}`;

  const body: Record<string, unknown> = {
    topic: message.topic,
    title: truncateUtf8(message.title, 250),
    message: truncateUtf8(message.message, MAX_MESSAGE_BYTES),
    priority: message.priority ?? 3,
  };
  if (message.tags?.length) body.tags = [...message.tags];
  if (message.click) body.click = message.click;

  try {
    const response = await fetch(serverUrl, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) return { ok: true, status: response.status, error: null, retryAfterMs: null };
    const text = await response.text().catch(() => "");
    return { ok: false, status: response.status, error: `ntfy ${response.status}: ${text.slice(0, 200)}`.trim(), retryAfterMs: retryAfterMs(response) };
  } catch (error) {
    const reason = error instanceof Error ? (error.name === "TimeoutError" ? `timed out after ${TIMEOUT_MS}ms` : error.message) : String(error);
    return { ok: false, status: null, error: `ntfy request failed: ${reason}`, retryAfterMs: null };
  }
}
