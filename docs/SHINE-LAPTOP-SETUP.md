# Шинэ компьютер дээр SUGI ASAYAKE-г ажиллуулах — алхам алхмаар

Энэ заавар нь **юу ч суулгаагүй цоо шинэ Windows компьютер** дээр төслийг
GitHub-аас татаж аваад ажиллуулахад зориулагдсан. Алхмуудыг дараалан нь дага.

> **Хамгийн чухал зүйл эхлээд:** энэ төсөл нь өгөгдлийн баазаа (Aiven MySQL)
> болон зургуудаа (Cloudflare R2) **үүлэн дээрээс** уншдаг. Тиймээс шинэ
> компьютер дээр MySQL суулгах ч шаардлагагүй, өгөгдөл хуулах ч
> шаардлагагүй — `.env` файлаа зөв бөглөнгүүт 937 бараа, бүх захиалга,
> зураг шууд харагдана. Хоёр лаптоп яг нэг ижил баазтай ажиллана.

---

## Алхам 1. Шаардлагатай 3 программыг суулгах

Бүгдийг нь дараалан суулгаад, суулгац бүрийн дараа **шинэ терминал нээж**
шалгана.

### 1.1 Git

1. https://git-scm.com/download/win → "64-bit Git for Windows Setup" татаж ав
2. Суулгацыг ажиллуул. Бүх алхамд **Next** дараад л явж болно (анхдагч утга зөв).
3. Шалгах: **PowerShell** нээгээд бич:
   ```powershell
   git --version
   ```
   `git version 2.xx.x` гэж гарвал болсон.

### 1.2 Node.js (22 LTS буюу түүнээс дээш)

1. https://nodejs.org → зүүн талын **LTS** товчийг дар (жишээ: 22.x.x LTS)
2. Суулгацыг ажиллуулаад Next → Next → Install
3. Шалгах:
   ```powershell
   node -v
   ```
   **v20.19 буюу v22.12-оос дээш** байх ёстой (Vite ийм шаардлагатай).
   Хэрэв v18 гэх мэт хуучин гарвал шинийг нь дахин суулга.

### 1.3 VS Code

1. https://code.visualstudio.com → **Download for Windows**
2. Суулгацад **"Add to PATH"** гэсэн сонголтыг заавал асаа (анхдагчаараа асаалттай).

---

## Алхам 2. pnpm-г идэвхжүүлэх

Энэ төсөл `npm`-ийн оронд **pnpm 10.4.1** ашигладаг (`package.json`-д тогтоосон).

PowerShell дээр:

```powershell
npm install -g pnpm@10.4.1
pnpm -v
```

`10.4.1` гэж гарвал болсон.

> Node 22 LTS дээр `corepack` гэсэн хэрэгсэл бас байдаг
> (`corepack enable` → `corepack prepare pnpm@10.4.1 --activate`), гэхдээ
> Node-ийн шинэ хувилбаруудад түүнийг салгасан тул дээрх `npm install -g`
> арга илүү найдвартай.

**Хэрэв "running scripts is disabled" гэсэн улаан алдаа гарвал** — Windows
PowerShell script ажиллуулахыг хориглосон байна. Дараах командыг нэг удаа
ажиллуулаад дахин оролд:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

`Y` гээд Enter дар.

---

## Алхам 3. Кодыг GitHub-аас татах (clone)

Репозитор: `https://github.com/tmorius-eng/sugi-asayake.git` (**хувийн/private**
тул GitHub данс шаардана).

1. Кодоо хаана хадгалахаа шийд. Жишээ нь `C:\Projects`:
   ```powershell
   mkdir C:\Projects
   cd C:\Projects
   ```

2. Clone хий:
   ```powershell
   git clone https://github.com/tmorius-eng/sugi-asayake.git
   ```

3. **Нэвтрэх цонх гарч ирнэ** → "Sign in with your browser" дараад GitHub
   дансаараа нэвтэр. Нэг удаа хийхэд хангалттай, дараа нь санана.

   > Хэрэв нэвтрэх цонх гарахгүй, харин нууц үг асуувал: GitHub нууц үг
   > ажиллахаа больсон. GitHub → Settings → Developer settings → Personal
   > access tokens → **Tokens (classic)** → Generate new token → `repo`
   > эрхийг сонго → үүссэн токеныг нууц үгийн оронд буулга.

