import { Copy, Gift } from "lucide-react";
import { toast } from "sonner";
import { formatMnt } from "@shared/format";
import { GIFT_CARD_VALIDITY_MONTHS } from "@shared/gift-cards";

/**
 * Gift cards sold at checkout (2026-09-14): what the buyer sees on an order
 * (profile order history, guest order tracking). Before the order is paid
 * the line items already say a card was bought, so this promises the code;
 * after payment the codes themselves are here, each with a copy button.
 */
type Card = { code: string; amountMnt: number; status: "active" | "redeemed" | "void"; expiresAt: Date | string | null };

const STATUS_LABEL: Record<Card["status"], string> = { active: "Ашиглаагүй", redeemed: "Ашигласан", void: "Хүчингүй" };

async function copyCode(code: string) {
  try {
    // navigator.clipboard is secure-context only; a plain http LAN page has none.
    if (navigator.clipboard) await navigator.clipboard.writeText(code);
    else throw new Error("no clipboard");
    toast.success(`${code} хуулагдлаа.`);
  } catch {
    toast.message(code, { description: "Кодыг гараар хуулна уу." });
  }
}

export default function GiftCardCodes({ cards, pendingCount }: { cards: Card[]; pendingCount: number }) {
  if (!cards.length && pendingCount <= 0) return null;
  return (
    <div className="gift-codes" aria-label="Бэлгийн карт">
      <p className="gift-codes-title"><Gift size={14} /> Бэлгийн карт</p>
      {cards.length ? (
        <ul className="gift-codes-list">
          {cards.map(card => (
            <li key={card.code} className={`gift-code gift-code-${card.status}`}>
              <code>{card.code}</code>
              <span className="gift-code-amount">{formatMnt(card.amountMnt)}</span>
              <span className="gift-code-status">{STATUS_LABEL[card.status]}</span>
              {card.status === "active" && <button type="button" className="gift-code-copy" onClick={() => void copyCode(card.code)} aria-label={`${card.code} хуулах`}><Copy size={13} /> Хуулах</button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="gift-codes-pending">{`Төлбөр баталгаажмагц ${pendingCount} картын код энд, имэйл болон push мэдэгдлээр ирнэ.`}</p>
      )}
      {cards.length > 0 && <p className="gift-codes-hint">{`Кодыг Профайл → Гишүүнчлэл → "Бэлгийн карт ашиглах" хэсэгт оруулахад дүн дэлгүүрийн зээл болно. Хүчинтэй хугацаа ${GIFT_CARD_VALIDITY_MONTHS} сар.`}</p>}
    </div>
  );
}
