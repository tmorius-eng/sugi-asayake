// 2026-09-04 нэгдмэл байдлын аудит: яг энэ функц (эсвэл бараг ижил template-literal/
// string-concat хувилбар) нэг удаа хуваалцахын оронд 23 тусдаа файлд (client хуудас,
// client admin компонент, 2 сервер файл) бие даан хуулагдсан байв — нийтлэг primitive-
// ийн эсрэг биш хуудас хуудсаар бүтээгдсэн функцийн сурах бичгийн шинж тэмдэг. Энд
// нэг export, хаа сайгүй `@shared/format`-аар import (`@shared/catalog-filter` г.м.
// шиг client, server хоёуланд ажиллана).
export const formatMnt = (amountMnt: number) => `${new Intl.NumberFormat("mn-MN").format(amountMnt)}₮`;
