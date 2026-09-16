/**
 * Storefront-ийн хэлүүд (2026-09-12, Tom: "translate hiideg button hiilgmeer baina
 * ... dotorn english bas japanese baih ystoi").
 *
 * Хэрхэн ажилладаг, санаатайгаар юу ХИЙДЭГГҮЙ:
 *
 *   - Сайт монголоор бичигдсэн. Шошго бүрийг зохиомол id-аар түлхүүрлэхийн оронд
 *     монгол мөр ӨӨРӨӨ түлхүүр: `t("Дэлгүүр")` "Shop" эсвэл "ショップ" буцааж,
 *     бичлэггүй хэллэгт монголоороо буцна. Дутуу орчуулга нүцгэн түлхүүр биш анхны
 *     үг рүү буурна, шинэ текст ажиллахын тулд нэмэлт холболт хэрэггүй гэсэн үг.
 *   - ДЭЛГҮҮРИЙН ӨӨРИЙН ҮГСИЙГ хамарна: цэс, товч, хэсгийн гарчиг, формын шошго,
 *     footer. Каталогийн өгөгдлийг орчуулахгүй — барааны нэр, тайлбар, брэнд DB-д
 *     нэг хэлээр байдаг, тэдгээрийг орчуулахад хэл бүрийн багана, бөглөх admin дэлгэц
 *     хэрэгтэй, тусдаа ажил.
 *   - Admin-ийн оруулсан текст (site-text slot) одоогийн утга нь энд бичлэгтэй
 *     таарвал орчуулагдана; сайттай хамт ирсэн fallback-ууд бүгд таардаг.
 */
export const LOCALES = ["mn", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  mn: "Монгол",
  en: "English",
  ja: "日本語",
};

/** Mongolian source string -> its English and Japanese wording. */

/**
 * Trailing decoration an admin may have typed after a phrase -- an emoji,
 * an exclamation mark, a full stop. Tom's own hero copy ends in an emoji,
 * which made an exact lookup miss a phrase the dictionary already had. The
 * decoration is peeled off for the lookup and put back on the translation.
 */
const TRAILING_DECORATION = /(?:[\s!.…/·,\u2013\u2014]|\p{Extended_Pictographic}|️|‍)+$/u;

/** The same, at the front: JSX splits headings around an emphasis. */
const LEADING_DECORATION = /^(?:[\s/·,\u2013\u2014]|\p{Extended_Pictographic}|️|‍)+/u;

/**
 * Every phrase, indexed by all three of its wordings.
 *
 * The page translator (client/src/components/TranslateSurface.tsx) reads
 * the words it translates out of the DOM the app has already rendered, so
 * the moment a visitor switches once, the page is no longer in Mongolian.
 * Looking English up under a Mongolian key found nothing, and the page was
 * left half-switched until a reload (2026-09-12, Tom: "language solihoor
 * hagas dutuu soligdood baiuna zaawal refresh hiij baij buren soligdoj
 * baina"). Indexing an entry under its English and Japanese wordings too
 * makes every direction work -- including back to Mongolian -- with no
 * memory of what a node used to say.
 */
type Phrase = { mn: string; en: string; ja: string };

const phraseFor = (mn: string, entry: { en: string; ja: string }): Phrase => ({ mn, en: entry.en, ja: entry.ja });

/**
 * Entries whose key carries a {placeholder} are patterns, not fixed
 * phrases. A great many labels are assembled at runtime from data -- a
 * product name, a branch name, a count -- so the finished string is never
 * literally in the dictionary: "MASSEMOLLY-г сагсанд нэмэх" is built from
 * a product row. Matching those as patterns translates them without
 * threading a t() call through every component that builds one.
 *
 * A placeholder name means nothing but "the same piece, moved": {name} may
 * land before or after the verb, as each language needs.
 */
