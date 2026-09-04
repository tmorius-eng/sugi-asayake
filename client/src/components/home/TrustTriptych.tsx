import type { LucideIcon } from "lucide-react";

// NEWVISION.md Tier 2: a low-page trust strip (Isetan's reference layout),
// reusing .membership-strip/.membership-panel -- CSS that already existed
// in index.css but had nothing rendering it (the old membership promo panel
// these classes were built for was replaced by QuickStatsSection's real
// server-authoritative data). Genuinely idle styling, not a duplicate.
export type TrustTriptychItem = { Icon: LucideIcon; title: string; description: string };

export default function TrustTriptych({ items }: { items: [TrustTriptychItem, TrustTriptychItem, TrustTriptychItem] }) {
  return (
    <div className="membership-strip" data-reveal>
      {items.map(item => (
        <div className="membership-panel" key={item.title}>
          <item.Icon size={22} />
          <div><strong>{item.title}</strong><span>{item.description}</span></div>
        </div>
      ))}
    </div>
  );
}
