import { LARK_CHAT_FIELD, NOTIFICATION_GROUPS, parseDisabledEvents, type NotificationGroup } from "../../../shared/notification-events";
import { LARK_DEFAULT_DOMAIN, LARK_DOMAINS } from "../../../shared/integrations";
import { getIntegrationSettings } from "../../db";

export type LarkConfig = {
  appId: string;
  appSecret: string;
  domain: string;
  chats: Partial<Record<NotificationGroup, string>>;
  disabledEvents: Set<string>;
};

/** Хадгалсан тохиргооноос Lark-ийн клиент үүсгэхэд хэрэгтэйг уншина. App ID,
 *  нууц хоёрын аль нэг нь дутуу бол null. `requireActive` — автомат илгээлт
 *  "Идэвхтэй" toggle-ийг хүндэтгэнэ, тест товч хүндэтгэхгүй. */
export async function readLarkConfig({ requireActive }: { requireActive: boolean }): Promise<LarkConfig | null> {
  const current = await getIntegrationSettings("lark");
  if (!current || (requireActive && !current.isActive)) return null;
  return larkConfigFromSettings(current.settings);
}

export function larkConfigFromSettings(settings: Record<string, string>): LarkConfig | null {
  const appId = settings.appId?.trim();
  const appSecret = settings.appSecret?.trim();
  if (!appId || !appSecret) return null;
  // validateIntegrationSettings хадгалахад шалгадаг ч энд ДАХИН — хуучин
  // дүрмээр хадгалагдсан утга нууцыг өөр хост руу явуулах ёсгүй.
  const rawDomain = (settings.domain?.trim() || LARK_DEFAULT_DOMAIN).replace(/\/+$/, "");
  const domain = (LARK_DOMAINS as readonly string[]).includes(rawDomain) ? rawDomain : LARK_DEFAULT_DOMAIN;
  const chats: Partial<Record<NotificationGroup, string>> = {};
  for (const group of NOTIFICATION_GROUPS) {
    const chatId = settings[LARK_CHAT_FIELD[group]]?.trim();
    if (chatId) chats[group] = chatId;
  }
  return { appId, appSecret, domain, chats, disabledEvents: parseDisabledEvents(settings.disabledEvents) };
}
