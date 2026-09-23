/**
 * Admin царайны хаалга (2026-09-13) — MediaPipe Face Landmarker-ээр бодит
 * цагийн царайн TRACKING, ажилтны хөтөч дээр өөрөө hosting хийсэн WebAssembly-
 * ээр ажиллана.
 *
 * Хөдөлмөрийн хуваарь — хаалга хурдан болсны бүх шалтгаан:
 *
 *   MediaPipe (энэ файл)      frame бүр     478 3-D цэг, 52 blendshape
 *                                           → framing, толгойн байрлал, анивчилт,
 *                                             хөдөлгөөнгүй байдал, дэлгэцийн mesh
 *   dlib / face-api (faceEngine.ts) цөөн   128 тооны таних descriptor
 *                             snapshot      → таних шийдвэр
 *
 * Хуучин урсгал dlib descriptor сүлжээг frame БҮРТ, толгойгоо эргүүлэхийг хүлээж
 * байх frame-үүдэд ч ажиллуулж байв. Утсан дээр тэр сүлжээ хамгийн үнэтэй алхам
 * тул "царай уншиж байна" маш удаан байсан. Одоо нэвтрэхэд 3, бүртгэхэд 9 удаа,
 * tracker сайн гэсэн frame-үүд дээр л ажиллана.
 *
 * Эндээс ч юу ч төхөөрөмжөөс гарахгүй: цэг, blendshape локалд хэрэглэгдээд хаягдана.
 *
 * Asset-ууд энэ origin-оос (client/public/face-models/mediapipe): .task загвар ба
 * wasm runtime. CDN биш — dlib жингүүдийг өөрөө hosting хийсэнтэй ижил шалтгаан:
 * хэн нэгэн нэвтэрч байгааг гуравдагч тал мэдэхгүй, CDN хаагдсан ч хаалга ажиллана.
 * CSP яг үүнд 'wasm-unsafe-eval' зөвшөөрнө.
 */

