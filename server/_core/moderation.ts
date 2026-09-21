/**
 * Харилцагчийн бичсэн контентын текстийн moderation (2026-09-13).
 *
 * Tom: зөвхөн худалдан авагч сэтгэгдэл бичнэ, гэхдээ худалдан авагч ч юу ч бичиж
 * болно — дэлгүүр "англи, орос, хятад, улс бүрийн хараал"-ыг хүн шиг шинжилж
 * татгалзах ёстой, гэнэн яг-үг шүүлт биш.
 *
 * Дарааллаар хоёр давхарга:
 *
 *  1. Локал, үргэлж асаалттай lexical шүүлт. Текстийг эхлээд нормчилно (Unicode
 *     NFKC, жижиг үсэг, латин ижил дүрс ба leetspeak fold, үсэг хоорондын
 *     тусгаарлагч арилгах — "f.u.c.k", латин y-тэй "хyй", "s h i t" бүгд энгийн
 *     үг болж уншигдана), дараа нь монгол (кирилл ба хүмүүсийн бодитоор бичдэг
 *     латин галиг), орос, англи, хятад, япон, солонгос язгуурын pattern-тай тулгана.
 *     Язгуур үгийн эхэнд таардаг тул дагавартай хэлбэр ("новштой", "fucking")
 *     тоологдож, anchor-той тул "class", "Scunthorpe" тоологдохгүй.
 *
 *  2. ANTHROPIC_API_KEY тохируулсан үед сэтгэгдлийг moderator шиг уншдаг гадны
 *     хэлний загварын дуудлага — хараалгүй доромжлол, заналхийлэл, бэлгийн агуулга,
 *     үзэн ядалт, ямар ч хэлний дарамт — шийдвэр буцаана. Түлхүүргүй бол энэ давхарга
 *     алгасагдана; түлхүүртэй үед API-ийн алдаа log-логдож lexical шийдвэр хүчинтэй
 *     (зөвхөн AI давхарга fail-open, lexical хэзээ ч биш) тул вендорын тасалдал
 *     харилцагчийг сэтгэгдэл бичихээс зогсоохгүй.
 *
 * Шийдвэрүүд зөвхөн ангиллаараа (бүтэн текст биш) бүртгэгдэнэ — log хараалын архив
 * болохгүй.
 */

import Anthropic from "@anthropic-ai/sdk";
import { categoryFromClassifier, screenTextWithApi } from "./moderationApi";
import { screenTextWithModel } from "./moderationModel";

export type ModerationVerdict =
  | { allowed: true }
  | { allowed: false; category: ModerationCategory; source: "lexical" | "model" | "api" | "ai"; reason?: string };

export type ModerationCategory = "profanity" | "insult" | "harassment" | "hate" | "sexual" | "threat" | "spam";

/** Shown to the customer. Deliberately does not echo the offending word. */
export const MODERATION_REJECT_MESSAGE = "Сэтгэгдэлд хараал, доромжлол эсвэл зохисгүй үг илэрсэн тул нийтлэх боломжгүй. Бүтээгдэхүүний тухай эелдэг үгээр бичнэ үү.";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Latin look-alikes and leetspeak that people use to slip past filters,
 *  folded onto the plain letter. Cyrillic text stays Cyrillic; Latin text
 *  stays Latin -- only characters that are ambiguous or decorative fold. */
const FOLD: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "l", "+": "t",
  // Latin letters typed into Cyrillic words (identical glyphs on a keyboard).
  "a": "a", "e": "e", "o": "o", "p": "p", "c": "c", "y": "y", "x": "x", "k": "k", "m": "m", "h": "h", "t": "t", "b": "b",
};

/** Characters that only ever separate letters in evasion ("f.u.c.k",
 *  "х-у-й", "s h i t") -- removed before matching. Real word breaks are
 *  kept via the second pass, which matches on the space-joined form too. */
