# SUGI ASAYAKE — Ажлын компьютерээс гэрийн компьютер руу шилжих заавар

`CLAUDE.md`-ийн хамтрагч баримт. 2026-08-20: Tom ажлын компьютер дээрээ хийж байсан ажлаа гэрийн компьютер дээрээ үргэлжлүүлэхийг хүссэн — энэ бол яг тэр процессын бүрэн заавар.

**4 тусдаа зүйл зөөх ёстой:** (1) эх код, (2) MySQL-ийн бодит өгөгдөл (хэрэглэгч, бүтээгдэхүүн, захиалга), (3) MinIO-д хадгалагдсан зурган файлууд, (4) `.env` нууц утгууд (эдгээр нь `.gitignore`-т орсон тул git-ээр дамждаггүй). Доор бүгдийг нь тусад нь тайлбарлав.

---

## 1. Эх код — санал болгож буй арга: **private GitHub repo**

Төсөл аль хэдийн `git init` хийгдсэн (2026-08-20), гэхдээ GitHub-руу push хийгээгүй байсан. Одоо хийвэл давуу тал: (а) гэрийн компьютер руу `git clone` хийхэд хялбар, (б) цаашид хоёр компьютерийн хооронд `git push`/`git pull`-аар синк хийж болно, (в) CI (`.github/workflows/ci.yml` аль хэдийн бэлэн) идэвхжинэ, (г) laptop бүтэн эвдэрсэн ч кодоо алдахгүй — нэг төрлийн эмэргжийн нөөц.

