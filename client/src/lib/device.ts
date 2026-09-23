/**
 * Төхөөрөмжийн төрлийг тодорхойлох жижиг туслахууд (2026-09-23).
 */

/**
 * iPhone / iPad (iPadOS 13+ нь өөрийгөө "MacIntel" гэж танилцуулдаг тул
 * мэдрэгчтэй дэлгэцээр нь ялгана). Эдгээр дээр бүх хөтөч WebKit.
 */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/**
 * Утас эсэх: гол заагч нь хуруу (coarse) ба дэлгэц нарийн, эсвэл Apple-ийн
 * гар төхөөрөмж. Царайны хаалга үүгээр "утсаараа QR уншуулах" сонголтыг
 * нуудаг — утас өөрөө камертай тул өөр утсаар баталгаажуулах нь утгагүй бөгөөд
 * тэр товчны бичвэр ("Энэ компьютерт камер алга") утсан дээр худал байв.
 */
export function isPhoneDevice(): boolean {
  if (isAppleMobile()) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  // Android-ийн UA-CH `mobile` тэмдэг байвал түүнд итгэнэ (хэвтээ байрлалд
  // ч зөв). Байхгүй бол: гол заагч хуруу ба ЯМАР Ч hover байхгүй бөгөөд
  // дэлгэцийн богино тал нь утасных — хэвтээ утас (850–930px өргөн) өргөний
  // шалгуураар унаж QR сонголт буцаж гарч ирдэг байв (2026-09-23).
  const uaMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (typeof uaMobile === "boolean") return uaMobile;
  return window.matchMedia("(pointer: coarse) and (any-hover: none) and ((max-width: 820px) or (max-height: 500px))").matches;
}