import type { FaceLandmarker as FaceLandmarkerType, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { blendshapeMap, type Blendshapes, type MpLandmarks } from "@shared/face-pose";
import { isAppleMobile } from "./device";
import { withTimeout } from "./withTimeout";

/**
 * wasm runtime (~11 MB) + загвар (~3.7 MB) утасны сүлжээгээр ТАТАХ хугацаа.
 * 2026-09-23 засвар: `forVisionTasks()` нь зөвхөн URL угсардаг — бодит татаалт
 * `createFromOptions` дотор болдог байсан тул 12 с-ийн "GPU үүсгэх" хугацаа
 * 15 MB татаалтыг ч хамарч, удаан сүлжээнд GPU → CPU хоёулаа унадаг байв.
 * Одоо татаалтыг ЭХЛЭЭД, өөрийн хугацаатай хийж, үүсгэх хугацаа нь зөвхөн
 * санах ойд байгаа файлаас instance үүсгэхийг хэмжинэ.
 */
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** GPU delegate-ийг (файл аль хэдийн татагдсан үед) үүсгэх хугацаа — хэтэрвэл CPU. */
const GPU_CREATE_TIMEOUT_MS = 15_000;
const CPU_CREATE_TIMEOUT_MS = 45_000;

/** Файлыг бүтэн уншина — `ok` биш бол алдаа (SPA fallback-ийн HTML-ийг загвар гэж авахгүй). */
async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TRACKER_LOAD ${response.status} ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

const MP_BASE = "/face-models/mediapipe";

let landmarker: FaceLandmarkerType | null = null;
/** "GPU" or "CPU" -- whichever delegate the landmarker was created with. */
let delegateUsed: "GPU" | "CPU" | "?" = "?";
export function trackerDelegate(): string {
  return delegateUsed;
}
let loadPromise: Promise<void> | null = null;
/** MediaPipe demands strictly increasing timestamps per landmarker instance;
 *  two frames in the same millisecond throw. Tracked here so callers can't
 *  get it wrong. */
let lastTimestamp = 0;

export type TrackerError = "TRACKER_LOAD";

/**
 * Loads the wasm runtime and the model, once per page load. Idempotent like
 * loadFaceModels() so it can be kicked off in parallel with the camera and
 * the dlib weights.
 *
 * GPU delegate first (WebGL2; what phones want), CPU as the fallback -- the
 * same shape as faceEngine's WebGL→CPU fallback, for the same hardened-
 * browser reasons.
 */
export function loadFaceTracker(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
        // Татаалт НЭГ удаа: загварыг buffer-аар дамжуулна (GPU ба CPU оролдлого
        // хоёулаа түүнийг хэрэглэнэ), wasm-ийг бүтэн уншиж HTTP кэшэд
        // оруулна (сервер face-models-ийг 7 хоног кэшлэдэг) — тэгвэл
        // createFromOptions дахин татахгүй, CPU руу шилжихэд ч 11 MB-ийг
        // хоёр дахь удаа зэрэг татахгүй.
        const [modelBytes] = await withTimeout(Promise.all([
          fetchBytes(`${MP_BASE}/face_landmarker.task`),
          fetchBytes(fileset.wasmBinaryPath),
          fetchBytes(fileset.wasmLoaderPath),
        ]), DOWNLOAD_TIMEOUT_MS, "TRACKER_LOAD");
        const base = {
          // Оролдлого бүр өөрийн ХУУЛБАРТАЙ: MediaPipe buffer-ийг wasm руу
          // шилжүүлэхдээ detach хийвэл CPU оролдлого хоосон загвар авах байсан.
          baseOptions: { modelAssetBuffer: modelBytes.slice(), delegate: "GPU" as const },
          runningMode: "VIDEO" as const,
          numFaces: 2,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };
        const createCpu = () => withTimeout(
          vision.FaceLandmarker.createFromOptions(fileset, { ...base, baseOptions: { modelAssetBuffer: modelBytes.slice(), delegate: "CPU" } }),
          CPU_CREATE_TIMEOUT_MS,
          "TRACKER_LOAD",
        );
        // 🔴 2026-09-23: iPhone/iPad дээр GPU delegate-ийг ОГТ оролдохгүй.
        // Tom-ийн iPhone дээр хаалга "Загвар ачааллаж байна…" дээр мөнхөд
        // гацсан: GPU (WebGL2/OffscreenCanvas) үүсгэлт iOS Safari дээр алдаа
        // ШИДЭХГҮЙГЭЭР гацаж болдог тул доорх catch → CPU хэзээ ч
        // ажилладаггүй байв. iPhone-ий CPU + wasm SIMD энэ загварт хангалттай.
        // Бусад төхөөрөмж дээр GPU-г хугацаатай оролдож, хэтэрвэл CPU.
        if (isAppleMobile()) {
          landmarker = await createCpu();
          delegateUsed = "CPU";
        } else {
          const gpuAttempt = vision.FaceLandmarker.createFromOptions(fileset, base);
          try {
            landmarker = await withTimeout(gpuAttempt, GPU_CREATE_TIMEOUT_MS, "TRACKER_GPU_TIMEOUT");
            delegateUsed = "GPU";
          } catch {
            // Хугацаа хэтэрсэн GPU оролдлого ард үргэлжилсээр байдаг — хожим
            // амжилттай болбол WebGL context + wasm heap-ээ суллахгүй бол
            // "Дахин оролдох" бүрт нэг instance алдагдана.
            gpuAttempt.then(late => late.close()).catch(() => undefined);
            landmarker = await createCpu();
            delegateUsed = "CPU";
          }
        }
      } catch {
        loadPromise = null;
        throw new Error("TRACKER_LOAD");
      }
    })();
  }
  return loadPromise;
}

export type TrackedFrame = {
  /** How many faces the model saw (numFaces caps it at 2 -- enough to know
   *  "more than one"). */
  faces: number;
  /** Landmarks of the first face, normalised to the frame, or null. */
  landmarks: MpLandmarks | null;
  blendshapes: Blendshapes;
};

