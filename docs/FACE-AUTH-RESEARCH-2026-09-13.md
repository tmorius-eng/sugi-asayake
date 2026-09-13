# Царай таних /admin хаалга — судалгаа ба дахин бүтээлт (2026-09-13)

Tom утсаараа (iPhone, Safari, `https://sugi.karkaron.com`) туршаад хоёр асуудал заав:
"Царай уншиж байна" **хэт удаан**; бүртгэл **хэт энгийн** — баруун тийш жаахан
эргүүлэхэд л бүртгэгдчихдэг, зүүн/дээш/доош/тойрох гэсэн юм байхгүй.
Хүсэлт: "хоёуланг нь илүү advanced, smooth болго; дэлхийн туршлага (paper, GitHub,
Reddit) судалж, хүмүүс хаана алдсаныг ол." Долоо хоногийн дараа захиралд үзүүлнэ.

## 1. Юу удаан байсан бэ — кодоос хэмжсэн шалтгаан

| Байсан | Үр дагавар |
|---|---|
| `captureFace()` frame бүрт **3 сүлжээ** ажиллуулдаг: tinyFaceDetector(416) + 68 landmark + **dlib ResNet descriptor** | Descriptor нь хамгийн хүнд алхам; утсанд ~0.5–1.5с/frame |
| Нэвтрэхэд **12 frame** (≥2.5с) бүгд descriptor-той | 12 × хүнд сүлжээ → iPhone дээр олон секунд |
| Бүртгэхэд толгой эргэхийг **хүлээх** давталт ч descriptor тооцоолдог | Хэрэггүй ачаалал, хойрго mesh |
| tfjs WebGL iOS Safari дээр хойрго ([face-api #764](https://github.com/justadudewhohacks/face-api.js/issues/764)) | Видео 2–3 frame гүйгээд зогсдог |
| Pose = 68 цэгээс гаргасан yaw ratio, босго 0.06 | "Бага зэрэг" эргүүлэхэд тэнцэнэ; pitch (дээш/доош) огт хэмжигддэггүй |

## 2. Судалгааны дүгнэлт (эх сурвалжтай)

**Tracking-ийг MediaPipe Face Landmarker руу шилжүүлэх.** 478 3D цэг, 52 ARKit
blendshape (`eyeBlinkLeft/Right`, `jawOpen`…), утасны GPU-д зориулж бүтээгдсэн
BlazeFace + attention mesh; WASM+GPU delegate; Apache-2.0 (арилжааны ашиглалт OK).
Эх сурвалж: [Face landmark detection guide for Web](https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js),
[Web AI showcase](https://webai.show/models/face-landmarker/),
[Medium — real-time face tracking with MediaPipe](https://medium.com/@kenzic/real-time-face-tracking-in-the-browser-with-mediapipe-7c818c96b4ca).

**Таних descriptor-ыг dlib хэвээр үлдээх.** ArcFace/InsightFace-ийн жинг арилжааны
бус лицензээр (shared/face-auth.ts-ийн шийдвэр); dlib ResNet public domain. Хамгийн
том хожил нь загвар солих биш, **хүнд сүлжээг цөөн удаа дуудах**: 12 → 3 (нэвтрэх),
"frame бүрт" → 9 snapshot (бүртгэх).

**Бүртгэл = Face ID-ийн тойрох дохио.** Apple-ийн загвар: толгойгоо тойруулан
эргүүлэхэд цагирагийн хэсгүүд дүүрнэ. Давуу тал: олон өнцөг богино хугацаанд,
хэрэглэгч дохиог мэднэ, "хажуугаар нь гүйлгээд өнгөрөх"-ийг тоолохгүй (N frame
барих шаардлага). Бид 8 чиглэл + төв = 9 view хадгална; нэвтрэхэд хамгийн ойрын
view-тэй тулгана (өмнөх `bestFaceDistance` логик хэвээр).

**Liveness: идэвхгүй хэмжилт, идэвхтэй саад биш.** ISO/IEC 30107-3-ийн үг хэллэг
(bona-fide/attack presentation, BPCER/APCER) — [Didit](https://didit.me/blog/iso-30107-3-biometric-liveness-detection/),
[iBeta](https://www.ibeta.com/iso-30107-3-presentation-attack-detection-confirmation-letters/).
Active (анивч/эргүүл) нь муу гэрэл, чичирхийлсэн камерт **false reject** ихтэй, хэрэглэгч
орхидог — [Passive vs Active](https://didit.me/blog/passive-liveness-detection-active-comparison/),
[Realeyes](https://realeyes.ai/blog/passive-liveness-vs-active-liveness/). Энэ төслийн
өмнөх бодит туршилт ч мөн адил (анивчилт/эргүүлэлт жинхэнэ хэрэглэгчийг дахин дахин
унагаж байсан — HISTORY.md). Тиймээс нэвтрэлт саадгүй хэвээр, харин blendshape-ээр
**байгалийн анивчилтыг** хэмжиж `livenessPassed`-д үнэнчээр бүртгэнэ
(`ADMIN_FACE_LIVENESS_ENFORCED` хэвээр опт-ин). Өнгөний flash арга (`evaluateFlashResponse`)
shared-д тесттэй хэвээр — шаардлагатай бол залгана.

**Хүмүүс хаана алддаг вэ (GitHub/Reddit/issue-ээс):**
- Frame бүрт хүнд сүлжээ ажиллуулах → утсанд халж, удаан (энэ төслийн яг алдаа).
- iOS Safari: нуугдсан `<video>`-г browser унтраадаг (`display:none` бол detection
  хоосон) — бидний video харагдаж байгаа, `playsInline muted` ([SitePoint](https://www.sitepoint.com/face-api-js-face-detection/)).
- WebGL context iPhone дээр ~15–18 мин дараа унадаг ([tfjs #4309](https://github.com/tensorflow/tfjs/issues/4309)) —
  бидний flow 30с-ээс богино, дуусмагц камер/renderer зогсоно.
- Fixed threshold (EAR, px) хүн бүрт тохирдоггүй → blendshape (модель гаралт) ашиглав.
- Хэт цөөн зургаар сургасан liveness "заримдаа л ажилладаг" ([face-recognition-with-liveness-web-login](https://github.com/jomariya23156/face-recognition-with-liveness-web-login)) —
  бид liveness-ийг өөрөө сургахгүй, хэмжигдэхүйц дохио (анивчилт) л бүртгэнэ.
- Толгойн чиглэлийн тэмдэг урвуу гарах (өмнө нь энэ төсөлд 2 удаа) → `shared/face-pose.ts`-д
  тэмдэг бүрийг unit-тестээр баталгаажуулав (25 тест).
- Descriptor-ыг хэт жижиг/бүдэг crop-оос авах → хүн бүр ижил харагдана (2026-09-08-ны
  буруу хүн орсон осол) — framing gate хэвээр (face ≥26% өргөн, төвд, хөдөлгөөнгүй).

## 3. Хэрэгжүүлсэн зүйл

- `shared/face-pose.ts` (шинэ, цэвэр математик): yaw/pitch/roll ratio, framing gate,
  `CoverageTracker` (8 сектор + төв, N frame барих), `BlinkDetector` (blendshape),
  `StillnessTracker`. `server/face-pose.test.ts` — 25 тест.
- `client/src/lib/faceTracker.ts` (шинэ): MediaPipe wrapper — GPU→CPU fallback,
  timestamp монотон, mesh зурах, `snapshotFrame`.
- `client/src/lib/faceEngine.ts`: `captureFace` одоо snapshot canvas-аас ч уншина;
  `SmoothMeshRenderer` зурах функцээ авдаг болов.
- `client/src/components/AdminFaceGate.tsx`: бүртгэл = цагираг (arrow + дараагийн
  чиглэлийн заавар + "5/9"), дараа нь descriptor-уудыг тоологдох progress-той
  боловсруулна; нэвтрэлт = 3 хөдөлгөөнгүй frontal snapshot, анивчилт хэмжинэ.
- Сервер: `poses` дээд 8→12; CSP `script-src` дээр `'wasm-unsafe-eval'`;
  `/face-models/*` 7 хоногийн cache.
- Өөрийн сервер дээр: `client/public/face-models/mediapipe/face_landmarker.task` (3.7MB)
  + `wasm/` (simd + nosimd, ~23MB). CDN хэрэглэхгүй (нууцлал, блоклогдох эрсдэл).

## 4. Хийгээгүй / дараагийн алхам

- Бодит утсан дээрх хурдны тоо (Tom). Хүлээлт: tracking 25 fps, нэвтрэлт нийт 2–4с.
- Хэрэв нэвтрэлтэд идэвхтэй liveness ХЭРЭГТЭЙ болбол: `BlinkDetector` аль хэдийн
  хэмжиж байгаа тул `ADMIN_FACE_LIVENESS_ENFORCED=1` + UI-д "нэг анивчина уу" мөр
  нэмэхэд л хангалттай.
- FACE_MODEL_VERSION өөрчлөөгүй (descriptor pipeline ижил) — хуучин 3-pose бүртгэлүүд
  хүчинтэй хэвээр, харин шинэ 9-view бүртгэл илүү найдвартай тул ажилтнуудыг дахин
  бүртгүүлэхийг зөвлөнө (Хэрэглэгч → царайн бүртгэл устгах).
