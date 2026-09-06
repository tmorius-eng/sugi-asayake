import { Facebook, Instagram } from "lucide-react";
import type { FooterSocial } from "@/components/SiteFooter";

// Tom, 2026-09-05: SiteFooter was already built "ready to drop onto another
// page later" (see its own header comment), but logoUrl/socials only ever
// existed as Home.tsx-local consts -- every other page adding the footer
// would otherwise redeclare the same logo path and the same 2 real social
// links, risking exactly the kind of drift categories-data.ts/
// locations-data.ts already exist to prevent. Single source of truth,
// same pattern.
export const footerLogoUrl = "/cdn/sugi-logo-transparent-clean_fee66cad.png";

export const footerSocials: FooterSocial[] = [
  { label: "Facebook", href: "https://www.facebook.com/AsayakeJapaneseDrugstore/", Icon: Facebook },
  { label: "Instagram", href: "https://www.instagram.com/asayake_japan_cosmetics/", Icon: Instagram },
];
