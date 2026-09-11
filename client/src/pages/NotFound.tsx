import { ArrowLeft, Compass } from "lucide-react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { useSiteText } from "@/hooks/useSiteText";
import { Link } from "wouter";
import SiteFooter from "@/components/SiteFooter";

export default function NotFound() {
  const textFor = useSiteText();
  useDocumentMeta(textFor("seo-text-notfound-title", "Хуудас олдсонгүй — SUGI ASAYAKE"), null);
  return (
    <div className="notfound-shell">
      <div className="notfound-card">
        <p className="eyebrow" style={{ justifyContent: "center" }}><span /> SUGI ASAYAKE</p>
        <div className="notfound-code">404</div>
        <h1>{textFor("notfound-text-heading", "Энэ хуудас олдсонгүй.")}</h1>
        <p>{textFor("notfound-text-description", "Холбоос буруу байж болзошгүй, эсвэл хуудас зөөгдсөн байна. Нүүр хуудас руу буцаж дахин хайж үзээрэй.")}</p>
        <div className="notfound-actions">
          <Link href="/" className="button button-primary"><ArrowLeft size={15} /> Нүүр хуудас руу буцах</Link>
          <Link href="/shop" className="quiet-link"><Compass size={14} /> Дэлгүүр үзэх</Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