const SEPARATORS = /[\s.\-_*·•~^'"`´‘’“”,;:()[\]{}<>\\/|]+/g;

export function normaliseForModeration(text: string): { joined: string; spaced: string } {
  const base = text.normalize("NFKC").toLowerCase();
  let folded = "";
  for (const ch of base) folded += FOLD[ch] ?? ch;
  // Collapse runs of the same letter ("fuuuck", "пиздееец") to at most two.
  const squeezed = folded.replace(/(.)\1{2,}/gu, "$1$1");
  return {
    joined: squeezed.replace(SEPARATORS, ""),
    spaced: squeezed.replace(SEPARATORS, " ").replace(/\s+/g, " ").trim(),
  };
}

// ---------------------------------------------------------------------------
// Lexicon. Roots, not exact words: each entry matches at the start of a
// word (spaced form) or anywhere (joined form, which has no word breaks
// left). Kept as regex source strings so suffix classes can be expressed.
//
// Mongolian entries carry BOTH the Cyrillic spelling and the Latin
// transliterations used on phones without a Cyrillic keyboard. The list is
// the common core of actual abuse seen in Mongolian comment sections; it is
// not exhaustive and the AI layer exists for what it misses.
// ---------------------------------------------------------------------------

type LexEntry = { pattern: RegExp; category: ModerationCategory; lang: string };

const rx = (source: string, flags = "u") => new RegExp(source, flags);

const LEXICON: LexEntry[] = [
  // --- Mongolian (Cyrillic) -------------------------------------------------
  { pattern: rx("(^|\\s)(хуй|хүй|хуйс|пизд|пизад|бөгс|бөөс|новш|новшт|шаа|шаах|шаачих|шаагаад|шаагаа|мангар|тэнэг|гичий|гичии|янхан|хаяг|пись|аль(?:н|д)(?=\\s|$)|бүрх|ааль|мөн[ий]й?х)", "u"), category: "profanity", lang: "mn" },
  { pattern: rx("(^|\\s)(муухай амьтан|муу амьтан|амьтан минь|үхсэн ч|үх(?:ээрэй|ээд| )|алчих|алъя|алах гэж)", "u"), category: "threat", lang: "mn" },
  { pattern: rx("(^|\\s)(тэнэг|мангар|дэмий|мулгуу|солиотой|галзуу|дүлий|хог|новш|бузар|ялгасан|оймс|мөлхөө|царай муутай|тарган гахай|гахай)(?:\\S*)?(?=\\s|$)", "u"), category: "insult", lang: "mn" },
  // --- Mongolian (Latin transliteration) ------------------------------------
  { pattern: rx("(^|\\s)(huy|hui|huiy|pizd|piz d|bogs|bugs|novsh|shaa|shaach|shaag|mangar|teneg|gichii|gichi|yanhan|pis|bvrh|burh|mvnii|aali)(?:\\S*)?(?=\\s|$)", "u"), category: "profanity", lang: "mn-latin" },
  { pattern: rx("(^|\\s)(teneg|mangar|demii|mulguu|soliotoi|galzuu|hog|novsh|buzar|gahai|tarhi gui|tarhigui)(?:\\S*)?(?=\\s|$)", "u"), category: "insult", lang: "mn-latin" },
  // --- Russian ----------------------------------------------------------------
  { pattern: rx("(^|\\s)(хуй|хуе|хуё|хуя|пизд|ебан|ебат|ебал|ёб|еба|бляд|блят|бля(?=\\s|$)|сука|суки|сучк|мудак|мудил|пидор|пидар|гандон|говн|дерьм|залуп|шлюх|дроч|жоп|срань|нахуй|похуй|хер(?=\\s|$)|хрен(?=\\s|$))", "u"), category: "profanity", lang: "ru" },
  { pattern: rx("(^|\\s)(урод|дебил|идиот|тупой|тупая|тупиц|даун|кретин|ублюд|тварь|скотин|мразь|чмо|лох(?=\\s|$)|чурк|хач(?=\\s|$)|хачи|жид|нигер|негр(?=\\s|$)|обезьян)", "u"), category: "insult", lang: "ru" },
  { pattern: rx("(^|\\s)(убью|убить тебя|сдохни|сдохн|зарежу|найду тебя)", "u"), category: "threat", lang: "ru" },
  // --- English ----------------------------------------------------------------
  { pattern: rx("(^|\\s)(fuck|fuk|fck|shit|shyt|bitch|biatch|cunt|dick|cock|pussy|asshole|arsehole|motherf|mofo|bastard|whore|slut|wank|jerkoff|bullshit|bs(?=\\s|$)|dumbass|jackass|prick(?=\\s|$)|twat|douche|piss(?:ed)?(?=\\s|$)|crap(?=\\s|$))(?:\\S*)?(?=\\s|$)", "u"), category: "profanity", lang: "en" },
  { pattern: rx("(^|\\s)(idiot|moron|retard|stupid|dumb|loser|scum|trash(?=\\s|$)|garbage(?=\\s|$)|ugly|fat pig|pig(?=\\s|$)|clown(?=\\s|$)|worthless|pathetic|disgusting)(?:\\S*)?(?=\\s|$)", "u"), category: "insult", lang: "en" },
  { pattern: rx("(^|\\s)(nigg|chink|gook|kike|spic(?=\\s|$)|wetback|faggot|fag(?=\\s|$)|tranny|raghead|towelhead)", "u"), category: "hate", lang: "en" },
  { pattern: rx("(^|\\s)(kill you|i will kill|gonna kill|kill yourself|kys(?=\\s|$)|die(?=\\s|$)|go die|hunt you down|find you and)", "u"), category: "threat", lang: "en" },
  // --- Chinese (no word breaks; matched on the joined form) -----------------
  { pattern: rx("(操你|草你|肏|傻逼|傻屄|沙比|煞笔|他妈的|他媽的|妈的|媽的|去死|滚开|滾開|狗屎|贱人|賤人|婊子|妓女|王八蛋|混蛋|白痴|脑残|腦殘|废物|廢物|垃圾人|畜生|尼玛|你妈|你媽|艹|靠北|干你|幹你|操|屌你|仆街|扑街)", "u"), category: "profanity", lang: "zh" },
  // --- Japanese ---------------------------------------------------------------
  { pattern: rx("(死ね|しね|殺す|ころす|くたばれ|クソ|糞|ばか|バカ|馬鹿|あほ|アホ|阿呆|きもい|キモい|うざい|ウザい|ブス|デブ|くず|クズ|ゴミ|ちんこ|まんこ|セックス|やりまん|変態)", "u"), category: "profanity", lang: "ja" },
  // --- Korean -----------------------------------------------------------------
  { pattern: rx("(씨발|시발|씨팔|ㅅㅂ|ㅆㅂ|개새끼|개새|병신|븅신|ㅂㅅ|지랄|미친|미틴|꺼져|닥쳐|죽어|뒤져|년(?=\\s|$)|놈(?=\\s|$)|보지|자지|좆|섹스|걸레)", "u"), category: "profanity", lang: "ko" },
];

/** Words the root patterns above would otherwise catch inside legitimate
 *  product talk. Checked on the spaced form before the lexicon runs. */
const ALLOW: RegExp[] = [
  /(^|\s)class(?:ic|y)?(?=\s|$)/u, /(^|\s)assort/u, /(^|\s)assist/u, /(^|\s)bass(?=\s|$)/u, /(^|\s)mass(?:age)?(?=\s|$)/u, /(^|\s)shittake(?=\s|$)/u, /(^|\s)shiitake(?=\s|$)/u,
  /(^|\s)hell(?:o)?(?=\s|$)/u, /(^|\s)scunthorpe(?=\s|$)/u, /(^|\s)cocktail(?=\s|$)/u, /(^|\s)peacock(?=\s|$)/u, /(^|\s)dickens(?=\s|$)/u,
  /(^|\s)пис(?:ать|ьмо)/u, // "письмо" (letter), not "пись"
];

/**
 * The always-on lexical screen. Pure and synchronous; unit-tested in
 * server/moderation.test.ts against every language listed above and the
 * evasion tricks people actually use.
 */
const SPAM = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|telegram|whatsapp|viber)/iu;

