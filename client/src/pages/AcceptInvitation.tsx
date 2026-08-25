import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Link, useRoute } from "wouter";

const errorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("too_small") || message.includes("Too small") || message.includes("token")) {
    return "Урилгын холбоос буруу эсвэл дутуу байна. Админаасаа шинэ, бүрэн холбоос аваарай.";
  }
  return message || "Урилгыг хүлээн авч чадсангүй. Дахин оролдоно уу.";
};

export default function AcceptInvitation() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";
  const hasValidTokenShape = token.length >= 32;
  const { user, loading } = useAuth();
  const details = trpc.invites.details.useQuery({ token }, { enabled: hasValidTokenShape, retry: false });
  const accept = trpc.invites.accept.useMutation();

  const beginSignIn = () => {
    sessionStorage.setItem("sugi-pending-invite", token);
    startLogin();
  };

  const acceptInvitation = async () => {
    try {
      await accept.mutateAsync({ token });
      sessionStorage.removeItem("sugi-pending-invite");
    } catch {
      // The structured mutation error is displayed below.
    }
  };

  const statusMessage = !hasValidTokenShape ? "Урилгын холбоос буруу эсвэл дутуу байна. Админаасаа шинэ, бүрэн холбоос аваарай." : details.error ? errorMessage(details.error) : details.data && !details.data.valid ? details.data.message : null;
  const expiration = details.data?.valid && details.data.expiresAt ? new Date(details.data.expiresAt) : null;

  return (
    <div className="auth-shell">
      <main className="auth-main" style={{ paddingTop: "96px" }}>
        <div className="auth-status-icon" style={{ marginBottom: "20px" }}><ShieldCheck size={22} aria-hidden="true" /></div>
        <div className="auth-head">
          <p className="auth-kicker">SUGI ASAYAKE · STAFF ACCESS</p>
          <h1>Багийн <em>урилга.</em></h1>
        </div>

        <div className="auth-card">
          {(loading || details.isLoading) && <p style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#707176" }}><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />Урилгын мэдээллийг шалгаж байна…</p>}
          {statusMessage && <div className="auth-note error">{statusMessage}</div>}
          {details.data?.valid && (
            <>
              <p style={{ fontSize: "13px", lineHeight: 1.65, color: "#626368" }}>
                Та <strong>{details.data.email}</strong> имэйлд илгээсэн <strong>{details.data.role === "admin" ? "админ" : "ажилтан"}</strong> эрхийн урилгыг хүлээн авах гэж байна. Урилга {expiration?.toLocaleDateString("mn-MN") ?? "—"} хүртэл хүчинтэй.
              </p>
              {!user && <button type="button" onClick={beginSignIn} className="auth-submit">Нэвтэрч үргэлжлүүлэх</button>}
              {user && (
                <>
                  <div className="auth-note info">Та <strong>{user.email ?? "имэйлгүй бүртгэл"}</strong> хаягаар нэвтэрсэн байна. Энэ нь урилгын имэйлтэй таарах ёстой.</div>
                  <button type="button" disabled={accept.isPending} onClick={acceptInvitation} className="auth-submit">
                    {accept.isPending && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                    Урилгыг хүлээн авах
                  </button>
                  {accept.isSuccess && (
                    <div className="auth-note success">
                      <CheckCircle2 size={15} aria-hidden="true" style={{ display: "inline-block", marginRight: "8px", verticalAlign: "-2px" }} />
                      Эрх амжилттай идэвхжлээ. <Link href={accept.data.role === "admin" ? "/admin" : "/"} style={{ fontWeight: 800, textDecoration: "underline" }}>Үргэлжлүүлэх</Link>
                    </div>
                  )}
                  {accept.error && <div className="auth-note error">{errorMessage(accept.error)}</div>}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
