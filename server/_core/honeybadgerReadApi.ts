import { ENV } from "./env";

// Project "SUGI Desk", System Logs (2026-09-07): reads Honeybadger's error
// feed back INTO the admin panel -- distinct from server/_core/honeybadger.ts,
// which only ever SENDS errors out. Two separate Honeybadger APIs, two
// separate credentials (see env.ts's honeybadgerPersonalAuthToken comment):
// this file authenticates with the account-level Personal Auth Token via
// HTTP Basic Auth, per https://docs.honeybadger.io/api/getting-started/.
//
// Same "safe no-op without real config" discipline as the rest of this
// codebase's optional integrations -- every export here degrades to
// `{ configured: false }` rather than throwing when the token is unset, so
// nothing calling this needs its own separate "is this wired up?" check.
const BASE_URL = "https://app.honeybadger.io/v2";

export type HoneybadgerFault = {
  id: number;
  klass: string;
  message: string | null;
  environment: string | null;
  component: string | null;
  action: string | null;
  createdAt: string;
  lastNoticeAt: string | null;
  noticesCount: number;
  resolved: boolean;
  ignored: boolean;
};

export type HoneybadgerFaultsResult =
  | { configured: false; faults: []; error: null }
  | { configured: true; faults: HoneybadgerFault[]; error: string | null };

type HoneybadgerProject = { id: number; name: string; token: string };

function authHeader(): string {
  // Basic auth with the token as username and an empty password -- exactly
  // as Honeybadger's own docs specify (`curl -u AUTH_TOKEN:`), not a bearer
  // token like verify.mn/Brevo use elsewhere in this codebase.
  return `Basic ${Buffer.from(`${ENV.honeybadgerPersonalAuthToken}:`).toString("base64")}`;
}

async function honeybadgerGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: authHeader() }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`Honeybadger API request failed (${response.status}): ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// Cached for the process lifetime -- a Honeybadger project's numeric id
// practically never changes once resolved, and this avoids one extra
// round-trip to /v2/projects on every System Logs page load.
let cachedProjectId: number | null = null;

async function resolveProjectId(): Promise<number> {
  if (cachedProjectId !== null) return cachedProjectId;

  const { results: projects } = await honeybadgerGet<{ results: HoneybadgerProject[] }>("/projects");
  if (projects.length === 0) throw new Error("Honeybadger account has no projects visible to this token.");

  // Disambiguate by matching the SDK's own reporting key (honeybadgerApiKey)
  // against each project's `token` field when we have one to match against;
  // otherwise, a single-project account (the common small-business case)
  // needs no disambiguation at all.
  const matched = ENV.honeybadgerApiKey ? projects.find(project => project.token === ENV.honeybadgerApiKey) : undefined;
  const resolved = matched ?? (projects.length === 1 ? projects[0] : undefined);
  if (!resolved) {
    throw new Error(
      projects.length === 1
        ? "Unexpected: single-project lookup failed."
        : `Multiple Honeybadger projects found (${projects.map(project => project.name).join(", ")}) and none match HONEYBADGER_API_KEY -- set that too, or this can't tell which project's errors to show.`,
    );
  }
  cachedProjectId = resolved.id;
  return resolved.id;
}

/** Safe to call unconditionally -- returns `{ configured: false }` when no personal auth token is set. */
export async function listRecentHoneybadgerFaults(limit = 25): Promise<HoneybadgerFaultsResult> {
  if (!ENV.honeybadgerPersonalAuthToken) return { configured: false, faults: [], error: null };

  try {
    const projectId = await resolveProjectId();
    const { results } = await honeybadgerGet<{ results: Array<Record<string, unknown>> }>(`/projects/${projectId}/faults?order=recent&limit=${limit}`);
    const faults: HoneybadgerFault[] = results.map(fault => ({
      id: Number(fault.id),
      klass: String(fault.klass ?? "Unknown"),
      message: typeof fault.message === "string" ? fault.message : null,
      environment: typeof fault.environment === "string" ? fault.environment : null,
      component: typeof fault.component === "string" ? fault.component : null,
      action: typeof fault.action === "string" ? fault.action : null,
      createdAt: String(fault.created_at ?? ""),
      lastNoticeAt: typeof fault.last_notice_at === "string" ? fault.last_notice_at : null,
      noticesCount: Number(fault.notices_count ?? 0),
      resolved: Boolean(fault.resolved),
      ignored: Boolean(fault.ignored),
    }));
    return { configured: true, faults, error: null };
  } catch (error) {
    // Network/auth/shape failure talking to a THIRD PARTY should never break
    // the admin panel itself -- surface the message in the tab, same spirit
    // as every other integration's isolated error handling in this codebase.
    return { configured: true, faults: [], error: error instanceof Error ? error.message : String(error) };
  }
}
