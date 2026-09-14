import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, MessageSquareText, RotateCcw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Баталгаажуулж чадсангүй. Дахин оролдоно уу.";

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * verify.mn (Mongolian Mobile-Originated SMS) phone verification -- shared
 * between ForgotPassword.tsx's "Утсаар сэргээх" flow and Login.tsx's
 * optional post-registration phone step (same reasoning this codebase
 * already applied to BestsellerRailCard/RailProductCard -- one real
 * duplicate UI, one shared component).
 *
 * Tom, 2026-09-05 ("ygd minii website ene verify.mn shig haragdhgui baina
 * be!!"): restyled the "awaiting SMS" card to match verify.mn's own
 * Developer Console page -- a bordered instruction card, a live mm:ss
 * countdown to expiry, and a manual "Мессеж шалгах" check button next to
 * the automatic 3s poll -- in SUGI's own red/black brand language rather
 * than copying verify.mn's blue.
 *
 * Polls auth.phoneVerificationStatus every 3s, exactly like Checkout.tsx's
 * own QPay poll (`refetchInterval: 5_000`) -- the poll IS the source of
 * truth here (no public callback URL exists yet for verify.mn to reach, see
 * server/verifyMn.ts), not just a UI nicety.
 */
export default function PhoneVerificationStep({ purpose, onVerified, initialPhone, compact }: { purpose: "register" | "password_reset" | "checkout"; onVerified: (sessionId: string, phone: string) => void; initialPhone?: string; compact?: boolean }) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  // Checkout (2026-09-14) passes the number typed on the order form so the
  // shopper does not type it twice; keep following it until a session starts.
  useEffect(() => { if (initialPhone !== undefined) setPhone(initialPhone); }, [initialPhone]);
  const [session, setSession] = useState<{ sessionId: string; smsUri: string; displayInstruction: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const startVerification = trpc.auth.startPhoneVerification.useMutation();
  const statusQuery = trpc.auth.phoneVerificationStatus.useQuery(
    { sessionId: session?.sessionId ?? "" },
    { enabled: Boolean(session), refetchInterval: query => (query.state.data?.status === "verified" ? false : 3_000) },
  );
  const status = statusQuery.data?.status;

  // Live mm:ss countdown to expiry, matching verify.mn's own "04:56" timer.
  useEffect(() => {
    if (!session || status !== "pending") return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [session, status]);

  // Fires once per session the instant polling reports "verified" -- the
  // effect's own dependency array (not a render-body call, which could fire
  // during render and trigger the "setState on a different component while
  // rendering" React warning/error) means this runs exactly once per
  // session transitioning to verified, not on every re-render.
  useEffect(() => {
    if (status === "verified" && session) onVerified(session.sessionId, phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.sessionId]);

  const submitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await startVerification.mutateAsync({ phone, purpose });
      setNow(Date.now());
      setSession(result);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const retry = () => {
    setSession(null);
  };

  if (!session) {
    return (
      <form onSubmit={submitPhone} className={compact ? "phone-verify-compact" : "auth-card"}>
        <label className="auth-field">
          Утасны дугаар
          <div className="auth-field-shell">
            <Smartphone size={16} aria-hidden="true" />
            <input value={phone} onChange={event => setPhone(event.target.value)} placeholder="9911 2233" inputMode="tel" autoComplete="tel" />
          </div>
        </label>
        <p style={{ marginTop: "10px", fontSize: "12px", lineHeight: 1.6, color: "#8a6a10" }}>
          Баталгаажуулах SMS илгээхэд таны дугаараас <strong>150₮</strong> хасагдана (оператор компаниас хураана, бид биш).
        </p>
        <button type="submit" disabled={startVerification.isPending} className="auth-submit" style={{ marginTop: "14px" }}>
          {startVerification.isPending && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
          {compact ? "Утсаа баталгаажуулах" : "Код илгээх"}
        </button>
      </form>
    );
  }

  if (status === "expired") {
    return (
      <div className="auth-card">
        <div className="auth-note error">Кодны хугацаа дууссан байна. Хуучин кодоор баталгаажуулах боломжгүй.</div>
        <button type="button" onClick={retry} className="auth-submit" style={{ marginTop: "14px" }}><RotateCcw size={16} aria-hidden="true" />Дахин оролдох</button>
      </div>
    );
  }

  if (status === "verified") {
    return (
      <div className="auth-card">
        <div className="auth-status-icon"><CheckCircle2 size={22} aria-hidden="true" /></div>
        <p style={{ fontSize: "13px", lineHeight: 1.65, color: "#626368" }}>Утасны дугаар амжилттай баталгаажлаа.</p>
      </div>
    );
  }

  const msRemaining = new Date(session.expiresAt).getTime() - now;

  return (
    <div className="auth-card phone-verify-card">
      {/* displayInstruction is shown verbatim -- it names the exact phone
          number the SMS must come FROM, and sending from a different
          SIM/number is verify.mn's own documented most-common failure. */}
      <div className="phone-verify-instruction">
        <p>{session.displayInstruction}</p>
      </div>
      <a href={session.smsUri} className="auth-submit" style={{ marginTop: "16px", textDecoration: "none" }}>
        <MessageSquareText size={16} aria-hidden="true" /> SMS илгээх апп нээх
      </a>
      <div className="phone-verify-status">
        <span className="phone-verify-spinner"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> SMS хүлээж байна…</span>
        <span className="phone-verify-countdown">{msRemaining > 0 ? formatCountdown(msRemaining) : "00:00"}</span>
      </div>
      <button type="button" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching} className="phone-verify-check">
        {statusQuery.isFetching ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
        Мессеж шалгах
      </button>
      <button type="button" onClick={retry} className="auth-quiet" style={{ marginTop: "12px" }}>Өөр дугаар ашиглах</button>
    </div>
  );
}
