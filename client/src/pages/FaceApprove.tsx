import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, LoaderCircle, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FaceGateFlow } from "@/components/AdminFaceGate";

/**
 * Утсан дээр нээгдэх хуудас: камергүй компьютерийн admin хандалтыг
 * баталгаажуулна (2026-09-16). Бүрэн дизайн: docs/FACE-HANDOFF-PLAN.md.
 *
 * Энэ хуудас ЮУ Ч НЭЭХГҮЙ: утас өөрөө admin болохгүй, шинэ сесс үүсгэхгүй.
 * Зөвхөн "тэр компьютер дээрх, миний дансны, миний эхлүүлсэн хүсэлт мөн"
 * гэдгийг батална. Тиймээс дараалал нь: (1) юуг баталж байгааг ХАРУУЛАХ,
 * (2) компьютерийн дэлгэц дээрх ТООГ таарууулах, (3) царай.
 */
export default function FaceApprove() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const { isAuthenticated, loading } = useAuth();
  const contextQuery = trpc.faceAuth.handoffContext.useQuery({ token }, { enabled: Boolean(token) && isAuthenticated, retry: false });
  const approve = trpc.faceAuth.approveHandoff.useMutation();
  const deny = trpc.faceAuth.denyHandoff.useMutation();
  const [chosen, setChosen] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) return <Shell title="Код олдсонгүй"><p>Энэ холбоос бүрэн биш байна. Компьютер дээрх QR кодыг дахин уншуулна уу.</p></Shell>;
  if (loading) return <Shell title="Ачаалж байна…"><LoaderCircle className="animate-spin" /></Shell>;

  // Нэвтрээгүй бол ЭНД нэвтрэлт хийхгүй — ердийн нэвтрэх хуудас руу явуулж,
  // буцаж ирэх холбоосыг хадгална. Нэвтрэлт бол эхний фактор, энэ хуудас
  // хоёр дахийг нь л хариуцна.
  if (!isAuthenticated) {
    // Login-ий параметр нь `redirect` (Login.tsx-ийг үз) — same-site зам л
    // хүлээн авдаг.
    const next = encodeURIComponent(`/face-approve?token=${encodeURIComponent(token)}`);
    return (
      <Shell title="Эхлээд нэвтэрнэ үү">
        <p>Энэ хүсэлтийг баталгаажуулахын тулд эхлээд өөрийн дансаараа нэвтэрнэ үү.</p>
        <Link href={`/login?redirect=${next}`} className="face-approve-btn">Нэвтрэх →</Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Баталгаажлаа">
        <p className="face-approve-ok"><ShieldCheck size={18} aria-hidden="true" /> Компьютер дээрээ буцаж очно уу — admin хэсэг нээгдсэн байна.</p>
        <p className="face-approve-note">Утсан дээр ямар ч admin эрх үлдээгүй.</p>
      </Shell>
    );
  }
  if (denied) return <Shell title="Татгалзлаа"><p>Хүсэлтийг хаалаа. Хэрэв энэ таны үйлдэл биш байсан бол нууц үгээ яг одоо солиод бүх төхөөрөмжөөс гарна уу.</p></Shell>;

  if (contextQuery.isLoading) return <Shell title="Шалгаж байна…"><LoaderCircle className="animate-spin" /></Shell>;
  if (contextQuery.isError) return <Shell title="Хүчингүй код"><p>{contextQuery.error.message}</p></Shell>;

  const context = contextQuery.data!;

  // 3-р алхам: тоо таарсны дараа л камер асна.
  if (chosen !== null) {
    return (
      <FaceGateFlow
        needsEnrollment={false}
        modelStale={false}
        onPassed={() => setDone(true)}
        submitVerification={async payload => {
          const result = await approve.mutateAsync({ ...payload, token, matchNumber: chosen });
          return result;
        }}
      />
    );
  }

  return (
    <Shell title="Энэ та мөн үү?">
      {/* OWASP-ийн QRLJacking-ийн эсрэг эхний зөвлөмж: юуг баталж байгааг
          тодорхой ХАРУУЛАХ. Энд харагдах төхөөрөмж/цаг таных биш бол
          "Би биш" гэж дарах ёстой. */}
      <div className="face-approve-context">
        <p className="face-approve-device"><MonitorSmartphone size={16} aria-hidden="true" /> {context.device}</p>
        <dl>
          <div><dt>Хүсэлт гаргасан</dt><dd>{new Date(context.requestedAt).toLocaleTimeString("mn-MN")}</dd></div>
          {context.ip && <div><dt>Компьютерийн IP</dt><dd>{context.ip}</dd></div>}
        </dl>
        {context.differentNetwork && (
          <p className="face-approve-warning"><AlertTriangle size={15} aria-hidden="true" /> Таны утас өөр сүлжээнд байна. Хэрэв та тэр компьютерийн дэргэд БАЙХГҮЙ бол доорх "Би биш" товчийг дарна уу.</p>
        )}
      </div>

      <p className="face-approve-question">Компьютер дээр ямар тоо харагдаж байна вэ?</p>
      <div className="face-approve-numbers">
        {context.numberChoices.map(choice => (
          <button key={choice} type="button" className="face-approve-number" onClick={async () => {
            setError(null);
            // Тоог энд шалгахгүй — сервер шалгана. Буруу бол хүсэлт бүхэлдээ
            // хаагдана (дахин таах боломжгүй).
            setChosen(choice);
          }}>{choice}</button>
        ))}
      </div>
      {error && <p className="face-approve-warning">{error}</p>}

      <button type="button" className="face-approve-deny" onClick={async () => { await deny.mutateAsync({ token }); setDenied(true); }}>
        Би биш — хаах
      </button>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="face-approve">
      <div className="face-approve-card">
        <p className="face-approve-eyebrow">SUGI ASAYAKE · ADMIN</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
