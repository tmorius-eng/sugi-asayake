import { useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, TriangleAlert, UserRound } from "lucide-react";
import { INTEGRATION_META, validateIntegrationSettings, type IntegrationConnect, type IntegrationProvider } from "@shared/integrations";
import { INTEGRATION_ACCENT, INTEGRATION_ICON } from "./integrationVisuals";

/**
 * The "sign in to this vendor" card (2026-09-15).
 *
 * A provider whose INTEGRATION_META declares `connect` shows this instead of
 * the generic key-by-key editor while its required fields are still unset --
 * which is the state an admin meets it in exactly once, and the state the
 * old screen served worst: four equally-weighted rows (username, password,
 * two base URLs that already default correctly) with no indication that only
 * the first two matter or that a "test" exists.
 *
 * What it deliberately does NOT do:
 *  - It never sets `replaceAll`. Saving merges, so the base URLs a previous
 *    admin typed survive connecting.
 *  - It never renders a stored value. The server returns `value: null` for a
 *    secret (server/db.ts's getAdminIntegrations), so the reveal toggle can
 *    only ever show what the person typed into this form a moment ago.
 *  - On a failed test it does NOT refresh the parent query. "Saved" is not
 *    "the vendor accepted it", and re-reading would flip the card to the
 *    connected view and tell the admin it worked.
 */
export type ConnectResult = { ok: boolean; detail: string };

export default function IntegrationConnectCard({
  provider,
  connect,
  onConnect,
  onSkip,
}: {
  provider: IntegrationProvider;
  connect: IntegrationConnect;
  /** Saves the typed credentials, then asks the vendor whether they work. */
  onConnect: (set: Record<string, string>) => Promise<ConnectResult>;
  onSkip: () => void;
}) {
  const meta = INTEGRATION_META[provider];
  const accent = INTEGRATION_ACCENT[meta.accent ?? "slate"];
  const Icon = INTEGRATION_ICON[meta.icon ?? "store"];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const required = connect.requiredFields
    .map(key => meta.fields.find(field => field.key === key))
    .filter((field): field is NonNullable<typeof field> => Boolean(field));
  const ready = required.every(field => (drafts[field.key] ?? "").trim().length > 0);

  const run = async (set: Record<string, string>) => {
    setBusy(true);
    setFailure(null);
    try {
      const result = await onConnect(set);
      if (!result.ok) setFailure(result.detail);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Холбогдож чадсангүй.");
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const set: Record<string, string> = {};
    for (const field of required) {
      const value = (drafts[field.key] ?? "").trim();
      if (value) set[field.key] = value;
    }
    const problem = validateIntegrationSettings(provider, set);
    if (problem) { setFailure(problem); return; }
    void run(set);
  };

  return (
    <div className="mt-4 rounded-2xl border border-[var(--a-border)] bg-[var(--a-soft)] px-5 py-7">
      <div className="mx-auto grid w-full max-w-sm gap-4 [&>*]:min-w-0">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-[var(--a-border)] bg-[var(--a-card)]" style={{ color: accent.color }}>
            <Icon size={26} />
          </span>
          <h4 className="font-[var(--font-display)] text-xl font-semibold tracking-[-.03em]">{connect.title}</h4>
          <p className="text-xs leading-5 text-[var(--a-muted)]">{connect.subtitle}</p>
        </div>

        {required.map(field => {
          const isSecret = field.kind === "secret";
          const show = Boolean(revealed[field.key]);
          const LeadingIcon = isSecret ? KeyRound : UserRound;
          return (
            <label key={field.key} className="grid gap-1.5">
              <span className="text-xs font-bold">{field.label}</span>
              <span className="relative block">
                <LeadingIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--a-faint)]" />
                <input
                  value={drafts[field.key] ?? ""}
                  onChange={event => setDrafts(current => ({ ...current, [field.key]: event.target.value }))}
                  onKeyDown={event => { if (event.key === "Enter" && ready && !busy) submit(); }}
                  type={isSecret && !show ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={field.label}
                  className={`h-11 w-full rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] pl-9 text-sm outline-none focus:border-[#3970a7] ${isSecret ? "pr-10" : "pr-3"}`}
                />
                {isSecret && (
                  <button
                    type="button"
                    onClick={() => setRevealed(current => ({ ...current, [field.key]: !current[field.key] }))}
                    aria-label={show ? "Нууц үгийг нуух" : "Нууц үгийг харуулах"}
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[var(--a-muted)] hover:text-[var(--a-text)]"
                  >
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </span>
            </label>
          );
        })}

        {failure && (
          <div className="rounded-xl bg-[var(--a-neg-soft)] p-3 text-[11px] leading-4 text-[var(--a-neg)]">
            <p className="flex items-start gap-1.5 font-bold"><TriangleAlert size={13} className="mt-0.5 shrink-0" />Холбогдсонгүй</p>
            {/* The vendor's own words, not a rewrite of them: "нэр/нууц үг
                буруу" and "сервер хариу өгсөнгүй" need different actions. */}
            <p className="mt-1 break-words">{failure}</p>
            <p className="mt-1.5 text-[var(--a-muted)]">Нэвтрэх мэдээлэл хадгалагдсан. Дахин оролдох, эсвэл дараа нь тохируулж болно.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void run({})} className="rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--a-text-soft)] disabled:opacity-50">Дахин оролдох</button>
              <button type="button" onClick={onSkip} className="rounded-full px-2 py-1.5 text-[10px] font-extrabold text-[var(--a-muted)]">Дараа нь тохируулах</button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!ready || busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#df1f3d] text-xs font-extrabold text-white transition disabled:cursor-not-allowed disabled:bg-[var(--a-border)] disabled:text-[var(--a-faint)]"
        >
          {busy ? <LoaderCircle className="animate-spin" size={15} /> : null}
          {connect.cta}
          {!busy && <ArrowRight size={15} />}
        </button>

        <p className="text-center text-[11px] leading-4 text-[var(--a-faint)]">{connect.footnote}</p>
      </div>
    </div>
  );
}
