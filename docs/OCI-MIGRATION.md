# Aiven (Бангалор) → Oracle Cloud Always Free (Токио) — 2026-09-13

Tom: "Aiven удаан байгаад байгаа юм чинь, өнөөдөр Oracle free tier Токио руу шилжье."

## Юу руу шилжих вэ
Oracle **Always Free** (Tom баталгаажуулсан): **HeatWave MySQL нэг standalone instance, 50GB + 50GB backup, home region-д** + **Ampere A1 compute (нийт 4 OCPU / 24GB)**. Тиймээс:

| Үүрэг | Одоо (Aiven) | Шинэ (OCI Токио) |
|---|---|---|
| DB | Aiven MySQL 8.4, Бангалор, RTT ~174мс | **HeatWave MySQL** (managed: backup, patch) — private subnet, RTT ~60мс |
| App | гэрийн лаптоп + cloudflared | **A1 VM** (2 OCPU/12GB): Node + pm2 + cloudflared — 24/7, лаптопгүй |
| Лаптопуудын dev хандалт | Aiven public host | **SSH tunnel VM-ээр** (`ssh -L 3307:10.0.1.227:3306`) — HeatWave endpoint public биш (OCI баримт: "MySQL DB system endpoints are not public"; хандалт = compute VM / Bastion / VPN / NLB) |

Хэмжсэн эх DB: MySQL 8.4.8, **7.1MB**, 57 хүснэгт, utf8mb4_0900_ai_ci, 1 FULLTEXT, trigger/event 0 — dump 1 минут.

⚠️ **sql_mode**: Aiven `REAL_AS_FLOAT,PIPES_AS_CONCAT,ANSI_QUOTES,IGNORE_SPACE,ONLY_FULL_GROUP_BY,ANSI,STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION`. HeatWave-ийн анхдагч нь MySQL-ийн стандарт (ANSI_QUOTES-гүй). Апп drizzle-ийн backtick ашигладаг тул ANSI_QUOTES-оос хамаардаггүй ч **ижил байлгах** нь аюулгүй: HeatWave → DB System → Configuration → custom configuration-д `sql_mode`-ыг Aiven-тэй ижил тавина (эсвэл шалгалтын дараа стандартаар үлдээж болно — өөрчлөлт бүр integration suite-ээр батлагдана).

## Алхам 0 — Tom (Oracle console, ~30 мин)
1. https://cloud.oracle.com → Sign up. **Home region = Japan East (Tokyo)** — бүртгэлийн үед л сонгоно, дараа солигдохгүй. Карт (баталгаажуулалт; Always Free-д төлбөр авахгүй).
2. **Networking → Virtual Cloud Networks → "Start VCN Wizard" → VCN with Internet Connectivity** → нэр `sugi-vcn`. Public subnet (VM-д) + private subnet (DB-д) хоёулаа үүснэ.
3. **Databases → HeatWave MySQL → DB Systems → Create**: "Development or testing" / **Always Free** сонголт (shape `MySQL.Free`, 50GB). Нэр `sugi-db`. Username `admin`, хүчтэй нууц үг (тэмдэглэ). Network: `sugi-vcn` → **private subnet**. Backups: автоматаар (Always Free 50GB). Create → 10–15 мин. Дараа нь DB System → Endpoints → **Private IP address** (ж: `10.0.1.x`) болон **Internal FQDN** → тэмдэглэ.
4. **Compute → Instances → Create**: нэр `sugi-app`, Image **Ubuntu 24.04 (aarch64)**, Shape **Ampere VM.Standard.A1.Flex 2 OCPU / 12GB** (⚠️ Токиод "Out of host capacity" гарвал 1–2 цаг тутам давт — ердийн; муугаар бол VM.Standard.E2.1.Micro), Network `sugi-vcn` → **public subnet**, **Assign public IPv4 = Yes**, SSH keys → "Paste public keys":
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIG+271rKyBHl+55LMyMVDQJ+e8vCVlkbX0hZmnSDG6r sugi-asayake-oci
   ```
   Create → **Public IP** → тэмдэглэ.
5. **Security lists**: private subnet-ийн security list-д Ingress: Source = public subnet CIDR (ж `10.0.0.0/24`), TCP **3306** ба **33060** (VM → DB). Public subnet-д 22 анхнаасаа нээлттэй — өөр юу ч нээхгүй (сайт cloudflared-аар гардаг, порт нээхгүй).

Хэрэгтэй 4 зүйл: **VM public IP · HeatWave private IP · DB admin нууц үг · ажлын лаптопын public IP** (гэрийнх 64.119.23.175 мэдэгдэж байгаа).

## Алхам 1 — VM бэлтгэх (SSH, ~10 мин)
```bash
scp -i ~/.ssh/sugi-oci scripts/oci/setup-vm.sh ubuntu@168.110.25.230:
ssh -i ~/.ssh/sugi-oci ubuntu@168.110.25.230 'sudo bash setup-vm.sh'     # Node 22, pnpm, pm2, cloudflared, mysql-client, ufw, fail2ban, swap
```
(`INSTALL_MYSQL=1` өгвөл VM дээр өөрөө MySQL суулгана — HeatWave ашиглаж байгаа тул хэрэггүй.)

## Алхам 2 — Өгөгдөл зөөх (VM дээрээс — Токио↔Бангалор шууд)
```bash
mysqldump -h sugi-asayake-db-project-4b75.h.aivencloud.com -P 25861 -u avnadmin -p --ssl-mode=REQUIRED \
  --single-transaction --set-gtid-purged=OFF --routines --no-tablespaces defaultdb > /tmp/aiven.sql
