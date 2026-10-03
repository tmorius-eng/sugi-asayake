/**
 * Lark-ийн мессеж карт (2026-10-03). Цэвэр функц — DB, сүлжээ хөндөхгүй.
 *
 * Outbox-ын мөрийн ЗӨВХӨН `title`, `message`, `clickPath`, `priority`-г
 * уншина. Тэдгээр нь shared/notification-events.ts-ийн PII-гүй payload-оос
 * бүтсэн (нэр, утас, хаяг огт байхгүй) тул карт ч PII-гүй.
 *
 * Бие нь `plain_text` (lark_md биш): мессеж дотор `<at>`, `<font>` зэрэг Lark
 * markdown-ий таг санамсаргүй орж ирвэл тайлбарлагдахгүй.
 */

export type CardSource = {
  title: string;
  message: string;
  clickPath: string | null;
  priority: number;
};

type HeaderTemplate = "red" | "orange" | "blue" | "green" | "grey";

function headerTemplate(priority: number): HeaderTemplate {
  if (priority >= 5) return "red";
  if (priority >= 4) return "orange";
  if (priority <= 2) return "grey";
  return "blue";
}

/** Lark-ийн картын агуулга ихдээ 30 KB; бидний мессеж богино ч хамгаалалт. */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function buildOutboxCard(source: CardSource, publicBaseUrl: string): object {
  const elements: object[] = [{ tag: "div", text: { tag: "plain_text", content: clip(source.message, 4000) } }];
  if (source.clickPath && publicBaseUrl && source.clickPath.startsWith("/")) {
    elements.push({
      tag: "action",
      actions: [{ tag: "button", type: "primary", text: { tag: "plain_text", content: "Админд нээх" }, url: `${publicBaseUrl}${source.clickPath}` }],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: { template: headerTemplate(source.priority), title: { tag: "plain_text", content: clip(source.title, 200) } },
    elements,
  };
}

export function buildTestCard(groupLabel: string, publicBaseUrl: string): object {
  return buildOutboxCard({
    title: "SUGI ASAYAKE — туршилтын мэдэгдэл",
    message: `"${groupLabel}" бүлгийн мэдэгдэл энэ чат руу ирнэ. Энэ картыг харж байгаа бол холболт ажиллаж байна.`,
    clickPath: "/admin?adminSection=integrations",
    priority: 3,
  }, publicBaseUrl);
}
