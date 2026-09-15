/**
 * Ажилд орохыг хүсэгчийн анкет — НЭГ тодорхойлолт (2026-09-14).
 *
 * Монголын байгууллагуудын хэрэглэдэг стандарт анкетын бүтэц (Tom-ийн лавлагаа:
 * careers.smartsoftware.mn): хувийн мэдээлэл, яаралтай үед холбогдох хүн, гэр
 * бүл, ураг төрөл, боловсрол, компьютер/гадаад хэл/авьяас, ажлын туршлага,
 * шагнал, бусад (онцлог, эрүүл мэнд, цалингийн хүлээлт, ажилд орох өдөр).
 *
 * ⚠️ ТӨЛӨВ (2026-09-15): энэ нь БЭЛЭН ТОДОРХОЙЛОЛТ, гэхдээ ХАРААХАН
 * ЗАЛГААГҮЙ. Одоогийн /careers дээрх "Өргөдөл илгээх" нь богино маягт (нэр,
 * утас, имэйл, захидал, CV файл) бөгөөд `job_applications` хүснэгтэд бичдэг.
 * Бүтэн анкет руу шилжих гурван алхам үлдсэн: (1) `JobApplicationModal`-ыг
 * доорх хэсгүүдээр зурах, (2) `careers.apply`-д `validateJobApplicationForm`
 * дуудаж `job_applications.formJson` (шинэ TEXT багана) руу хадгалах,
 * (3) `AdminJobApplicationsPanel`-д ижил дарааллаар харуулах. Талбар
 * нэмэх/хасах бол зөвхөн энд — DB-д багана нэмэхгүй.
 *
 * Хэл: анкет монгол ажил горилогчид зориулагдсан ("Та монгол фонтоор бичнэ үү")
 * тул шошго монголоор; хэсгийн гарчиг, түгээмэл талбарууд shared/i18n.ts-д
 * орчуулагдсан, үлдсэн нь монголоороо үлдэнэ.
 */

export type FieldType = "text" | "textarea" | "date" | "number" | "phone" | "email" | "select";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  /** Хамгийн урт зөвшөөрөгдөх тэмдэгт (анхдагч: text 300, textarea 2000). */
  maxLength?: number;
  /** Мөрөнд хэдэн багана эзлэх (2 баганат grid-д). */
  span?: 1 | 2;
};

export type ListDef = {
  key: string;
  label: string;
  hint?: string;
  columns: readonly FieldDef[];
  /** Хамгийн олон мөр (анхдагч 10). */
  maxRows?: number;
};

export type SectionDef = {
  key: string;
  title: string;
  hint?: string;
  fields?: readonly FieldDef[];
  lists?: readonly ListDef[];
};

const YES_NO = ["Тийм", "Үгүй"] as const;
const SKILL_LEVELS = ["Анхан", "Дунд", "Сайн", "Маш сайн"] as const;
const LANG_LEVELS = ["Муу", "Дунд", "Сайн", "Маш сайн"] as const;

export const JOB_APPLICATION_NOTES: readonly string[] = [
  "Анкетыг бөглөхдөө бүх асуултад тодорхой хариулж, үг товчлохгүй байхыг хүсье.",
  "Цээж зураг хавсаргах шаардлагатай.",
  "Та монгол фонтоор бичнэ үү.",
  "Улаан хүрээтэй талбарыг заавал бөглөх шаардлагатайг анхаарна уу.",
  "Компани анкетыг хүлээн авснаар ажилд орохыг хүсэгчийн өмнө ямар нэгэн үүрэг, хариуцлага хүлээхгүй.",
];

