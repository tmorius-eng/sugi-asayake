import { MessageCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useShopContact } from "@/hooks/useShopContact";

/**
 * Floating "chat with us" button (2026-09-14): opens the shop's Facebook
 * page in Messenger (m.me), the channel most shoppers here already use.
 * Derived from the Facebook URL in /admin (same rule as /help), so an
 * admin who removes the URL removes the button. A plain link, not Meta's
 * chat plugin: no third-party script, nothing loads before a click, and
 * it works under the site's CSP. Bottom-right above the back-to-top button;
 * hidden in /admin, /checkout (nothing may cover the order button) and on
 * the help page, which already has the link.
 */
export function messengerUrlFrom(facebookUrl: string | null): string | null {
  if (!facebookUrl) return null;
  const match = facebookUrl.match(/facebook\.com\/([A-Za-z0-9.]+)\/?/i);
  return match && !/^(profile\.php|pages|people|groups)$/i.test(match[1]) ? `https://m.me/${match[1]}` : null;
}

export default function MessengerButton() {
  const [location] = useLocation();
  const { facebookUrl } = useShopContact();
  const url = messengerUrlFrom(facebookUrl);
  if (!url || location.startsWith("/admin") || location.startsWith("/checkout") || location.startsWith("/help")) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="messenger-fab" aria-label="Messenger-ээр бидэнтэй чатлах">
      <MessageCircle size={20} aria-hidden="true" />
      <span className="messenger-fab-label">Чат</span>
    </a>
  );
}
