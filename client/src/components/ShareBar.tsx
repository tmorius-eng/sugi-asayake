import { useState } from "react";
import { Check, Facebook, Link2, Send, Share2 } from "lucide-react";
import { useT } from "@/hooks/useLocale";

/**
 * "Share this product" row on the product page (2026-09-14, Tom: "baraa
 * buriin page bur deer share to social gesen option nem").
 *
 * Two layers. On a phone (or any browser with the Web Share API) the first
 * button opens the OS share sheet -- Messenger, Instagram DM, Telegram,
 * whatever the customer actually uses -- with the product title and URL.
 * Everywhere else, and always as a fallback, the explicit targets that work
 * as plain links: Facebook, X, Telegram, plus "copy link".
 *
 * The picture the receiving platform shows is NOT chosen here: crawlers
 * read the og:image the SERVER puts in this page's <head> (see
 * server/_core/routeMeta.ts), which is the product's own photo. Nothing in
 * the browser can influence that, which is why the server does it.
 *
 * Secure-context APIs (navigator.share, navigator.clipboard) are guarded:
 * on the office LAN over plain http they do not exist (2026-09-12 lesson).
 */
export default function ShareBar({ title, url }: { title: string; url?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url: shareUrl });
    } catch {
      // The user dismissed the sheet, or the platform refused; nothing to report.
    }
  };

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareUrl);
      else {
        const input = document.createElement("input");
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(t("Холбоосыг хуулна уу:"), shareUrl);
    }
  };

  const targets = [
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: <Facebook size={15} aria-hidden="true" /> },
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`, icon: <span aria-hidden="true" className="share-x">𝕏</span> },
    { key: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`, icon: <Send size={15} aria-hidden="true" /> },
  ];

  return (
    <div className="share-bar" role="group" aria-label={t("Хуваалцах")}>
      {!canNativeShare && <span className="share-bar-label">{t("Хуваалцах")}</span>}
      {canNativeShare && (
        <button type="button" className="share-btn share-btn-primary" onClick={nativeShare} aria-label={t("Хуваалцах")}>
          <Share2 size={15} aria-hidden="true" /><span>{t("Хуваалцах")}</span>
        </button>
      )}
      {targets.map(target => (
        <a key={target.key} className="share-btn" href={target.href} target="_blank" rel="noopener noreferrer" aria-label={`${target.label} — ${t("хуваалцах")}`} title={target.label}>
          {target.icon}
        </a>
      ))}
      <button type="button" className="share-btn" onClick={copy} aria-label={t("Холбоос хуулах")} title={t("Холбоос хуулах")}>
        {copied ? <Check size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
      </button>
      <span className="share-bar-status" aria-live="polite">{copied ? t("Холбоос хуулагдлаа") : ""}</span>
    </div>
  );
}
