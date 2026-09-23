import { ArrowRight, Check, Monitor, ScanFace, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Царайгаар баталгаажуулах АРГАА сонгох дэлгэц (2026-09-16, Tom-ийн өгсөн
 * лавлагааны дагуу: "Verify with Current Device" / "Verify with Phone").
 *
 * Яагаад сонголтын дэлгэц хэрэгтэй болов: өмнө нь хаалга шууд камер асааж,
 * утсаар баталгаажуулах гарц нь ЗӨВХӨН камер олдоогүй үед л харагддаг байв.
 * Tom камергүй компьютер дээр тэр гарцыг олж чадаагүй — сонголт нуугдмал
 * байсан нь бодит алдаа. Одоо хоёр зам ижил түвшинд, эхний дэлгэц дээр.
 *
 * Бүртгэл (enrollment) энд ОРОХГҮЙ: олон өнцгийн зураг шаарддаг тул заавал
 * камертай төхөөрөмж дээр хийгдэнэ — сонголт өгөх нь худал амлалт болно.
 *
 * 2026-09-23 (Tom: "ene 2 shal uur ungu … ehnii ulaan tsagaan shig bolgwol"):
 * өмнөх алхам болох нууц үгийн дэлгэцтэй (`AdminPasswordStep`) НЭГ загвар —
 * цагаан карт, брэндийн зурвас, "1 → 2 → 3" диаграм. Хоёр дараалсан алхам
 * огт өөр өнгөтэй (цагаан → хар хөх) байсан нь нэг урсгал биш мэт харагдаж
 * байв. Одоо диаграм нь 1-р алхмыг дууссан, 2-р алхмыг идэвхтэй харуулна.
 */
export default function FaceMethodChooser({ tips, onUseCamera, onUsePhone }: {
  tips: readonly string[];
  onUseCamera: () => void;
  onUsePhone: () => void;
}) {
  const { user } = useAuth();
  return (
    <div className="face-gate-shell">
      <div className="face-gate-card face-gate-card--wide face-gate-card--consent">
        <div className="face-gate-brandstrip" aria-hidden="true" />
        <p className="face-gate-brand">SUGI ASAYAKE ADMIN</p>
        {user && <p className="face-gate-identity">{user.name || user.phone || `#${user.id}`}</p>}

        <h1 className="face-gate-title">Царайгаар баталгаажуулах</h1>
        <p className="face-gate-lede">Нууц үг баталгаажлаа. Одоо царайгаа аль төхөөрөмжөөр уншуулахаа сонгоно уу.</p>

        {/* Нууц үгийн дэлгэцийн ИЖИЛ диаграм: 1 дууссан, 2 идэвхтэй. */}
        <div className="face-gate-diagram" role="img" aria-label="1-р алхам нууц үг дууссан. 2-р алхам: царай. Дараа нь админ хандалт.">
          <div className="face-gate-diagram-item face-gate-step--complete">
            <span className="face-gate-diagram-icon face-gate-diagram-icon--ok"><Check size={22} aria-hidden="true" /></span>
            <span>1. Нууц үг</span>
          </div>
          <span className="face-gate-diagram-op" aria-hidden="true">→</span>
          <div className="face-gate-diagram-item face-gate-step--current">
            <span className="face-gate-diagram-icon"><ScanFace size={22} aria-hidden="true" /></span>
            <span>2. Царай</span>
          </div>
          <span className="face-gate-diagram-op" aria-hidden="true">→</span>
          <div className="face-gate-diagram-item">
            <span className="face-gate-diagram-icon face-gate-diagram-icon--ok"><ShieldCheck size={22} aria-hidden="true" /></span>
            <span>3. Админ</span>
          </div>
        </div>

        <div className="face-choice-list">
          <button type="button" className="face-choice" onClick={onUseCamera}>
            <Monitor size={20} aria-hidden="true" />
            <span>
              <strong>Энэ төхөөрөмжөөр баталгаажуулах</strong>
              <small>Энэ компьютер камертай байх шаардлагатай</small>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>

          <button type="button" className="face-choice" onClick={onUsePhone}>
            <Smartphone size={20} aria-hidden="true" />
            <span>
              <strong>Утсаараа баталгаажуулах</strong>
              <small>QR кодыг уншуулаад утсан дээрээ царайгаа уншуулна</small>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>

        <ul className="face-choice-tips">
          <li>Энэ бүртгэлийн эзэн өөрөө байх ёстой</li>
          {tips.map(tip => <li key={tip}>{tip}</li>)}
          <li>Царайны баталгаажуулалт нь аюулгүй байдлын шаардлага — алгасах боломжгүй</li>
        </ul>
      </div>
    </div>
  );
}
