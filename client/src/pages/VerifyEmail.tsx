import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import CommerceHeader from "@/components/CommerceHeader";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Имэйл хаягийг баталгаажуулж чадсангүй.";

export default function VerifyEmail() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState("");
  const utils = trpc.useUtils();
  const resend = trpc.auth.resendVerificationEmail.useMutation();
  const verifyCode = trpc.auth.verifyEmailCode.useMutation({ onSuccess: () => { void utils.auth.me.invalidate(); } });
  // Auto-send a code the first time this page mounts for an unverified user,
  // without re-sending on every re-render.
  const autoSent = useRef(false);

  useEffect(() => {
    if (loading || !user || user.emailVerifiedAt || autoSent.current) return;
    autoSent.current = true;
    resend.mutate(undefined, { onSuccess: result => { if (!result.alreadyVerified) toast.success("Баталгаажуулах код илгээлээ. Инбоксоо шалгана уу."); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("6 оронтой кодоо оруулна уу.");
      return;
    }
    try {
      await verifyCode.mutateAsync({ code: code.trim() });
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div className="auth-shell">
      <CommerceHeader cartCount={0} backLabel="SUGI ASAYAKE" />
      <main className="auth-main">
        <div className="auth-head">
          <p className="auth-kicker">EMAIL VERIFICATION</p>
          <h1>Имэйл <em>баталгаажуулалт.</em></h1>
        </div>

        <div className="auth-card" role="status" aria-live="polite">
          {loading ? (
            <p style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#707176" }}><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />Уншиж байна…</p>
          ) : !user ? (
            <p style={{ fontSize: "13px", lineHeight: 1.65, color: "#a51630" }}>Энэ хуудсыг үзэхийн тулд эхлээд нэвтэрнэ үү.</p>
          ) : user.emailVerifiedAt || verifyCode.isSuccess ? (
            <>
              <div className="auth-status-icon"><CheckCircle2 size={22} aria-hidden="true" /></div>
              <p style={{ fontSize: "13px", lineHeight: 1.65, color: "#626368" }}>Таны имэйл хаяг амжилттай баталгаажлаа. Баярлалаа!</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "13px", lineHeight: 1.65, color: "#626368" }}>
                <strong>{user.email}</strong> хаяг руу 6 оронтой баталгаажуулах код илгээлээ (15 минут хүчинтэй).
              </p>
              <form onSubmit={event => { event.preventDefault(); submit(); }}>
                <label className="auth-field">
                  Баталгаажуулах код
                  <div className="auth-field-shell otp">
                    <KeyRound size={16} aria-hidden="true" />
                    <input
                      value={code}
                      onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </div>
                </label>
                <button type="submit" disabled={verifyCode.isPending} className="auth-submit" style={{ marginTop: "16px" }}>
                  {verifyCode.isPending && <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />}
                  Баталгаажуулах
                </button>
                <button type="button" disabled={resend.isPending} onClick={() => resend.mutate(undefined, { onSuccess: () => toast.success("Шинэ код илгээлээ.") })} className="auth-quiet" style={{ marginTop: "14px" }}>
                  {resend.isPending ? "Илгээж байна…" : "Код ирээгүй юу? Дахин илгээх"}
                </button>
              </form>
            </>
          )}
          <Link href="/" className="auth-back">Нүүр хуудас руу буцах</Link>
        </div>
      </main>
    </div>
  );
}
