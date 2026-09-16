import { ArrowRight, Monitor, ScanFace, Smartphone } from "lucide-react";

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
 */
export default function FaceMethodChooser({ tips, onUseCamera, onUsePhone }: {
  tips: readonly string[];
  onUseCamera: () => void;
  onUsePhone: () => void;
}) {
  return (
    <div className="face-gate-shell face-gate-shell--dark">
      <div className="face-gate-card face-gate-card--wide face-gate-card--scan">
        <div className="face-gate-head">
          <ScanFace size={20} aria-hidden="true" />
          <div>
            <h2>Царайгаар баталгаажуулах</h2>
            <p className="face-gate-muted">Админ хэсэгт нэвтрэхийн тулд шаардлагатай</p>
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
