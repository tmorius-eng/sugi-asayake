import { useStoreSetting } from "@/hooks/useStoreSetting";
import { getStoreSettingSlot } from "@shared/store-settings";

export type ShopContact = {
  /** Human-readable, e.g. "9450-9911". */
  phone: string;
  /** Digits only, for a `tel:` href. */
  phoneHref: string;
  email: string;
  hours: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
};

/**
 * The shop's own contact facts, from /admin -> Дэлгүүрийн тохиргоо ->
 * Холбоо барих (2026-09-12).
 *
 * Before this existed the phone number was hardcoded in 9 files and 17
 * separate places (footer, store locator, /shop CTA, profile support tab,
 * all three legal pages, the homepage CTA banner, index.html's structured
 * data), the email in 3, and the opening hours in a code constant. Changing
 * the shop's number meant a deploy that touched every page.
 *
 * A social URL is treated as "not set" unless it actually looks like a link.
 * store_settings rejects empty values (a blank row would be ambiguous with
 * "never configured"), so hiding an icon is expressed by typing something
 * that is not a URL -- "-" is what the field's admin help text suggests.
 */
const asLink = (value: string): string | null => (/^https?:\/\//i.test(value.trim()) ? value.trim() : null);

export function useShopContact(): ShopContact {
  const valueForSetting = useStoreSetting();
  const fallback = (key: Parameters<typeof getStoreSettingSlot>[0]) => getStoreSettingSlot(key).fallbackValue;

  return {
    phone: valueForSetting("contact-phone", fallback("contact-phone")),
    phoneHref: valueForSetting("contact-phone-tel", fallback("contact-phone-tel")),
    email: valueForSetting("contact-email", fallback("contact-email")),
    hours: valueForSetting("contact-branch-hours", fallback("contact-branch-hours")),
    facebookUrl: asLink(valueForSetting("contact-facebook-url", fallback("contact-facebook-url"))),
    instagramUrl: asLink(valueForSetting("contact-instagram-url", fallback("contact-instagram-url"))),
  };
}
