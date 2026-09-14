// 2026-09-07 (Tom, bsb.mn лавлагаа, шууд): context provider эсвэл prop-оор
// дамжуулсан callback биш, энгийн custom-event dispatch — сайтын сагсанд нэмэх
// бүх цэг (ProductDetail-ийн үндсэн товч ба mobile sticky bar, QuickViewDialog,
// RoutineCrossSell, Profile-ийн "дахин захиалах", BottomNavBar-ийн сагсны урсгал)
// App.tsx-ээс ойр нийтлэг эцэггүй өөр өөр файл/компонентын модонд байдаг бөгөөд
// энэ төслийн яг ийм асуудалд тогтсон загвар (SitePromo, BottomNavBar) нь давхарга
// бүрээр callback дамжуулахын оронд нэг үргэлж mount-лагдсан listener юм.
// Listener-ийг AddedToCartToast.tsx-ээс үзнэ (App.tsx-д нэг удаа mount).
export const ADDED_TO_CART_EVENT = "sugi:added-to-cart";

export function notifyAddedToCart(message: string) {
  window.dispatchEvent(new CustomEvent<{ message: string }>(ADDED_TO_CART_EVENT, { detail: { message } }));
}