export const JOB_APPLICATION_FORM: readonly SectionDef[] = [
  {
    key: "intro",
    title: "Сонирхол",
    fields: [
      { key: "otherInterests", label: "Та үндсэн мэргэжлээс гадна ямар чиглэлийн ажил хийх сонирхолтой вэ?", type: "textarea", span: 2 },
      { key: "countrysideShift", label: "Хөдөө орон нутагт ээлжийн зохицуулалтаар ажиллах боломжтой эсэх", type: "select", options: YES_NO },
    ],
  },
  {
    key: "personal",
    title: "1. Хувийн мэдээлэл",
    fields: [
      { key: "clanName", label: "Ургийн овог", type: "text" },
      { key: "patronymic", label: "Эцгийн нэр", type: "text", required: true },
      { key: "firstName", label: "Өөрийн нэр", type: "text", required: true },
      { key: "birthDate", label: "Төрсөн огноо", type: "date", required: true },
      { key: "ethnicity", label: "Үндэс угсаа", type: "text" },
      { key: "maritalStatus", label: "Гэрлэлтийн байдал", type: "select", options: ["Гэрлээгүй", "Гэрлэсэн", "Салсан", "Бэлэвсэн"] },
      { key: "address", label: "Оршин суугаа хаяг", type: "text", required: true, span: 2 },
      { key: "mobilePhone", label: "Гар утас", type: "phone", required: true },
      { key: "homePhone", label: "Гэрийн утас", type: "phone" },
      { key: "gender", label: "Хүйс", type: "select", options: ["Эрэгтэй", "Эмэгтэй"], required: true },
      { key: "email", label: "И-мэйл хаяг", type: "email" },
      { key: "registerNumber", label: "Регистрийн дугаар", type: "text", required: true, maxLength: 12 },
      { key: "civilId", label: "Иргэний бүртгэлийн дугаар (ТТД)", type: "text", maxLength: 20 },
    ],
    lists: [
      { key: "emergencyContacts", label: "1.1 Онцгой шаардлага гарвал харилцах хүн", columns: [
        { key: "name", label: "Нэр", type: "text", required: true },
        { key: "phone", label: "Утас", type: "phone", required: true },
        { key: "relation", label: "Тантай ямар холбоотой хүн бэ?", type: "text" },
      ], maxRows: 3 },
      { key: "family", label: "1.2 Гэр бүлийн байдал", columns: [
        { key: "relation", label: "Таны хэн болох", type: "text", required: true },
        { key: "name", label: "Нэр", type: "text", required: true },
        { key: "birthDate", label: "Төрсөн огноо", type: "date" },
        { key: "job", label: "Одоо эрхэлж байгаа ажил", type: "text" },
      ] },
      { key: "relatives", label: "1.3 Ураг төрлийн байдал", hint: "Таны эцэг, эх, ах, дүү, өрх тусгаарласан хүүхдээ бичнэ.", columns: [
        { key: "relation", label: "Таны хэн болох", type: "text", required: true },
        { key: "name", label: "Нэр", type: "text", required: true },
        { key: "birthDate", label: "Төрсөн огноо", type: "date" },
        { key: "job", label: "Одоо эрхэлж байгаа ажил", type: "text" },
      ] },
    ],
  },
  {
    key: "education",
    title: "2. Боловсрол",
    hint: "Таны эзэмшсэн боловсрол, мэргэжил — ерөнхий боловсролын сургуулийг оруулан бичнэ.",
    lists: [
      { key: "education", label: "Боловсрол", columns: [
        { key: "country", label: "Улс", type: "text" },
        { key: "province", label: "Аймаг / хот", type: "text" },
        { key: "school", label: "Сургууль", type: "text", required: true },
        { key: "startDate", label: "Элссэн огноо", type: "date" },
        { key: "endDate", label: "Төгссөн огноо", type: "date" },
        { key: "profession", label: "Эзэмшсэн мэргэжил", type: "text" },
        { key: "degree", label: "Боловсролын зэрэг", type: "select", options: ["Бүрэн дунд", "Тусгай дунд", "Дипломын", "Бакалавр", "Магистр", "Доктор"] },
        { key: "gpa", label: "Голч", type: "text", maxLength: 10 },
      ] },
    ],
  },
  {
    key: "skills",
    title: "3. Ур чадвар",
    lists: [
      { key: "computerSkills", label: "3.1 Компьютерын мэдлэг", columns: [
        { key: "program", label: "Програмын нэр", type: "text", required: true },
        { key: "level", label: "Ур чадвар", type: "select", options: SKILL_LEVELS },
      ] },
      { key: "languages", label: "3.2 Гадаад хэлний мэдлэг", columns: [
        { key: "language", label: "Гадаад хэл", type: "text", required: true },
        { key: "years", label: "Судалсан хугацаа (жил)", type: "number" },
        { key: "listening", label: "Ярьсныг ойлгох", type: "select", options: LANG_LEVELS },
        { key: "speaking", label: "Өөрөө ярих", type: "select", options: LANG_LEVELS },
        { key: "reading", label: "Уншиж ойлгох", type: "select", options: LANG_LEVELS },
        { key: "writing", label: "Бичиж орчуулах", type: "select", options: LANG_LEVELS },
      ] },
      { key: "talents", label: "3.3 Урлаг, спортын авьяас", columns: [
        { key: "kind", label: "Төрөл", type: "text", required: true },
        { key: "years", label: "Хичээллэсэн жил", type: "number" },
        { key: "rank", label: "Зэрэг, цол", type: "text" },
        { key: "award", label: "Шагнал", type: "text" },
      ] },
    ],
    fields: [
      { key: "driverLicense", label: "Та жолооны үнэмлэхтэй юу?", type: "select", options: YES_NO },
      { key: "driverLicenseClass", label: "Ангилал (байвал)", type: "text", maxLength: 20 },
    ],
  },
  {
    key: "experience",
    title: "4. Ажлын туршлага",
    hint: "Хамгийн сүүлд эрхэлж байсан албан тушаалаасаа эхэлж бичнэ үү.",
    lists: [
      { key: "experience", label: "Ажлын туршлага", columns: [
        { key: "organisation", label: "Байгууллагын нэр", type: "text", required: true },
        { key: "position", label: "Албан тушаал", type: "text", required: true },
        { key: "startDate", label: "Ажилд орсон огноо", type: "date" },
        { key: "endDate", label: "Ажлаас гарсан огноо", type: "date" },
        { key: "reason", label: "Ажлаас гарсан шалтгаан", type: "text" },
      ] },
      { key: "awards", label: "4.2 Таны авч байсан шагнал, урамшуулал", columns: [
        { key: "name", label: "Шагналын нэр", type: "text", required: true },
        { key: "from", label: "Хаанаас", type: "text" },
        { key: "year", label: "Хэдэн онд", type: "text", maxLength: 10 },
      ] },
    ],
    fields: [
      { key: "unemploymentNote", label: "4.1 Хэрэв та удаан хугацаагаар ажилгүй байсан бол тайлбар өгнө үү", type: "textarea", span: 2 },
    ],
  },
  {
    key: "other",
    title: "5. Бусад",
    fields: [
      { key: "strengths", label: "5.1 Онцгой сайн ур чадвар", type: "textarea", span: 2 },
      { key: "toImprove", label: "Хөгжүүлэх, сайжруулах ур чадвар", type: "textarea", span: 2 },
      { key: "health", label: "Эрүүл мэндийн байдал", type: "text", span: 2 },
      { key: "heardFrom", label: "5.2 Ажлын орон тоо гарсан тухай мэдээллийг хаанаас авсан бэ?", type: "select", options: ["Вэбсайт", "Facebook", "Найз, танил", "Дэлгүүр дээрх зар", "Ажил хайх сайт", "Бусад"] },
      { key: "relativesAtCompany", label: "5.3 Манай байгууллагад таны ойр дотны хүмүүс ажилладаг уу?", type: "text" },
      { key: "expectedTenure", label: "5.4 Манай байгууллагад тогтвор суурьшилтай ажиллах хугацаа", type: "select", options: ["1 жил хүртэл", "1–3 жил", "3–5 жил", "5-аас дээш жил"] },
      { key: "goals", label: "5.5 Таны ирээдүйн зорилго", type: "textarea", span: 2 },
      { key: "salaryMin", label: "Хүсч буй цалингийн доод хэмжээ (₮)", type: "number" },
      { key: "salaryMax", label: "Хүсч буй цалингийн дээд хэмжээ (₮)", type: "number" },
      { key: "availableFrom", label: "Ажилд орох боломжтой өдөр", type: "date", required: true },
    ],
  },
];

