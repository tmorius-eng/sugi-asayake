# Aiven → Oracle MySQL HeatWave (Токио) нүүлгэлт

**Шалтгаан:** Aiven service нь **Энэтхэг, Бангалор**-т байрладаг (DigitalOcean, IP 168.144.66.5) — Улаанбаатараас хэмжихэд `SELECT 1`-ийн **median 174ms**. Токио бол ~40-70ms байх ёстой, өөрөөр хэлбэл одоо 3 дахин илүү саатал төлж байна. Tom-ийн OCI tenancy-ийн home region нь аль хэдийн **ap-tokyo-1**.

**Яагаад Autonomous Database БИШ вэ (чухал):** Oracle-ийн үнэгүй эрхийн гол бүтээгдэхүүн болох **Autonomous Database нь Oracle SQL** бөгөөд MySQL-тэй нийцдэггүй. Энэ төсөл нь Drizzle ORM + `mysql2` дээр бүтсэн, Drizzle-д Oracle dialect **огт байхгүй** — тэр рүү шилжинэ гэдэг нь 42 хүснэгт, 45 migration, FULLTEXT хайлт бүхий бүх өгөгдлийн давхаргыг дахин бичнэ гэсэн үг. Тиймээс зорилтот бүтээгдэхүүн нь **MySQL HeatWave**, энэ нь жинхэнэ MySQL 8 тул **аппликейшний код огт өөрчлөгдөхгүй**, зөвхөн `DATABASE_URL` солигдоно.

**Үнэ:** MySQL HeatWave-ийн **Always Free** нь home region-д 1 DB system, **50 GB өгөгдөл + 50 GB backup**, хугацаагүй. Манай бүтэн dump ердөө **1.5 MB** тул багтахад асуудалгүй. Network Load Balancer мөн Always Free-д 1 ширхэг ордог.

---

## ⚠️ Хамгийн чухал техникийн хязгаарлалт

**OCI-ийн MySQL DB System-д public endpoint БАЙХГҮЙ.** Aiven-аас ялгаатай нь энэ нь зөвхөн VCN-ийн private subnet дотор амьдардаг тул **лаптопоос шууд холбогдох боломжгүй**. Гурван гарц:

| Арга | Тайлбар |
|---|---|
| **Network Load Balancer** (энэ баримтын арга) | NLB-д public IP өгч, 3306 портыг DB рүү дамжуулна. Always Free-д багтана. Лаптопоос шууд холбогдоно. |
| OCI Bastion (SSH tunnel) | Илүү аюулгүй ч холболт бүрд tunnel асаах шаардлагатай — өдөр тутмын хөгжүүлэлтэд төвөгтэй. |
| Апп-аа OCI compute дээр байрлуулах | Хамгийн зөв эцсийн шийдэл. Тэр үед NLB огт хэрэггүй (private IP-гээр шууд холбогдоно). Hosting сонгогдсоны дараа энэ рүү шилжих нь зүйтэй. |

**Аюулгүй байдлын анхааруулга:** NLB-ээр 3306-г интернэтэд гаргана гэдэг нь MySQL порт олон нийтэд нээлттэй болно гэсэн үг. Аюулгүй байдлын жагсаалтад **зөвхөн өөрийн IP**-г зөвшөөрөх нь зүйтэй (`0.0.0.0/0` биш). Гэрийн IP солигддог тул үе үе шинэчлэх шаардлагатай болно. (Aiven ч мөн адил public endpoint-тэй боловч тэдний талд нэмэлт хамгаалалт бий.)

---

## 1. Tom-ийн хийх алхмууд (OCI Console, ~15-20 мин)

### 1.0 VCN үүсгэх (эхлээд энэ — 2026-09-09 нэмэв)
Энгийн *Create VCN* форм нь **subnet ч, gateway ч үүсгэдэггүй** (зөвхөн хоосон VCN) тул дараа нь бүгдийг гараар үүсгэх шаардлагатай болно. Оронд нь wizard ашиглана:

1. **Networking → Virtual cloud networks → Start VCN Wizard**
2. **"Create VCN with Internet Connectivity"** → *Next*
3. Утгууд:
   - VCN name: `sugi-vcn`
   - Compartment: `tmorius (root)`
   - **VCN IPv4 CIDR block: `10.0.0.0/16`**
   - Public subnet IPv4 CIDR: `10.0.0.0/24`
   - Private subnet IPv4 CIDR: `10.0.1.0/24`
   - ✅ Use DNS hostnames in this VCN
4. *Next* → *Create*

Энэ нь **2 subnet + Internet Gateway + NAT Gateway + route table**-ыг нэг дор үүсгэнэ. Цаашид: **MySQL → private subnet (`10.0.1.0/24`)**, **NLB → public subnet (`10.0.0.0/24`)**.

### 1.1 MySQL DB System үүсгэх
1. Console → **Databases → MySQL → DB Systems** → *Create DB system*
2. Compartment: `tmorius (root)`
3. Нэр: `sugi-mysql`
4. **Standalone** сонгоно
5. Configuration хэсэгт **Always Free** сонголтыг заавал идэвхжүүлнэ (эс бөгөөс төлбөртэй shape сонгогдоно)
6. **Administrator username / password** — эндээ бичиж авна, дараа надад хэрэгтэй
7. Networking: VCN `sugi-vcn` + **private subnet (`10.0.1.0/24`)**
8. Data storage: 50 GB
9. *Create* → төлөв **Active** болтол ~10 мин хүлээнэ
10. Дууссаны дараа DB system-ийн **Private IP address**-ийг тэмдэглэж авна (ж: `10.0.1.x`)