const PLACEHOLDER = /\{(\w+)\}/g;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Placeholders that only ever hold a number. "{n}ц" (a review's age, "2ц")
 * must not swallow every text node that happens to end in ц -- with the
 * loose (.+?) it would have rewritten "Багц" into "Баh". Anything else
 * ({name}, {tier}, {amount} with its ₮) keeps the loose match.
 */
const NUMERIC_PLACEHOLDERS = new Set(["n", "N", "count", "pct", "discount", "step", "steps"]);

/** The wording as a regular expression, with the placeholder names it uses. */
const compile = (form: string) => {
  const names: string[] = [];
  let pattern = "";
  let last = 0;
  for (const match of form.matchAll(PLACEHOLDER)) {
    pattern += escapeRegExp(form.slice(last, match.index));
    // Digits, thousands separators, and a trailing "+" ("900+ төрөл").
    pattern += NUMERIC_PLACEHOLDERS.has(match[1]) ? "([\\d][\\d.,+\\s]*?)" : "(.+?)";
    names.push(match[1]);
    last = match.index + match[0].length;
  }
  pattern += escapeRegExp(form.slice(last));
  return { test: new RegExp(`^${pattern}$`, "s"), names };
};

const EXACT = new Map<string, Phrase>();
const PATTERNS: { test: RegExp; names: string[]; phrase: Phrase }[] = [];

/**
 * Толь бичиг ачаалагдсан эсэх (2026-09-16).
 *
 * Орчуулгын толь нь 125 KB эх код бөгөөд өмнө нь клиентийн ҮНДСЭН chunk-д
 * шууд ордог байв: монголоор үзэж буй зочин — өөрөөр хэлбэл дийлэнх зочин —
 * хэзээ ч хэрэглэхгүй англи/япон мөрүүдийг эхний ачаалалтдаа татдаг байсан.
 * Одоо `loadTranslations()`-оор динамикаар ирнэ. Ачаалагдаагүй байхад
 * `translate()` эх мөрөө буцаана: сайт монголоор бичигдсэн тул монгол зочинд
 * ямар ч ялгаа гарахгүй, өөр хэл сонгосон бол хэдэн зуун миллисекундын дараа
 * бүрэн орчуулагдана.
 */
let loaded = false;
let loading: Promise<void> | null = null;

export const translationsReady = () => loaded;

/** Толийг (нэг л удаа) ачаална. Хэл солих үед `await` хийнэ; бусад үед
 *  эхний зурагдалтын дараа арын дэвсгэрээр дуудаж болно. */
export function loadTranslations(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = import("./i18n-strings").then(({ UI_STRINGS }) => {
      for (const [mn, entry] of Object.entries(UI_STRINGS)) {
        const phrase = phraseFor(mn, entry);
        const forms = [phrase.en, phrase.ja, phrase.mn];
        if (mn.includes("{")) {
          // Mongolian last, so a phrase that is its own translation still reads back.
          for (const form of forms) PATTERNS.push({ ...compile(form), phrase });
        } else {
          for (const form of forms) EXACT.set(form, phrase);
        }
      }
      // Longest first, so a specific pattern wins over a looser one.
      PATTERNS.sort((a, b) => b.test.source.length - a.test.source.length);
      loaded = true;
      // Ачаалахаас өмнө "орчуулга олдсонгүй" гэж хадгалагдсан хариултууд
      // хуучирсан тул цэвэрлэнэ.
      memo.clear();
    });
  }
  return loading;
}

const fillPattern = (text: string, locale: Locale) => {
  for (const { test, names, phrase } of PATTERNS) {
    const found = text.match(test);
    if (!found) continue;
    return phrase[locale].replace(PLACEHOLDER, (whole, name: string) => {
      const index = names.indexOf(name);
      // A piece can be translatable itself: a branch name dropped into
      // "{branch} — Google Maps дээр нээх" has an entry of its own.
      return index === -1 ? whole : translate(found[index + 1], locale);
    });
  }
  return null;
};

/**
 * Every lookup is remembered. The page translator walks the whole DOM on
 * every animation frame that changes it, so the same few hundred strings
 * are looked up over and over; without this the patterns would be re-tested
 * thousands of times a second.
 */
const memo = new Map<string, string>();

/** Translate a phrase into `locale`, from whichever language it is in now. */
export const translate = (text: string, locale: Locale): string => {
  if (!text) return text;
  // Толь хараахан ачаалагдаагүй бол эх мөрөө буцаана (дээрх loadTranslations-ийг үз).
  if (!loaded) return text;
  const cacheKey = `${locale}|${text}`;
  const remembered = memo.get(cacheKey);
  if (remembered !== undefined) return remembered;

  const result = lookUp(text, locale);
  // A visitor can browse a long catalogue; forget everything rather than
  // grow without bound, since re-filling is cheap.
  if (memo.size > 4000) memo.clear();
  memo.set(cacheKey, result);
  return result;
};

const lookUp = (text: string, locale: Locale): string => {
  const trimmed = text.trim();
  const direct = EXACT.get(trimmed);
  if (direct) return direct[locale];
  const decorated = trimmed.match(TRAILING_DECORATION);
  if (decorated) {
    const entry = EXACT.get(trimmed.slice(0, trimmed.length - decorated[0].length));
    if (entry) return entry[locale] + decorated[0];
  }
  const led = trimmed.match(LEADING_DECORATION);
  if (led) {
    const entry = EXACT.get(trimmed.slice(led[0].length));
    if (entry) return led[0] + entry[locale];
  }
  // A phrase that differs only by a final full stop is the same phrase.
  const withDot = EXACT.get(trimmed + ".");
  if (withDot) return withDot[locale];
  const filled = fillPattern(trimmed, locale);
  if (filled !== null) return filled;
  return text;
};
