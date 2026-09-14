// 2026-09-07: үүнээс өмнө сервер талын slug үүсгэлт хаана ч байсангүй (slug-тай
// байгаа бүх entity — бараа, нийтлэл, routine — client-ээс аль хэдийн тооцсон slug
// авдаг, бичсэн эсвэл client талд авто бөглөгдсөн; AdminWorkspace.tsx, AdminOperations
// Panel.tsx-ийн давхардсан inline `slugify`). Нийтлэлийн ангилал/tag нь slug нь сервер
// талд үүсдэг эхний entity (admin зөвхөн нэр бичнэ) тул энэ нь байгаа client талын
// хуулбаруудын refactor биш, жинхэнэ шинэ хэрэгцээ.
export function slugify(value: string): string {
  return value
    .toLocaleLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
