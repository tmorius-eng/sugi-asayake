/**
 * `html { scroll-behavior: smooth }`-ийг давдаг шууд scroll (2026-09-12). Утасны
 * хоёр bug нэг үндэстэй: документын өндөр өөрчлөгдөж байхад animation хийж буй
 * smooth scroll-ийг хөтөч clamp/cancel хийдэг (/shop дээр хэмжсэн: grid skeleton
 * болж unmount хийгдэж, хуудас animation дундуур 8170-оос 4414 px болж багассан).
 * Яг нэг газар буух ёстой scroll — шинэ route-ийн дээд, "Дараах" дээрх grid-ийн
 * дээд — тиймээс шууд байж, render-ийн ДАРАА хийгдэх ёстой.
 *
 * Нэг frame-ийн турш inline `scroll-behavior: auto` тавих нь anchor линк, back-to-
 * top товчны хүсдэг global smooth дүрмийг хэвээр үлдээгээд `scrollTo`-г шууд
 * болгох цорын ганц найдвартай арга.
 */
export function scrollToNow(top: number) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top, left: 0, behavior: "auto" });
  requestAnimationFrame(() => { root.style.scrollBehavior = previous; });
}

/** Height of a sticky/fixed <header>, so content scrolled "to the top" is
 *  not hidden under it. 0 when the header scrolls with the page. */
export function stickyHeaderOffset(): number {
  const header = document.querySelector("header");
  if (!header) return 0;
  const position = getComputedStyle(header).position;
  if (position !== "sticky" && position !== "fixed") return 0;
  return Math.ceil(header.getBoundingClientRect().height);
}

/** Put `element`'s top edge just under the sticky header, instantly. */
export function scrollElementToTopNow(element: HTMLElement, extraGap = 8) {
  const top = element.getBoundingClientRect().top + window.scrollY - stickyHeaderOffset() - extraGap;
  scrollToNow(Math.max(0, top));
}