4. Хавтас руу ор:
   ```powershell
   cd sugi-asayake
   ```

---

## Алхам 4. Зөв салбар руу шилжих (ЭНЭ АЛХМЫГ БҮҮ АЛГАС)

Хамгийн сүүлийн ажлууд (дэлгүүрийн шинэ карт, аюулгүй байдлын засварууд)
`main` дээр биш, **`audit-2026-09-09-order-unwind`** салбар дээр байгаа.

```powershell
git checkout audit-2026-09-09-order-unwind
git pull
```

Одоо хаана байгаагаа шалгах:
```powershell
git branch --show-current
```
`audit-2026-09-09-order-unwind` гэж гарах ёстой.

---

## Алхам 5. VS Code дээр нээх

```powershell
code .
```

(эсвэл VS Code нээгээд **File → Open Folder → C:\Projects\sugi-asayake**)

- Баруун доод буланд **"Do you trust the authors?"** гарвал → **Yes, I trust**
- Зүүн талын **Extensions** (Ctrl+Shift+X) хэсгээс дараахыг хайж суулгавал
  ажиллахад хялбар болно (заавал биш):
  `ESLint`, `Prettier`, `Tailwind CSS IntelliSense`, `GitLens`

VS Code дотор терминал нээх: **Ctrl + `** (эсвэл Terminal → New Terminal).
Доорх бүх командыг энэ терминал дээр бичнэ.

---

## Алхам 6. `.env` файл үүсгэх (хамгийн чухал алхам)

`.env` файлд нууц үгс байдаг тул **GitHub дээр байдаггүй**. Гараар үүсгэнэ.

1. Жишээ файлаас хуулбар үүсгэ:
   ```powershell
   copy .env.example .env
   ```

2. VS Code-ийн зүүн талын файлын жагсаалтаас **`.env`** файлыг нээ.

3. Дотор нь байгаа тайлбарыг уншаад жинхэнэ утгуудыг бөглө.

   **Хамгийн хялбар арга:** хуучин лаптопынхаа `C:\...\sugi-asayake\.env`
   файлыг нээгээд, доторх бүх текстийг хуулж шинэ лаптопын `.env` дээр
   буулгах. Ингэвэл 100% ижил тохиргоотой болно.

   **Заавал бөглөх 6 мөр** (эдгээргүйгээр сервер асахгүй/бааз холбогдохгүй):
   - `DATABASE_URL` — Aiven
   - `JWT_SECRET`
   - `OWNER_EMAIL`
   - `S3_*` (5 мөр) — Cloudflare R2, зураг харагдахын тулд
   - `INTEGRATIONS_ENCRYPTION_KEY` — хуучин лаптоптойгоо **ижил** байх ёстой
   - `PORT=3000`

4. Хадгал: **Ctrl + S**

> ⚠️ `.env` файлыг хэзээ ч GitHub руу бүү оруул. `.gitignore`-д аль хэдийн
> бичигдсэн тул санамсаргүйгээр орох ёсгүй, гэхдээ битгий гараар нэм.

---

## Алхам 7. Сангуудыг суулгах (dependencies)

VS Code-ийн терминал дээр:

```powershell
pnpm install
```

- 1–3 минут үргэлжилнэ (интернэтийн хурднаас хамаарна)
- `Done in ...s` гэж дуусвал болсон
- Хэрэв build script-ийн талаар асуувал: `pnpm approve-builds` ажиллуулаад
  `@tailwindcss/oxide` болон `esbuild`-ыг зөвшөөр

---

## Алхам 8. Ажиллуулах

```powershell
pnpm dev
```

Терминал дээр ийм мөр гарна:

```
[db] MySQL: TLS to sugi-asayake-db-project-4b75...
Server running on http://localhost:3000/
```

Одоо browser нээгээд **http://localhost:3000** руу ор. Дэлгүүр бүх бараатайгаа
харагдана.

- **/shop** — барааны жагсаалт
- **/admin** — админ самбар (`OWNER_EMAIL`-ээр бүртгүүлсэн эрхээр)

**Зогсоох:** терминал дээр **Ctrl + C**

---

## Алхам 9. Бүх зүйл зөв эсэхийг шалгах (сонголттой)

```powershell
pnpm check     # TypeScript алдаа байна уу
pnpm build     # production хувилбар угсарч үзэх
```

Хоёулаа алдаагүй өнгөрвөл орчин бүрэн зөв тохируулагдсан гэсэн үг.

Тест ажиллуулах (Aiven руу холбогддог тул 10 орчим минут):
```powershell
$env:RUN_AUTH_INTEGRATION_TESTS="1"; $env:COMMERCE_INTEGRATION_TESTS="1"; $env:RUN_MEDIA_INTEGRATION_TESTS="1"
pnpm exec vitest run --no-file-parallelism
```
`578 passed` гарах ёстой.

---

## Өдөр тутмын ажлын урсгал (дараа нь)

```powershell
cd C:\Projects\sugi-asayake
git pull                 # бусад компьютер дээр хийсэн өөрчлөлтийг татах
pnpm install             # package.json өөрчлөгдсөн үед л хэрэгтэй
pnpm dev                 # ажиллуулах
```

Өөрчлөлтөө GitHub руу илгээх:
```powershell
git add -A
git commit -m "юу өөрчилснөө бич"
git push
```

---

## Алдаа гарвал — түгээмэл асуудлууд

| Алдааны шинж тэмдэг | Шалтгаан ба засвар |
|---|---|
| `pnpm : command not found` | Алхам 2-ыг дахин хий. Терминалаа хааж, шинээр нээхээ мартуузай. |
| `running scripts is disabled` | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `Error: connect ETIMEDOUT` эсвэл бааз холбогдохгүй | `.env`-ийн `DATABASE_URL` буруу эсвэл интернэт салсан. Aiven Console дээр үйлчилгээ асаалттай эсэхийг шалга. |
| Сайт нээгдэнэ ч **бараа харагдахгүй, бүх зураг алга** | `DATABASE_URL` буруу баазыг заасан байна (жишээ нь `127.0.0.1`). Заавал Aiven-ий хаяг байх ёстой. Энэ алдаа өмнө нэг удаа гарч цаг алдсан (CLAUDE.md-д тэмдэглэсэн). |
| Бараа харагдана ч **зураг нь эвдэрсэн** | `S3_*` мөрүүд дутуу/буруу. Cloudflare R2-ийн түлхүүрүүдийг шалга. |
| `Port 3000 is already in use` | Өөр программ тэр портыг эзэлсэн. `.env`-д `PORT=3001` болгоод дахин асаа. |
| /admin руу орох үед камер асаад оруулахгүй байна | `.env`-д `ADMIN_FACE_GATE_ENABLED=0` болгоод серверээ дахин асаа. |
| Бүртгүүлэх үед SMS-ийн алдаа | `VERIFY_MN_API_KEY` хоосон байна. Зөвхөн үзэх/засах бол одоо байгаа admin эрхээрээ нэвтэр. |

---

## Төслийн тухай товч

Дэлгэрэнгүй мэдээлэл (архитектур, өмнөх шийдвэрүүд, нээлттэй ажлууд):
- [CLAUDE.md](../CLAUDE.md) — одоогийн статус, тохиргоо, идэвхтэй асуудлууд
- [HISTORY.md](../HISTORY.md) — өдөр бүрийн ажлын дэлгэрэнгүй лог

Гол командууд:

| Команд | Юу хийдэг |
|---|---|
| `pnpm dev` | Хөгжүүлэлтийн сервер асаах (localhost:3000) |
| `pnpm check` | TypeScript алдаа шалгах |
| `pnpm build` | Production хувилбар угсрах |
| `pnpm exec vitest run --no-file-parallelism` | Бүх тест ажиллуулах |