/**
 * Runs the landmarker on the current video frame. Synchronous once loaded --
 * MediaPipe's video mode is designed to be called from a requestAnimationFrame
 * loop -- and cheap enough to do so on a phone.
 */
export function trackFrame(video: HTMLVideoElement): TrackedFrame {
  if (!landmarker) throw new Error("TRACKER_LOAD");
  if (video.readyState < 2 || video.videoWidth === 0) return { faces: 0, landmarks: null, blendshapes: new Map() };

  let timestamp = performance.now();
  if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1;
  lastTimestamp = timestamp;

  let result: FaceLandmarkerResult;
  try {
    result = landmarker.detectForVideo(video, timestamp);
  } catch {
    return { faces: 0, landmarks: null, blendshapes: new Map() };
  }
  const landmarks = result.faceLandmarks?.[0] ?? null;
  return {
    faces: result.faceLandmarks?.length ?? 0,
    landmarks,
    blendshapes: blendshapeMap(result.faceBlendshapes?.[0]?.categories),
  };
}

// ---------------------------------------------------------------------------
// Mesh overlay from the 478-point model.
//
// Drawn from the model's own contour connection lists (face oval, eyes,
// brows, lips) plus a sparse scatter of the remaining points, so it is an
// honest picture of what the tracker sees -- same principle as the old
// 68-point mesh, with a denser, more obviously "3-D" look.
// ---------------------------------------------------------------------------

type Connection = { start: number; end: number };
let contours: Connection[] | null = null;

/** Every ~4th landmark, drawn as a dot. Enough to read as a mesh, few
 *  enough that the canvas stays cheap on a phone. */
const DOT_STRIDE = 4;

async function loadContours(): Promise<Connection[]> {
  if (contours) return contours;
  const { FaceLandmarker } = await import("@mediapipe/tasks-vision");
  contours = [
    ...FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    ...FaceLandmarker.FACE_LANDMARKS_LIPS,
  ];
  return contours;
}

/** Kick the contour tables loading alongside the model so the first frame
 *  can draw. Safe to call any time. */
export function warmMeshContours(): void {
  void loadContours().catch(() => undefined);
}

/**
 * Draws the tracked mesh onto an overlay canvas. Points are normalised
 * (0..1); the canvas is mirrored to sit on the mirrored preview, exactly as
 * faceEngine.drawFaceMesh does for the 68-point layout.
 */
/** Overlay canvases are shown at ~300 CSS px, so a 1280x720 backing store
 *  was 4x the pixels the screen can use, repainted 60 times a second. The
 *  landmarks are normalised, so any size draws correctly. */
export const OVERLAY_MAX_WIDTH = 640;
export function overlaySize(video: HTMLVideoElement): { width: number; height: number } {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const scale = Math.min(1, OVERLAY_MAX_WIDTH / w);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

export function drawTrackedMesh(canvas: HTMLCanvasElement, video: HTMLVideoElement, landmarks: MpLandmarks | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = overlaySize(video);
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks || !contours) return;

  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.max(w, h) / 640;

  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);

  ctx.strokeStyle = "rgba(150, 210, 255, .8)";
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  for (const { start, end } of contours) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) continue;
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, .55)";
  for (let i = 0; i < landmarks.length; i += DOT_STRIDE) {
    const p = landmarks[i];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 1.3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Copies the current video frame into a canvas, for the descriptor network to
 * read later. Cheap (one drawImage) so the tracking loop is never held up by
 * the expensive step; the canvases are processed after the ring completes.
 */
export function snapshotFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return canvas;
}

/**
 * Snapshot-ийн canvas-ийн санах ойг ШУУД суллана (2026-09-23). iOS Safari нь
 * бүх canvas-д нийт санах ойн дээд хязгаартай бөгөөд GC болтол суллахгүй —
 * 1280×720 snapshot тус бүр ~3.7 MB тул хэдэн "Дахин оролдох"-ын дараа
 * `getContext` null буцааж, snapshot хоосон болж "царай олдсонгүй" гэж
 * андуурагддаг байв. Descriptor гаргасны дараа (эсвэл хаясан frame) дуудна.
 */
export function releaseSnapshot(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