### 1.2 Network Load Balancer үүсгэх
1. Console → **Networking → Load balancers → Network load balancer** → *Create*
2. Нэр: `sugi-mysql-nlb`, VCN: `sugi-vcn`, Subnet: **public subnet (`10.0.0.0/24`)**
3. **Assign a public IPv4 address** идэвхжүүлнэ
4. Listener: protocol **TCP**, port **3306**
5. Backend set: TCP, port **3306**, backend → дээрх MySQL DB system-ийн **private IP**
6. Health check: TCP, port 3306
7. *Create* → NLB-ийн **public IP**-г тэмдэглэнэ

### 1.3 Сүлжээний зөвшөөрөл
1. **MySQL-ийн private subnet**-ийн Security List → Ingress rule: Source = **`10.0.0.0/16`** (VCN-ийн CIDR), TCP, Destination port **3306**
2. **NLB-ийн public subnet**-ийн Security List → Ingress rule: Source = **өөрийн public IP/32** (эсвэл шаардвал `0.0.0.0/0`), TCP, Destination port **3306**
   - Өөрийн IP-г мэдэх: https://ifconfig.me

### 1.4 Надад илгээх мэдээлэл
```
NLB public IP : <ж: 140.83.x.x>
Admin user    : <1.1-д оруулсан нэр>
Admin password: <1.1-д оруулсан нууц үг>
```

---

## 2. Миний хийх алхмууд (аль хэдийн бэлэн)

`scripts/migrate-to-oracle-mysql.ps1` бичигдэж, dump хэсэг нь **бодитоор туршигдсан** (2026-09-09: 42 хүснэгт, 1,563 KB, GTID_PURGED 0, DEFINER 0).

```powershell
pwsh scripts/migrate-to-oracle-mysql.ps1 `
  -TargetUrl "mysql://<user>:<password>@<NLB public IP>:3306/defaultdb?ssl-mode=REQUIRED"
```

Script нь 3 алхмыг хийнэ:
1. Aiven-аас **OCI-д тохирсон флагтайгаар** dump хийнэ
2. Зорилтот сервер дээр schema үүсгээд restore хийнэ
3. **42 хүснэгт тус бүрийн мөрийн тоог эх/зорилтот хоёр талд харьцуулж** хэвлэнэ — нэг ч зөрүү байвал алдаа өгч зогсоно

### Яагаад энгийн `db-backup.ps1` + `db-restore.ps1` биш вэ (бодитоор шалгасан)
Aiven-ээс авсан энгийн dump нь **`SET @@GLOBAL.GTID_PURGED`** мэдэгдэл агуулдаг (mysqldump өөрөө анхааруулга өгдөг) бөгөөд үүнийг хэрэглэхэд **SUPER эрх** шаардагдана — OCI-ийн admin хэрэглэгчид тэр эрх БАЙХГҮЙ тул restore дунд замдаа унана. Мөн `avnadmin`@`%` гэсэн **DEFINER** нь зорилтот сервер дээр байхгүй тул view/trigger үүсэхгүй. Шинэ script эдгээрийг `--set-gtid-purged=OFF`, `--no-tablespaces` болон DEFINER-ийг арилгах post-process-оор шийддэг.

## 3. Шилжсэний дараа заавал хийх

1. `.env`-ийн `DATABASE_URL`-ийг шинэ утга руу солино (**хуучин Aiven утгыг comment болгож үлдээх** — буцах шаардлага гарвал шууд сэргээхэд)
2. `curl http://localhost:3000/health` → `{"ok":true,"database":"up"}`
3. Латентыг дахин хэмжинэ (174ms-аас хэд болсныг бодитоор харна)
4. **Бүрэн тест suite** шинэ DB дээр: `RUN_AUTH_INTEGRATION_TESTS=1 COMMERCE_INTEGRATION_TESTS=1 RUN_MEDIA_INTEGRATION_TESTS=1 pnpm exec vitest run --no-file-parallelism` → **542/542** гарах ёстой
5. `scripts/db-backup-daily.ps1`-ийн Windows Task Scheduler ажил шинэ DB рүү заасан эсэхийг шалгана
6. Aiven service-ийг **тэр дор нь устгахгүй** — 1-2 долоо хоног зэрэгцүүлэн үлдээж, шинэ DB тогтвортой ажиллаж байгааг батлаад дараа нь устгана

## 4. Мэдэгдэж буй эрсдэл / анхаарах зүйл

- **50 GB хязгаар**: одоогийн dump 1.5 MB тул ойрын жилүүдэд асуудалгүй. Зургууд R2-д хадгалагддаг (DB-д зөвхөн URL) тул DB хурдан томрохгүй.
- **Always Free-ийн нөхцөл**: Oracle 2026 оны 8-р сард Always Free-ийн compute хязгаарыг өөрчилсөн. DB system идэвхгүй байвал Oracle түүнийг зогсоох (reclaim) эрхтэй — production ачаалалтай бол асуудал болохгүй.
- **NLB нь TCP түвшинд ажилладаг** тул MySQL-ийн TLS end-to-end хэвээр (NLB нь шифрийг задлахгүй) — `ssl-mode=REQUIRED` ажиллана.
- **Hosting сонгогдсоны дараа**: аппликейшныг OCI compute дээр байрлуулбал NLB-г устгаад private IP-гээр шууд холбогдох нь илүү хурдан бөгөөд илүү аюулгүй.
