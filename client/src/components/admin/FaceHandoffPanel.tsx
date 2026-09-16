import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, LoaderCircle, RefreshCw, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FACE_HANDOFF_TTL_MS } from "@shared/face-auth";

/**
 * Камергүй компьютер дээр admin-д нэвтрэх QR дэлгэц (2026-09-16).
 * Бүрэн дизайн ба аюулгүй байдлын үндэслэл: docs/FACE-HANDOFF-PLAN.md.
 *
 * Энэ бүрэлдэхүүн юу ХИЙХГҮЙ вэ гэдэг нь чухал: энэ нь нэвтрэлт биш. Хэрэглэгч
 * аль хэдийн (утас + нууц үг + OTP-ээр) нэвтэрсэн байх ёстой; энд зөвхөн
 * ХОЁР ДАХЬ фактор болох царайны шалгалт утас руу шилждэг. Утас ямар ч сесс
 * үүсгэхгүй — зөвхөн энэ компьютерийн энэ табыг нээнэ.
 */
export default function FaceHandoffPanel({ onPassed, onBack }: { onPassed: () => void; onBack: () => void }) {
  const start = trpc.faceAuth.startHandoff.useMutation();
  const status = trpc.faceAuth.handoffStatus.useMutation();
  const [token, setToken] = useState<string | null>(null);
  const [matchNumber, setMatchNumber] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);

  const approveUrl = useMemo(() => (token ? `${window.location.origin}/face-approve?token=${encodeURIComponent(token)}` : null), [token]);

  const request = useMemo(() => async () => {
    setError(null);
    setApproved(false);
    try {
      const created = await start.mutateAsync();
      setToken(created.token);
      setMatchNumber(created.matchNumber);
      setExpiresAt(new Date(created.expiresAt).getTime());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "QR код үүсгэж чадсангүй.");
    }
    // start.mutateAsync is stable enough for this one-shot call; including the
    // whole mutation object here would re-create the callback on every render
    // and restart the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void request(); }, [request]);

  /**
   * QR-ийг ЗУРАГ болгож (`toDataURL`) `<img>`-д өгнө — `toCanvas` БИШ.
   *
   * Эхний хувилбар `QRCode.toCanvas(ref.current, …)` байсан бөгөөд амьд сайт
   * дээр хоосон цагаан дөрвөлжин гаргаж байв (2026-09-16, Tom: "QR код гарч
   * ирэхгүй байна"): canvas нь нөхцөлтэйгээр render хийгддэг тул ref нь эффект
   * ажиллах үед үргэлж бэлэн байдаггүй, дээрээс нь алдаа `void`-д залгигдаж
   * ул мөргүй алга болдог байв. `toDataURL` нь DOM-оос хамааралгүй бөгөөд
   * төслийн бусад QR (ProductQrModal, AdminNotificationsPanel) яг үүнийг
   * ашигладаг — ажилладаг нь батлагдсан зам.
   */
  useEffect(() => {
    if (!approveUrl) { setQrImage(null); return; }
    let cancelled = false;
    QRCode.toDataURL(approveUrl, { width: 640, margin: 1, errorCorrectionLevel: "M", color: { dark: "#17181b", light: "#ffffff" } })
      .then(generated => { if (!cancelled) setQrImage(generated); })
      // Хоосон дөрвөлжин биш, ойлгомжтой алдаа: QR гарахгүй бол handoff
      // бүхэлдээ боломжгүй тул чимээгүй бүтэлгүйтэх ёсгүй.
      .catch(() => { if (!cancelled) { setQrImage(null); setError("QR кодыг зурж чадсангүй. Хуудсаа шинэчилнэ үү."); } });
    return () => { cancelled = true; };
  }, [approveUrl]);

  // Үлдсэн хугацаа. setInterval (requestAnimationFrame БИШ): арын таб дээр
  // rAF зогсдог тул хугацаа дуусахыг анзаарахгүй өнгөрнө.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [expiresAt]);

  /**
   * Компьютер өөрөө 2 секунд тутам асууна: батлагдмагц ЭНЭ хариулт дээр proof
   * cookie ирнэ.
   *
   * ⚠️ 2026-09-16, БОДИТ АЛДАА (Tom: "утсаараа нүүрээ уншуулсанч нэвтэрхгүй
   * байна"): эхний хувилбарын хамаарлын жагсаалтад `secondsLeft` байсан.
   * Тэр нь 500мс тутам өөрчлөгддөг тул effect нь секундэд хоёр удаа дахин
   * үүсч, 2000мс-ийн `setInterval` нэг ч удаа ажиллаж амжихгүй цэвэрлэгддэг
   * байв — өөрөөр хэлбэл компьютер СЕРВЕР РҮҮ ОГТ АСУУГААГҮЙ. Утас зөв
   * баталж, push ч ирж байсан ч компьютер мэдэхгүй үлдэж QR нь хугацаа
   * дуусдаг байв.
   *
   * Дүрэм: интервалтай effect-ийн хамаарал нь интервалаас ХУРДАН өөрчлөгддөг
   * утга агуулж болохгүй. Дуудлагууд (`mutateAsync`, `onPassed`) нь render
   * бүрт шинэ объект тул мөн ref-ээр дамжина.
   */
  const claimRef = useRef(status.mutateAsync);
  claimRef.current = status.mutateAsync;
  const passedRef = useRef(onPassed);
  passedRef.current = onPassed;

  useEffect(() => {
    if (!token || approved) return;
    let stopped = false;
    // QR нүдэн дээр хугацаа дуусахад шууд зогсохгүй: утас сүүлийн секундэд
    // баталсан байж болох тул нэг минут илүү асууна (сервер талд төлөв нь
    // `approved` хэвээр байвал компьютер ХЭВЭЭР нээгдэх ёстой).
    const deadline = (expiresAt || Date.now()) + 60_000;
    const tick = async () => {
      if (stopped || Date.now() > deadline) return;
      try {
        const result = await claimRef.current({ token });
        if (stopped) return;
        if (result.status === "approved") {
          setApproved(true);
          passedRef.current();
        } else if (result.status === "denied") {
          setError("Утсан дээрээс татгалзсан байна.");
          setToken(null);
        }
      } catch {
        // Сүлжээний түр саатал — дараагийн давталт дахин оролдоно.
      }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [token, approved, expiresAt]);

  const expired = secondsLeft <= 0 && !approved;

  return (
    // `.face-gate-shell` нь бүтэн дэлгэцийг эзэлж картыг ТӨВД байрлуулдаг
    // (grid + place-items: center + дэвсгэр). Эхэндээ байхгүй класс
    // ("face-gate") бичсэнээс карт зүүн дээд буланд наалдаж байв — 2026-09-16,
    // Tom: "буланд байх юм".
    // Сканнерын дэлгэцтэй ижил харанхуй карт — сонголтын дэлгэцээс шилжихэд
    // нэг л зохиомжийн дотор явж байгаа мэт байх ёстой (2026-09-16).
    <div className="face-gate-shell face-gate-shell--dark" role="dialog" aria-modal="true" aria-label="Утсаар баталгаажуулах">
      <div className="face-gate-card face-gate-card--wide face-gate-card--scan">
        <button type="button" className="face-gate-back" onClick={onBack} aria-label="Буцах"><ArrowLeft size={18} aria-hidden="true" /></button>
        <div className="face-gate-head face-gate-head--with-back">
          <Smartphone size={20} aria-hidden="true" />
          <div>
            <h2>Утсаараа QR-ыг уншуулна уу</h2>
            <p className="face-gate-muted">
              Утсаараа доорх QR-ыг уншуулж, өөрийн дансаараа нэвтэрсэн байдалдаа царайгаа
              уншуулбал энэ компьютер дээрх admin хэсэг нээгдэнэ.
            </p>
          </div>
        </div>

        {error && <div className="face-gate-alert" role="alert">{error}</div>}

        {approved ? (
          <p className="face-gate-hint" aria-live="polite">Баталгаажлаа — нээж байна…</p>
        ) : expired || !token ? (
          <button type="button" className="face-gate-btn" onClick={() => void request()} disabled={start.isPending}>
            {start.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />} Шинэ QR код гаргах
          </button>
        ) : (
          <>
            <div className="face-handoff-qr">
              {qrImage
                ? <img src={qrImage} alt="Утсаар уншуулах QR код" width={232} height={232} />
                : <span className="face-handoff-qr-loading"><LoaderCircle className="animate-spin" size={20} aria-hidden="true" /> QR бэлдэж байна…</span>}
            </div>
            {/*
              Тоо тааруулах: утсан дээр гурван сонголт гарах бөгөөд зөвхөн энэ
              дэлгэцийг БОДИТООР харж байгаа хүн зөвийг нь мэднэ. BLE-ийн
              ойролцооны шалгалтыг орлох арга (docs/FACE-HANDOFF-PLAN.md §4).
            */}
            <p className="face-handoff-number-label">Утсан дээрээ энэ тоог сонгоно уу</p>
            <p className="face-handoff-number">{matchNumber}</p>
            <p className="face-gate-hint" aria-live="polite">
              {secondsLeft} секундын дараа энэ код хүчингүй болно ({Math.round(FACE_HANDOFF_TTL_MS / 1000)} секунд тутамд шинэчилнэ).
            </p>
          </>
        )}

        <button type="button" className="face-gate-link" onClick={onBack}>← Өөр аргаар баталгаажуулах</button>
      </div>
    </div>
  );
}