export function screenTextLexically(text: string): ModerationVerdict {
  if (SPAM.test(text)) return { allowed: false, category: "spam", source: "lexical" };
  const { joined, spaced } = normaliseForModeration(text);
  if (!spaced) return { allowed: true };
  const spacedSafe = ALLOW.reduce((s, allow) => s.replace(allow, " "), spaced);
  for (const entry of LEXICON) {
    // Languages without word breaks (zh/ja/ko) match the joined form; the
    // rest match the spaced form so "assist" does not contain "ass".
    const haystack = entry.lang === "zh" || entry.lang === "ja" || entry.lang === "ko" ? joined : spacedSafe;
    if (entry.pattern.test(haystack)) return { allowed: false, category: entry.category, source: "lexical" };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// AI layer (optional, ANTHROPIC_API_KEY).
// ---------------------------------------------------------------------------

const MODERATION_SYSTEM = `You are the content moderator for an online shop in Ulaanbaatar, Mongolia. Customers write product reviews in Mongolian (Cyrillic or Latin transliteration), Russian, English, Chinese, Japanese, Korean or a mix.

Decide whether ONE review may be published. Reject when it contains, in any language or transliteration:
- profanity or obscenity, including disguised spellings (h-u-y, f*ck, п и з д а)
- insults or degrading remarks about a person, staff, other customers or groups
- harassment, threats, or wishing harm
- hate speech or slurs (ethnicity, nationality, religion, gender, disability, sexuality)
- sexual content
- spam, contact harvesting, links to other shops

Allow ordinary negative reviews: "терrible product, waste of money", "the cream did nothing for me", "delivery was late" are ALLOWED -- criticism of the product or service is not abuse.

Answer with JSON only, no prose: {"allowed": true} or {"allowed": false, "category": "profanity|insult|harassment|hate|sexual|threat|spam", "reason": "<short English reason>"}`;

let client: Anthropic | null = null;
function anthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ timeout: 10_000, maxRetries: 1 });
  return client;
}

