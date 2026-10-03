# Lark — компанийн удирдлагын орчин (runbook)

2026-10-03-нд эхэлсэн. Зорилго (Tom): asayake.mn ба сайт нь *дэлгүүр*; компанийн бүх
мэдээлэл, үйл ажиллагааг **Lark-аас харж, удирдах**. Бүтэн төлөвлөгөө (Phase 0–5) энэ
файлын сүүлд.

## Зарчим

- **Сайтын DB эзэн, Lark нэг чиглэлийн толь.** Lark дээр мөрийг гараар засвал дараагийн
  sync дарж бичнэ. Lark-аас сайт руу зөвхөн хожим гарын үсэгтэй товч/Approval-аар (Phase 5).
- **Чат карт PII-гүй** — outbox-ын `title/message`-ээс бүтдэг (нэр, утас, хаяг байхгүй).
- **Бодит илгээлт зөвхөн `LARK_PUSH=1` машин дээр** (VM-ийн production `.env`).
  Лаптопууд `pnpm dev`-д prod DB руу заадаг, `sugi_staging` нь Lark-ийн нууцтай хуулбар —
  `server/integrations/lark/gate.ts` тэднээс бодит tenant руу явуулахгүй.

## Тохиргоо

| Хаана | Юу |
|---|---|
| Lark Developer Console → апп `cli_aa35cee5dc38de17` | App ID / App Secret, scopes, Bot чадвар, **хувилбар publish** |
| /admin → Интеграцууд → Lark | App ID, App Secret, API хост, 4 бүлгийн чатын ID, унтраасан event-үүд, "Идэвхтэй" |
| VM `.env` | `LARK_PUSH=1` (ганц машин дээр) |
| Хөгжүүлэгчийн лаптоп (Claude-ийн MCP) | `.mcp.json`-ийн `lark` + Windows-ийн `LARK_APP_ID`/`LARK_APP_SECRET` хэрэглэгчийн хувьсагч |

Шаардлагатай scope (Phase 1–2): `im:message`, `im:message:send_as_bot`, `im:chat:readonly`.
Phase 3+: `bitable:app`, `drive:drive`, `task:task:write`, `contact:user.id:readonly`.
Scope нэмсний дараа **заавал шинэ хувилбар гаргаж** tenant admin батална — эс бөгөөс хүчингүй.

### Чат холбох алхам
1. Lark дээр 4 бүлэг чат (Удирдлага, Агуулах, Санхүү, Дэлгүүр) + "SUGI Test" үүсгэнэ.
2. Чат бүр → Тохиргоо → **Бот нэмэх** → манай апп.
3. /admin → Интеграцууд → Lark → **Холболт шалгах** → чатуудын жагсаалт гарна, ID дээр дарж хуулна.
4. Бүлэг бүрийн талбарт тавиад хадгална → талбар бүрийн **Туршилт** товч → утасны Lark апп дээр карт ирэх ёстой.
5. "Идэвхтэй" асаана. VM дээр `LARK_PUSH=1` → `pm2 restart` → log-д `[lark] ИДЭВХТЭЙ`.

Нэг чатыг хэд хэдэн бүлэгт тавьж болно — ижил event тэр чатад нэг л удаа очно.

## Lark-ийн хязгаар (2026-10-03-ны судалгаа)

| | Starter (үнэгүй) | Pro (~$12/хүн/сар) |
|---|---|---|
| Гишүүн | **20** | 500 |
| Base мөр / хүснэгт | **2,000** | 20,000 |
| Base automation run / сар | 1,000 | 50,000 |
| Approval, Attendance, OKR, Tasks | бүгд | бүгд |

Төлбөртэй план бүх гишүүнд ногдоно; Basic Монголд зарагддаггүй. Эх сурвалж:
larksuite.com/hc/en-US/articles/497171699982, …/543233558855.
`@larksuiteoapi/lark-mcp` 0.5.1 (2025-08) хоцрогдсон — шинэ ажилд **Lark CLI** (`@larksuite/cli`).

## Код

| Файл | Үүрэг |
|---|---|
| `server/integrations/lark/gate.ts` | `isLarkPushAllowed()` / `isLarkTestAllowed()` |
| `server/integrations/lark/client.ts` | token кэш, `sendCard` (uuid-тай — давхардахгүй), `listChats`, `botInfo`, `request` |
| `server/integrations/lark/cards.ts` | outbox мөр → карт (plain_text) |
| `server/integrations/lark/chatDispatcher.ts` | outbox → `lark_chat_deliveries` → чат; 60 с давталт + шууд kick |
| `server/integrations/lark/fake.ts` | тестийн клиент |
| `drizzle/0101_lark_integration.sql` | provider enum, `lark_chat_deliveries`, `lark_records`, outbox индекс |

Хүргэлтийн төлөв: `sending` → `sent` / `pending` (retry 60 с, 5 мин, 30 мин, 30 мин; 5 оролдлого) /
`failed` (бот чатад байхгүй, scope дутуу — шууд) / `skipped` (чатгүй бүлэг, унтраасан, ижил чат) / `expired` (2 цаг).

## Төлөвлөгөө ба явц

- [x] **Phase 1 — суурь** (10-03): provider, gate, клиент, карт, admin "Холболт шалгах"/"Туршилт".
- [x] **Phase 2 — чат мэдэгдэл** (10-03): outbox-ын хоёр дахь хэрэглэгч (ntfy хөндөгдөөгүй).
- [ ] **Phase 0 — Tom**: VS Code дахин нээж MCP, Lark CLI; ажлын компьютер дээр үүсгэсэн Base/чатыг inventory; scope + publish; чат + бот; хүснэгт/баганын нэр, картын харагдацыг батлах.
- [ ] **Phase 3 — Base толь**: Ops (Бараа ба нөөц ~1,000, Захиалга 90 хоног, Шилжүүлэг), Owner (KPI өдөр/сар), `lark-base-sync` job, hash-diff, `maxRows`.
- [ ] **Phase 4 — CRM, HR, даалгавар**: Харилцагч (утас далдалсан), Ажилтан, Анкет; бага нөөц/хоцорсон шилжүүлэг → Lark Tasks; Attendance/Approval/OKR Lark дотор.
- [ ] **Phase 5 — Lark → сайт**: `/api/lark/callback` (гарын үсэг), "Баглаж эхэлсэн" товч; Zochil Studio-гийн захиалга өөрийн хүснэгтэд.

Бүрэн CRM-д харилцагчийн утсыг бүтнээр нь оруулахаас өмнө privacy policy-д Lark-ийг (гадаадад хадгалах) нэмнэ.