**Ажлын компьютер дээрээ (одоо):**
1. [github.com](https://github.com) дээр (хэрэв бүртгэлгүй бол шинээр) нэвтэрч, **New repository** дараад **Private** сонгож, нэрийг нь `sugi-asayake` гэх мэт өгөөд үүсгэ (README/`.gitignore` НЭМЖ БҮҮ эхлүүл — хоосон repo хэрэгтэй).
2. Үүссэн repo-ийн "…or push an existing repository" хэсэгт харагдах command-уудыг надад өгвөл, эсвэл өөрөө PowerShell дээрээ:
   ```powershell
   cd C:\Sugi-asayake
   git remote add origin https://github.com/<таны-username>/sugi-asayake.git
   git branch -M main
   git push -u origin main
   ```
   Эхний удаа push хийхэд GitHub нэвтрэлт асуух болно (browser нээгдэж зөвшөөрнө, эсвэл Personal Access Token асуух) — заавар дэлгэц дээр гарна.

**Гэрийн компьютер дээрээ (дараа):**
```powershell
cd C:\
git clone https://github.com/<таны-username>/sugi-asayake.git Sugi-asayake
cd Sugi-asayake
```

### Өнөөдөр яараад GitHub тохируулах цаггүй бол: энгийн хувилбар
`C:\Sugi-asayake` фолдерийг бүхэлд нь (доор дурдсан `node_modules`, `dist`, `backups` ЭСВЭЛ орхиод) USB диск эсвэл OneDrive/Google Drive руу хуулж аваад, гэрийн компьютер дээрээ буцааж хуул. `node_modules`-ийг хуулах шаардлагагүй (том, `pnpm install`-аар шинээр татагдана) — хуулахаасаа өмнө устгаж болно эсвэл zip хийхдээ орхиж болно.

---

## 2. MySQL-ийн өгөгдөл — backup script аль хэдийн бэлэн

**Ажлын компьютер дээрээ (хийгдсэн — 2026-08-20 19:08):**
```powershell
cd C:\Sugi-asayake
$env:DATABASE_URL="mysql://root:Zulaa123@127.0.0.1:3306/sugi_asayake"
pwsh scripts/db-backup.ps1
```
→ `C:\Sugi-asayake\backups\sugi_asayake_2026-08-20_190848.zip` (5.5 KB) үүссэн. Энэ файлыг USB/cloud drive-аар зөөх хэрэгтэй (`.gitignore`-д орсон тул git-ээр дамжихгүй!).

**Гэрийн компьютер дээрээ (MySQL шинээр суулгасны дараа):**
1. Zip-ийг задал.
2. `scripts/db-restore.ps1`-ийг ашиглаж сэргээ (анхдагчаар аюулгүй `_restore_drill` нэртэй тусдаа DB рүү сэргээдэг — жинхэнэ өгөгдлийг санамсаргүй дарахгүй):
   ```powershell
   $env:DATABASE_URL="mysql://root:<шинэ-нууц-үг>@127.0.0.1:3306/sugi_asayake"
   pwsh scripts/db-restore.ps1 -BackupFile "<zip-ийн зам>" -Force
   ```
   `-Force` параметр нь **жинхэнэ** `sugi_asayake` DB рүү шууд бичихийг зөвшөөрнө (шинэ компьютер тул дарах өгөгдөл байхгүй — аюулгүй). Дэлгэрэнгүй: `scripts/db-restore.ps1`-ийн толгой хэсгийн тайлбар.

---

## 3. MinIO-ийн зурган файлууд

Одоогийн хэмжээ: **79 файл, ~45.6 MB** (`C:\minio\data`). Жижиг тул USB/cloud drive-аар шууд хуулахад хялбар.

**Ажлын компьютер дээрээ:** `C:\minio\data` фолдерийг бүхэлд нь хуул.
**Гэрийн компьютер дээрээ:** MinIO суулгасны дараа яг тэр л замд (`C:\minio\data`) буулга — эсвэл эхлээд хоосон бүкетээр эхлээд, /admin-аар бүтээгдэхүүнүүдээ дахин зурагтай болгож болно (хуучин зурган URL-ууд алга болно, гэхдээ функц ажиллана).

---

## 4. `.env` — нууц утгууд

`.env` файл `.gitignore`-т заавал орсон (зөв — нууц түлхүүрүүдийг нийтийн git repo-д хэзээ ч бүү тавь). Иймд GitHub/USB хэдийг ч ашигласан **`.env`-ийг тусад нь, аюулгүй сувгаар** (жишээ нь өөрийн хооронд OneDrive-ийн хувийн фолдер, эсвэл нууц үгийн менежерийн "secure note", USB диск) зөөх хэрэгтэй — имэйл/чат/олон нийтийн cloud drive-аар бүү дамжуул.

Гэрийн компьютерт `C:\Sugi-asayake\.env` файлыг яг адилхнаар үүсгэ (эсвэл хуулаад буулга). Агуулга (CLAUDE.md-д бүрэн жагсаалттай): `DATABASE_URL`, `JWT_SECRET`, `OWNER_EMAIL`, `S3_BUCKET`, `S3_REGION=us-east-1` (⚠️ "Mongolia" биш), `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_SMS_SENDER`.

MinIO-г асаах PowerShell command-ийн `$env:MINIO_LICENSE` мөр (JWT түлхүүр) нь `.env`-д ороогүй, тусдаа асаах script/тэмдэглэлдээ хадгал — доорх хэсэгт бас байгаа.

---

## 5. Гэрийн компьютер дээрх бүрэн шинэ тохиргоо (checklist)

- [ ] **Node.js** (LTS хувилбар) суулгах — [nodejs.org](https://nodejs.org)
- [ ] **pnpm** суулгах: `npm install -g pnpm`
- [ ] **MySQL 8** native Windows суулгалт (Docker биш — энэ төсөлд Docker-оос зайлсхийсэн шалтгаан CLAUDE.md-д бий):
  - Суулгасны дараа `root`-ийн auth plugin-ийг заавал шалга (CLAUDE.md-ийн "MySQL-тэй холбоотой чухал зүйл" хэсэг):
    ```sql
    ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '<шинэ-нууц-үг>';
    CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '<шинэ-нууц-үг>';
    GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
    FLUSH PRIVILEGES;
    ```
  - `sugi_asayake` нэртэй хоосон DB үүсгэ, дараа нь §2-ийн `db-restore.ps1`-ээр өгөгдлөө сэргээ.
- [ ] **MinIO** ([min.io](https://min.io/download) дээрээс `minio.exe` эсвэл ажлын компьютероосоо `C:\Users\...\Downloads\minio.exe`-г хуул) + §3-ийн `C:\minio\data` фолдер:
  ```powershell
  $env:MINIO_ROOT_USER="minioadmin"
  $env:MINIO_ROOT_PASSWORD="minioadmin"
  $env:MINIO_LICENSE="<§4-т тэмдэглэсэн JWT>"
  $env:MINIO_SITE_REGION="us-east-1"
  .\minio.exe server C:\minio\data --console-address ":9001"
  ```
- [ ] Код: §1-ийн аль нэг аргаар татаж ав.
- [ ] `.env`: §4-ийн дагуу үүсгэ.
- [ ] `cd C:\Sugi-asayake && pnpm install`
- [ ] `pnpm check` (0 алдаа байх ёстой), `pnpm test` (DATABASE_URL зарлаагүй энгийн горимоор ажиллуулаад л шалгаж болно)
- [ ] `pnpm dev` → `http://localhost:3000` дээр сайт нээгдэж, `/admin`-аар өмнөх акаунтаараа нэвтэрч чадаж байгааг шалга.

### Магадгүй тааралдах асуудлууд (CLAUDE.md-д дэлгэрэнгүй)
- **`package.json`/`pnpm-lock.yaml`-ийн "High Mandatory Level"** — энэ бол ажлын компьютер дээр гарч байсан Windows-specific цоорхой (яагаад гарсан нь тодорхойгүй хэвээр). Шинэ клон дээр давтагдахгүй байж магадгүй, гэхдээ хэрэв `pnpm add`/`pnpm install` EPERM алдаа өгвөл elevated PowerShell-ээс `icacls <file> /setintegritylevel Medium`.
- **MySQL `caching_sha2_password`** — дээрх checklist-д аль хэдийн тусгасан.

---

## Хураангуй: юуг юугаар зөөх вэ

| Юу | Хэрхэн | Хаана байна (ажлын компьютер) |
|---|---|---|
| Эх код | GitHub (санал болгож буй) эсвэл USB/cloud | `C:\Sugi-asayake` (git repo) |
| MySQL өгөгдөл | `db-backup.ps1`/`db-restore.ps1` | `C:\Sugi-asayake\backups\sugi_asayake_2026-08-20_190848.zip` |
| Зурган файлууд | USB/cloud, шууд хуулах | `C:\minio\data` (~45.6 MB) |
| `.env` нууц утгууд | Аюулгүй сувгаар (**public git/chat/email-ээр БҮҮ дамжуул**) | `C:\Sugi-asayake\.env` |