/** Whether the AI layer is configured -- shown in the admin System Health card. */
export function isAiModerationEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function screenTextWithAi(text: string): Promise<ModerationVerdict | null> {
  const api = anthropicClient();
  if (!api) return null;
  try {
    const response = await api.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 256,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // A short classification: low effort keeps it fast and cheap.
      output_config: { effort: "low" },
      system: [{ type: "text", text: MODERATION_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `<review>\n${text}\n</review>` }],
    });
    if (response.stop_reason === "refusal") {
      // The classifier itself declined (extremely unusual for a review);
      // treat as not publishable rather than guessing.
      return { allowed: false, category: "harassment", source: "ai", reason: "classifier refusal" };
    }
    const textBlock = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text");
    const raw = textBlock?.text.trim() ?? "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { allowed: boolean; category?: ModerationCategory; reason?: string };
    if (parsed.allowed) return { allowed: true };
    return { allowed: false, category: parsed.category ?? "insult", source: "ai", reason: parsed.reason };
  } catch (error) {
    console.error("[moderation] AI layer unavailable; lexical verdict stands.", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Full screen: lexical first (always), then AI when configured. The first
 * layer that rejects wins; a text passes only if every configured layer
 * allows it.
 */
export async function screenText(text: string): Promise<ModerationVerdict> {
  const lexical = screenTextLexically(text);
  if (!lexical.allowed) return lexical;
  // In-process multilingual BERT (moderationModel.ts): insults with no swear
  // word, in the 15 languages it was trained on. No service, no Docker.
  const model = await screenTextWithModel(text);
  if (model?.toxic) return { allowed: false, category: "insult", source: "model", reason: `toxic ${model.score.toFixed(2)}` };
  // LocalMod (self-hosted, MODERATION_API_URL) -- English semantic judgement
  // plus spam/NSFW text; see moderationApi.ts for its language limits.
  const api = await screenTextWithApi(text);
  if (api?.flagged) return { allowed: false, category: categoryFromClassifier(api.classifier), source: "api", reason: `${api.classifier} ${api.confidence?.toFixed(2) ?? ""}`.trim() };
  const ai = await screenTextWithAi(text);
  return ai ?? { allowed: true };
}
