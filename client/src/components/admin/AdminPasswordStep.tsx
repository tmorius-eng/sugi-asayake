import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { KeyRound, ScanFace, ShieldCheck } from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FieldError, useFieldErrors } from "@/hooks/useFieldErrors";

/**
 * Step one of /admin: the account password (2026-09-22).
 *
 * Tom: "/admin-д эхлээд нууц үгээ хийгээд, дараа нь царай таних систем гарч
 * ирээд, царайгаа таниулаад л admin руу нэвтрэх ёстой". The session cookie
 * lives a year, so the password used to be asked once, at the very first
 * sign-in, and every later visit went straight to the camera. This screen is
 * shown whenever faceAuth.status says `passwordConfirmed: false` -- a new
 * tab, a new day (8 hours), after signing out -- and the face check cannot
 * even start without it (the server refuses, see assertReauthProof).
 *
 * Visual language is the consent screen's (brand strip, the account being
 * used, the "password + face = access" diagram), with the first box lit:
 * this is that same diagram, one step at a time. No new styling direction.
 */
export default function AdminPasswordStep({ onConfirmed }: { onConfirmed: () => void }) {
  const { user, logout } = useAuth();
  const confirmPassword = trpc.faceAuth.confirmPassword.useMutation();
  const [password, setPassword] = useState("");
  const { errorFor, fieldProps, clearError, showErrors } = useFieldErrors();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      showErrors({ "admin-password": "Нууц үгээ оруулна уу." });
      return;
    }
    try {
      await confirmPassword.mutateAsync({ password });
      setPassword("");
      onConfirmed();
    } catch (error) {
      showErrors({ "admin-password": error instanceof TRPCClientError && error.message ? error.message : "Алдаа гарлаа. Дахин оролдоно уу." });
    }
  };

  return (
    <div className="face-gate-shell">
      <form className="face-gate-card face-gate-card--wide face-gate-card--consent" onSubmit={submit} noValidate>
        <div className="face-gate-brandstrip" aria-hidden="true" />
        <p className="face-gate-brand">SUGI ASAYAKE ADMIN</p>
        {/* Whose password: someone left signed in as a colleague should notice
            before typing their own. */}
        {user && <p className="face-gate-identity">{user.name || user.phone || `#${user.id}`}</p>}

        <h1 className="face-gate-title">Нууц үгээ оруулна уу</h1>
        <p className="face-gate-lede">Админ хэсэгт орохдоо эхлээд нууц үг, дараа нь царайгаа баталгаажуулна.</p>

        {/* Same markup as the consent screen's diagram (a list here stacked
            vertically on phones under the storefront's list rules). */}
        <div className="face-gate-diagram" role="img" aria-label="1-р алхам: нууц үг. Дараа нь царай, дараа нь админ хандалт.">
          <div className="face-gate-diagram-item face-gate-step--current">
            <span className="face-gate-diagram-icon"><KeyRound size={22} aria-hidden="true" /></span>
            <span>1. Нууц үг</span>
          </div>
          <span className="face-gate-diagram-op" aria-hidden="true">→</span>
          <div className="face-gate-diagram-item">
            <span className="face-gate-diagram-icon"><ScanFace size={22} aria-hidden="true" /></span>
            <span>2. Царай</span>
          </div>
          <span className="face-gate-diagram-op" aria-hidden="true">→</span>
          <div className="face-gate-diagram-item">
            <span className="face-gate-diagram-icon face-gate-diagram-icon--ok"><ShieldCheck size={22} aria-hidden="true" /></span>
            <span>3. Админ</span>
          </div>
        </div>

        {/* Lets a password manager fill the right account. */}
        <input type="text" name="username" autoComplete="username" value={user?.phone ?? ""} readOnly hidden />
        <label className="face-gate-field" htmlFor="admin-password">
          <span>Нууц үг</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            // The only thing to do on this screen.
            autoFocus
            value={password}
            onChange={event => { setPassword(event.target.value); clearError("admin-password"); }}
            {...fieldProps("admin-password")}
          />
        </label>
        <FieldError field="admin-password" message={errorFor("admin-password")} />

        <button type="submit" className="face-gate-btn" disabled={confirmPassword.isPending}>
          {confirmPassword.isPending ? "Шалгаж байна…" : "Үргэлжлүүлэх"}
        </button>

        <div className="face-gate-links">
          <Link href="/forgot-password" className="face-gate-link">Нууц үгээ мартсан уу?</Link>
          <button type="button" className="face-gate-link" onClick={() => void logout()}>Өөр дансаар нэвтрэх</button>
        </div>
      </form>
    </div>
  );
}