/** Талбарын утга; жагсаалт нь мөр бүр нь багана→утга объект. */
export type JobApplicationValues = Record<string, string | Record<string, string>[]>;

export type JobApplicationValidation =
  | { ok: true; values: JobApplicationValues; summary: { fullName: string; phone: string; email: string | null } }
  | { ok: false; errors: string[] };

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const isPhone = (value: string) => /^\+?[\d\s-]{8,20}$/.test(value);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;

function checkField(field: FieldDef, raw: unknown, where: string, errors: string[]): string {
  const value = typeof raw === "string" ? raw.trim() : raw === undefined || raw === null ? "" : String(raw).trim();
  const max = field.maxLength ?? (field.type === "textarea" ? 2000 : 300);
  if (!value) {
    if (field.required) errors.push(`${where}${field.label} — заавал бөглөнө.`);
    return "";
  }
  if (value.length > max) errors.push(`${where}${field.label} — ${max} тэмдэгтээс урт байна.`);
  if (field.type === "date" && !isDate(value)) errors.push(`${where}${field.label} — огноо буруу (ЖЖЖЖ-СС-ӨӨ).`);
  if (field.type === "phone" && !isPhone(value)) errors.push(`${where}${field.label} — утасны дугаар буруу.`);
  if (field.type === "email" && !isEmail(value)) errors.push(`${where}${field.label} — и-мэйл хаяг буруу.`);
  if (field.type === "number" && !/^\d{1,12}$/.test(value)) errors.push(`${where}${field.label} — зөвхөн тоо.`);
  if (field.type === "select" && field.options && !field.options.includes(value)) errors.push(`${where}${field.label} — жагсаалтаас сонгоно.`);
  return value;
}

