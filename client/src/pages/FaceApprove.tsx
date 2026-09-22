import { useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { Link } from "wouter";
import { AlertTriangle, LoaderCircle, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FaceGateFlow } from "@/components/AdminFaceGate";
// The camera stage, number buttons and cards (2026-09-22): this page is opened
// cold on the phone and never loads /admin's stylesheet.
import "@/face.css";

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
  const startChallenge = trpc.faceAuth.startHandoffVerification.useMutation();
  const approve = trpc.faceAuth.approveHandoff.useMutation();
  const deny = trpc.faceAuth.denyHandoff.useMutation();
  const [chosen, setChosen] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [denied, setDenied] = useState(false);
  /**
   * The request is over and cannot be retried from this phone (2026-09-22):
   * the wrong number was picked (the server closes the request on the spot),
   * it expired, or it was already used. Before this, the error surfaced inside
   * the camera screen with a "try again" button that could only fail again.
   */
  const [closed, setClosed] = useState<string | null>(null);

  /** A server refusal that ends this request: show it and stop the camera
   *  flow. FaceGateFlow treats "ABORTED" as a silent exit. */
  const endWith = (error: unknown): never => {
    setClosed(error instanceof TRPCClientError && error.message ? error.message : "Хүсэлт хаагдлаа. Компьютер дээрээ шинэ код гаргана уу.");
    throw new Error("ABORTED");
  };

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
  if (closed) return <Shell title="Хүсэлт хаагдлаа"><p>{closed}</p><p className="face-approve-note">Компьютер дээрээ "Утсаараа баталгаажуулах"-ыг дахин дарж шинэ код гаргана уу.</p></Shell>;

  if (contextQuery.isLoading) return <Shell title="Шалгаж байна…"><LoaderCircle className="animate-spin" /></Shell>;
  if (contextQuery.isError) return <Shell title="Хүчингүй код"><p>{contextQuery.error.message}</p></Shell>;

  const context = contextQuery.data!;

  // 3-р алхам: тоо таарсны дараа л камер асна. Тоог сервер challenge
  // гаргахаас ӨМНӨ шалгана (startHandoffVerification) — буруу бол хүсэлт тэр
  // даруй хаагдаж, камер огт асахгүй.
  if (chosen !== null) {
    return (
      <FaceGateFlow
        needsEnrollment={false}
        modelStale={false}
        onPassed={() => setDone(true)}
        startChallenge={async () => {
          try {
            return await startChallenge.mutateAsync({ token, matchNumber: chosen });
          } catch (error) {
            // The account lockout is not the end of THIS request -- show it
            // in the camera screen like on the desktop; everything else is.
            if (error instanceof TRPCClientError && error.data?.code === "TOO_MANY_REQUESTS") throw error;
            return endWith(error);
          }
        }}
        submitVerification={async payload => {
          try {
            return await approve.mutateAsync({ ...payload, token, matchNumber: chosen });
          } catch (error) {
            if (error instanceof TRPCClientError && error.data?.code === "TOO_MANY_REQUESTS") throw error;
            return endWith(error);
          }
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
          <button key={choice} type="button" className="face-approve-number" onClick={() => {
            // Тоог энд шалгахгүй — сервер шалгана. Буруу бол хүсэлт бүхэлдээ
            // хаагдана (дахин таах боломжгүй).
            setChosen(choice);
          }}>{choice}</button>
        ))}
      </div>
      <button type="button" className="face-approve-deny" disabled={deny.isPending} onClick={async () => {
        try {
          await deny.mutateAsync({ token });
          setDenied(true);
        } catch (error) {
          setClosed(error instanceof TRPCClientError && error.message ? error.message : "Хүсэлтийг хааж чадсангүй. Компьютер дээрх код 90 секундэд өөрөө хүчингүй болно.");
        }
      }}>
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
