import { LarkApiError, type LarkBotInfo, type LarkChat, type LarkClient } from "./client";

/**
 * Тестийн Lark клиент (2026-10-03) — сүлжээ огт хөндөхгүй. Илгээсэн картуудыг
 * `sent`-д хадгалж, `failNext`-ээр алдаа тарьж болно.
 */
export class FakeLarkClient implements LarkClient {
  readonly sent: { chatId: string; card: object; uuid?: string }[] = [];
  chats: LarkChat[] = [];
  bot: LarkBotInfo = { name: "SUGI тест бот", openId: "ou_fake", active: true };
  private failures: Error[] = [];

  /** Дараагийн sendCard дуудлага энэ алдааг шиднэ. */
  failNext(error: Error = new LarkApiError("network", null, null, false)) { this.failures.push(error); }

  async botInfo() { return this.bot; }
  async listChats() { return [...this.chats]; }

  async sendCard(chatId: string, card: object, uuid?: string) {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push({ chatId, card, uuid });
    return { messageId: `om_fake_${this.sent.length}` };
  }

  async request<T>(): Promise<T> {
    throw new Error("FakeLarkClient.request: тест энэ дуудлагыг тохируулаагүй.");
  }
}
