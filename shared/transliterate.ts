/**
 * Латин → кирилл галиг (2026-09-20, хайлт v3).
 *
 * Барааны нэр 979/984 латин ("Cocochi Essence Cream"), худалдан авагч кириллээр
 * ("кокочи крем") бичдэг. Хуучин арга нь зөвхөн толины МОНГОЛ үгсийг латин болгож
 * (shared/search-synonyms.ts latinVariants) query-г өргөтгөдөг байсан тул толинд
 * байхгүй үг — брэнд, барааны нэрийн өвөрмөц үг — кириллээр огт олдохгүй байв.
 *
 * Энэ модуль эсрэг чиглэлийг өгнө: индекс барих үед барааны латин нэр/брэндийг
 * 1–2 кирилл хувилбараар индекслэнэ ("cocochi" → "кокочи", "asmy" → "асмй"/"асми"),
 * дээр нь хайлтын талын fuzzy (1–2 үсгийн зөрүү) үлдсэн зөрүүг тэвчинэ. Албан ёсны
 * галигийн стандарт байхгүй, хүн бүр өөрөөр бичдэг тул "зөв" биш "хамгийн
 * магадлалтай 2" хувилбарыг л гаргана — брэндийн бодит кирилл бичлэг
 * brand_aliases хүснэгтээс ирнэ (admin-аас засварлагдана).
 *
 * Цэвэр функц, DB/React-гүй — сервер, скрипт, тест бүгд ашиглана.
 */

const VOWELS = new Set("aeiouy");

/** Хоёр/гурван үсгийн нэгдлүүд — урт нь эхэлж таарна. [үндсэн, хувилбар?] */
const DIGRAPHS: Array<[string, string[]]> = [
  ["shch", ["щ"]], ["sh", ["ш"]], ["ch", ["ч"]], ["ts", ["ц"]], ["kh", ["х"]], ["zh", ["ж"]],
  ["ph", ["ф"]], ["th", ["т"]], ["ck", ["к"]], ["qu", ["кв"]],
  ["ya", ["я"]], ["yu", ["ю"]], ["yo", ["е"]], ["ye", ["е"]],
  ["ai", ["ай"]], ["ay", ["ай"]], ["ei", ["эй"]], ["ey", ["эй"]], ["oi", ["ой"]], ["oy", ["ой"]],
  ["ui", ["уй"]], ["uy", ["уй"]], ["ii", ["ий"]], ["iy", ["ий"]],
  ["oo", ["у", "оо"]], ["ee", ["и", "ээ"]], ["ea", ["и", "еа"]],
];

const SINGLES: Record<string, string> = {
  a: "а", b: "б", d: "д", f: "ф", g: "г", h: "х", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", z: "з", q: "к",
};

export const isCyrillicText = (value: string) => /[а-яёөү]/i.test(value);
export const isLatinText = (value: string) => /[a-z]/i.test(value);

/**
 * Нэг латин үгийг кирилл хувилбарууд болгоно (1–2, давхардалгүй, жижиг үсгээр).
 * Латин үсэггүй (аль хэдийн кирилл, эсвэл тоо) оролтод хоосон массив.
 */
export function toCyrillicVariants(latin: string): string[] {
  const word = latin.toLowerCase();
  if (!isLatinText(word)) return [];
  let primary = "";
  let alternate = "";
  let hasAlternate = false;
  let index = 0;
  let previous = "";
  while (index < word.length) {
    const rest = word.slice(index);
    const digraph = DIGRAPHS.find(([pattern]) => rest.startsWith(pattern));
    if (digraph) {
      const [pattern, options] = digraph;
      primary += options[0];
      alternate += options[1] ?? options[0];
      if (options.length > 1) hasAlternate = true;
      previous = pattern[pattern.length - 1];
      index += pattern.length;
      continue;
    }
    const char = word[index];
    const next = word[index + 1] ?? "";
    const atStart = index === 0;
    const afterVowel = VOWELS.has(previous);
    let options: string[];
    if (char === "e") options = atStart || afterVowel ? ["э", "е"] : ["е", "э"];
    else if (char === "c") options = "eiy".includes(next) && next !== "" ? ["с", "к"] : ["к"];
    else if (char === "y") options = afterVowel || next === "" ? ["й", "и"] : ["и", "й"];
    else options = [SINGLES[char] ?? char];
    primary += options[0];
    alternate += options[1] ?? options[0];
    if (options.length > 1) hasAlternate = true;
    previous = char;
    index += 1;
  }
  const variants = [primary];
  if (hasAlternate && alternate !== primary) variants.push(alternate);
  return variants.filter(variant => variant.length >= 2);
}

/**
 * Хэд хэдэн үгтэй текстийг үг бүрээр галиглаж, хувилбар бүрийг тусад нь өгнө
 * (индексийн талбарт орох зайгаар тусгаарлагдсан үгсийн жагсаалт).
 */
export function toCyrillicWords(text: string): string[] {
  const seen = new Set<string>();
  // Тоо, хэмжээ ("600ml", "spf50") галиглагддаггүй — зөвхөн үсгэн үг.
  for (const token of text.toLowerCase().split(/[^a-z]+/).filter(token => token.length >= 2)) {
    for (const variant of toCyrillicVariants(token)) seen.add(variant);
  }
  return Array.from(seen);
}