mysql -h 10.0.1.227 -u admin -p --ssl-mode=REQUIRED -e "CREATE DATABASE IF NOT EXISTS defaultdb CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
mysql -h 10.0.1.227 -u admin -p --ssl-mode=REQUIRED defaultdb < /tmp/aiven.sql
# least-privilege app user (2026-09-12 SQLi review):
mysql -h 10.0.1.227 -u admin -p --ssl-mode=REQUIRED -e "CREATE USER 'sugi_app'@'%' IDENTIFIED BY '<pw>' REQUIRE SSL; GRANT SELECT,INSERT,UPDATE,DELETE ON defaultdb.* TO 'sugi_app'@'%';"
```
Шалгалт: 57 хүснэгт, `products` 980, `orders` 4, FULLTEXT индекс, `SELECT @@sql_mode`. HeatWave-ийн CA: `SHOW STATUS LIKE 'Ssl_server_not_after'` биш — DB System → Endpoints → **"Download CA certificate"** → `oci-ca.pem` (лаптопууд + VM).

## Алхам 3 — Лаптопуудын dev хандалт (SSH tunnel)
`.ssh/config`-д:
```
Host sugi-oci
  HostName 168.110.25.230
  User ubuntu
  IdentityFile ~/.ssh/sugi-oci
  LocalForward 3307 10.0.1.227:3306
  ServerAliveInterval 30
```
`ssh -N sugi-oci` (эсвэл Windows service/`autossh`) асаалттай байхад `.env`:
```
DATABASE_URL=mysql://sugi_app:<pw>@127.0.0.1:3307/defaultdb?ssl-mode=REQUIRED
DATABASE_ADMIN_URL=mysql://admin:<pw>@127.0.0.1:3307/defaultdb?ssl-mode=REQUIRED   # зөвхөн scripts/db-apply-migration.ts уншина
DATABASE_CA_CERT_PATH=./oci-ca.pem
```
`planMysqlConnection` нь `ssl-mode=REQUIRED` + loopback-д TLS хийж, CA-г pin-лээд IP-literal host тул hostname шалгалтыг алгасна (2026-09-13 засвар, 3 тест) — SSH + TLS давхар шифрлэгдэнэ.

## Алхам 4 — Cutover (дэлгүүр хаалттай нэг цаг)
1. Хоёр лаптопын серверийг унтраах (Aiven-д бичилт зогсоно).
2. Алхам 2-ыг дахин (сүүлийн өөрчлөлт); `orders`, `stock_movements`, `notification_outbox` тоо хоёр талд ижил.
3. VM дээр апп (Алхам 5) HeatWave руу заасан → асаах; лаптопууд tunnel-ээр.
4. Smoke: нүүр / shop / сагс / бэлэн мөнгөний checkout / admin / POS scan / царай; System Health: ledger drift 0.
5. Windows Task Scheduler `SUGI ASAYAKE Daily DB Backup` (**ажлын лаптоп дээр** — гэрийнхэд байхгүй, mysqldump ч суугаагүй) → `-DatabaseUrl` -ийг tunnel URL (`mysql://admin:…@127.0.0.1:3307/defaultdb?ssl-mode=REQUIRED`) руу; тэр лаптопт ч `register-tunnel-task.ps1` ажиллуулна. HeatWave өөрөө 7 хоногийн автомат backup + point-in-time recovery хийж байгаа тул энэ нь нэмэлт, оффлайн хуулбар.
6. **Tunnel-ийг байнга асаалттай байлгах** (энэ лаптоп дээр хийгдсэн 2026-09-13): `scripts/oci/register-tunnel-task.ps1` → Task Scheduler "SUGI OCI Tunnel" logon бүрт `scripts/oci/tunnel.ps1` (ssh -N sugi-oci, тасарвал 5–60с back-off-той дахин холбогдоно; лог `%LOCALAPPDATA%\sugi-oci-tunnel.log`). Порт 3307 сонсож байвал tunnel амьд.

**Rollback**: `.env` Aiven руу буцаах — Aiven 7 хоног хөндөгдөхгүй. Cutover-ийн дараах шинэ захиалгыг гараар зөөх хэрэгтэй тул шийдвэрээ 24 цагийн дотор гаргана.

## Алхам 5 — Сайтыг VM дээр (лаптопгүй)
```bash
ssh sugi-oci
git clone https://github.com/tmorius-eng/sugi-asayake.git && cd sugi-asayake && pnpm install --frozen-lockfile
# .env: DATABASE_URL=mysql://sugi_app:…@10.0.1.227:3306/defaultdb?ssl-mode=REQUIRED, DATABASE_CA_CERT_PATH=./oci-ca.pem,
#       S3_*, JWT_SECRET (ШИНЭ!), OWNER_EMAIL, VERIFY_MN_API_KEY, PUBLIC_BASE_URL=https://sugi.karkaron.com,
#       NOTIFICATIONS_DISPATCH=1, ADMIN_FACE_GATE_ENABLED=1, NODE_ENV=production
pnpm build && pm2 start dist/index.js --name sugi && pm2 save && sudo pm2 startup systemd -u ubuntu --hp /home/ubuntu
cloudflared tunnel login && cloudflared tunnel create sugi-vm && cloudflared tunnel route dns --overwrite-dns sugi-vm sugi.karkaron.com
sudo cloudflared service install   # ~/.cloudflared/config.yml: ingress -> http://localhost:3000
```
Дараа нь лаптопын `cloudflared tunnel run sugi-asayake`-г зогсоох. Хоёр лаптоп = зөвхөн dev; `NOTIFICATIONS_DISPATCH=1` зөвхөн VM. ONNX moderation загвар (179MB) VM дээр өөрөө татагдана.

## Aiven-ийг хэзээ устгах
OCI дээр 7 хоног алдаагүй ажилласны дараа; өмнө нь Aiven-ээс сүүлийн бүрэн backup-ийг cloud drive-д хадгална.
