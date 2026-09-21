/*
 * Серверийн зурсан нүүрний shell (server/_core/heroShell.ts) дээрх зарын
 * зурвас: хэрэглэгч энэ session-д "Зарыг хаах" дарсан бол (SitePromo.tsx-ийн
 * sessionStorage түлхүүр) React ирэхээс өмнө устгана — эс бөгөөс зурвас нэг
 * агшин гарч ирээд алга болж, толгой 40px дээшээ үсэрнэ.
 *
 * Файл, inline биш: CSP `script-src 'self'` (theme-init.js-тэй ижил шалтгаан).
 * `defer`: parser-ийг хаахгүй (sync байхад DOMContentLoaded ~35 мс хойшилж,
 * Lighthouse-ийн загварт ×4 болж тоологддог байв), гэхдээ баримт бүрэн
 * уншигдмагц, аппын module script-ээс ӨМНӨ (баримтын дараалал) ажиллана —
 * React ирэхээс өмнө зурвасыг устгах баталгаа хэвээр; хамгийн муудаа
 * хаасан зурвас нэг frame харагдана. Keep in sync: dismissedKey in
 * client/src/components/SitePromo.tsx.
 */
(function () {
  try {
    var bar = document.querySelector("#hero-shell [data-promo-id]");
    if (bar && sessionStorage.getItem("sugi-promo-dismissed-" + bar.getAttribute("data-promo-id")) === "1") {
      bar.parentNode.removeChild(bar);
    }
  } catch (error) { /* хувийн цонх: зурвас үлдэнэ */ }
})();