/**
 * Ирсэн JSON-ыг тодорхойлолтоор шалгаж, ЦЭВЭРЛЭСЭН утгуудыг буцаана: мэдэхгүй
 * түлхүүр хаягдана (сервер рүү дур мэдэн талбар шахах боломжгүй), хоосон мөр
 * алгасагдана, жагсаалт maxRows-оор таслагдахгүй харин татгалзана.
 */
export function validateJobApplicationForm(input: unknown): JobApplicationValidation {
  const errors: string[] = [];
  const source = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const values: JobApplicationValues = {};

  for (const section of JOB_APPLICATION_FORM) {
    for (const field of section.fields ?? []) {
      const cleaned = checkField(field, source[field.key], "", errors);
      if (cleaned) values[field.key] = cleaned;
    }
    for (const list of section.lists ?? []) {
      const rawRows = source[list.key];
      if (rawRows === undefined || rawRows === null) continue;
      if (!Array.isArray(rawRows)) { errors.push(`${list.label} — жагсаалт байх ёстой.`); continue; }
      const maxRows = list.maxRows ?? 10;
      if (rawRows.length > maxRows) { errors.push(`${list.label} — ${maxRows}-аас олон мөр.`); continue; }
      const rows: Record<string, string>[] = [];
      rawRows.forEach((rawRow, index) => {
        const row = (rawRow && typeof rawRow === "object" ? rawRow : {}) as Record<string, unknown>;
        const isEmpty = list.columns.every(column => !String(row[column.key] ?? "").trim());
        if (isEmpty) return;
        const cleanedRow: Record<string, string> = {};
        for (const column of list.columns) {
          const cleaned = checkField(column, row[column.key], `${list.label}, ${index + 1}-р мөр: `, errors);
          if (cleaned) cleanedRow[column.key] = cleaned;
        }
        rows.push(cleanedRow);
      });
      if (rows.length) values[list.key] = rows;
    }
  }

  if (errors.length) return { ok: false, errors };
  const firstName = String(values.firstName ?? "");
  const patronymic = String(values.patronymic ?? "");
  return {
    ok: true,
    values,
    summary: {
      fullName: `${patronymic} ${firstName}`.trim(),
      phone: String(values.mobilePhone ?? ""),
      email: values.email ? String(values.email) : null,
    },
  };
}

/** Админы харагдацад: талбарын түлхүүр → шошго (жагсаалтын багана хамт). */
export function jobApplicationFieldLabel(key: string): string {
  for (const section of JOB_APPLICATION_FORM) {
    for (const field of section.fields ?? []) if (field.key === key) return field.label;
    for (const list of section.lists ?? []) if (list.key === key) return list.label;
  }
  return key;
}
