/**
 * Admin царайны хаалга (2026-09-08) — царай шалгалтын хөтчийн тал.
 *
 * Энэ файлын бүх зүйл ажилтны өөрийн машин дээр ажиллана. Камерын frame хэзээ ч
 * upload хийгдэхгүй: загвар frame-ийг энд 128 тоо болгож, зөвхөн тэр тоонууд
 * сервер рүү явна. Энэ дизайн хил дамнасан өгөгдлийн мэдэгдэл шаарддаггүй,
 * хаана ч гэрэл зураг хадгалдаггүйн бүх шалтгаан энэ.
 *
 * Загвар: dlib-ийн face_recognition_resnet_model_v1, @vladmandic/face-api-аар
 * (хоёулаа MIT / public domain — илүү нарийвчлалтай ArcFace гэр бүлийг лицензийн
 * үүднээс санаатай татгалзсан шалтгааныг shared/face-auth.ts-ээс үзнэ).
 *
 * Алдааны боловсруулалт санаатайгаар нягт. Судалж тогтоосон, энэ файлын урьдчилан
 * сэргийлэх алдаанууд, тус бүрийн шалтгаантай:
 *
 *  - "The highest priority backend has not yet been initialized" — TFJS backend-
 *    ээ асинхрон тодорхойлдог; `tf.ready()`-ээс өмнө загвар дуудвал уралдана.
 *    loadFaceModels()-д бэлэн болохыг нэг удаа хүлээснээр засав.
 *  - Санах ойн алдагдал (face-api issue #205/#345/#25) — гараар үүсгэсэн тензор
 *    дээрх detect бүр GPU санах ой авдаг, дуудагч чөлөөлөх ёстой ч бараг хэн ч
 *    хийдэггүй. <video> ЭЛЕМЕНТ дамжуулснаар бүрмөсөн зайлсхийв — сан завсрын
 *    тензоруудаа өөрөө хариуцна.
 *  - Урт session-д GPU санах ой аажим өсөх — TFJS input хэлбэр бүрт texture
 *    кэшлэдэг тул хувьсах хэмжээ frame бүрт шинийг авна. Тогтмол detector
 *    inputSize-аар зайлсхийв.
 *  - Detection чимээгүй юу ч буцаахгүй байх — stream-тэй ч decode хийгдсэн
 *    frame-гүй <video> өргөн 0 гэж мэдээлдэг, detector 0 пикселийн зурагнаас
 *    0 царай олдог. readyState БА хэмжээгээр хаалт тавив.
 *  - getUserMedia алдааны нэр хөтөч бүрт өөр (Safari OverconstrainedError,
 *    Chrome NotFoundError камергүй үед) тул баримтлагдсан нэр бүрийг + fallback-
 *    ийг map хийв.
 */

// TYPE-ONLY import: erased at compile time, so it costs nothing at runtime.
// The library itself is loaded dynamically in loadFaceModels() below --
// face-api plus its bundled TensorFlow.js is ~1.4MB, and bundling it
// statically pulled all of it into the main admin chunk, making every admin
// page load pay for it even when the gate is switched off or this device has
// already passed its check. With the dynamic import it is fetched only at the
// moment a face check actually runs.
import type * as FaceApi from "@vladmandic/face-api";
import {
  FACE_MAX_CENTER_OFFSET_RATIO,
  FACE_MIN_BOX_RATIO,
  FACE_MIN_DETECTION_SCORE,
  FACE_MODEL_URL,
} from "@shared/face-auth";
import { withTimeout } from "./withTimeout";

/** Fixed on purpose — see the GPU-memory note in the file header. 320 is the
 *  a tinyFaceDetector size that keeps detection accurate on the 720p frames
 *  now being captured -- 320 was tuned for VGA and located the face box less
 *  precisely on a larger frame, which in turn shifts the alignment the
 *  recognition crop depends on. Still real-time on integrated graphics. */
const DETECTOR_INPUT_SIZE = 416;

/**
 * TFJS's backend-control methods exist at runtime (face-api bundles the full
 * tfjs-core) but are NOT in the `tf` namespace its .d.ts re-exports — that
 * namespace lists only the tensor ops face-api itself calls. Rather than cast
 * the whole module to `any`, this names exactly the three functions used
 * here, so a typo in one of them is still a type error.
 *
 * If a future face-api release exports these properly, delete this and use
 * `faceapi.tf` directly.
 */
type TfBackendControls = {
  ready(): Promise<void>;
  getBackend(): string;
  setBackend(name: string): Promise<boolean>;
};

/** Set by loadFaceModels() once the dynamic import resolves. Every function
 *  below that needs the library goes through requireFaceApi(), so calling one
 *  before the models are loaded fails with a clear error instead of a
 *  confusing "cannot read property of undefined". */
let faceapi: typeof FaceApi | null = null;

function requireFaceApi(): typeof FaceApi {
  if (!faceapi) throw new Error("MODEL_LOAD");
  return faceapi;
}

let modelsPromise: Promise<void> | null = null;

/** TFJS-ийн backend эхлэх хугацаа — хэтэрвэл CPU backend (2026-09-23). */
const BACKEND_TIMEOUT_MS = 10_000;
/** Гурван загварын татах хязгаар (6.8 MB утасны сүлжээгээр). */
const MODEL_DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Loads the three model files, once per page load.
 *
 * Idempotent by design: the gate component can call this from several places
 * (mount, retry, re-enroll) without ever downloading 6.8MB twice or racing
 * two loads against each other.
 */
export function loadFaceModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      try {
        faceapi = await import("@vladmandic/face-api");
      } catch {
        modelsPromise = null;
        throw new Error("MODEL_LOAD");
      }

      const lib = faceapi;
      const tfBackend = lib.tf as unknown as TfBackendControls;

      try {
        // Must come first. TFJS picks its backend asynchronously, and calling
        // a model before that resolves throws the "highest priority backend
        // has not yet been initialized" error people hit constantly.
        // 2026-09-23: хугацаатай — iOS Safari дээр WebGL backend-ийн эхлэл
        // алдаа шидэхгүйгээр гацаж болдог (доорх CPU fallback-д шилжинэ).
        await withTimeout(tfBackend.ready(), BACKEND_TIMEOUT_MS, "MODEL_BACKEND_TIMEOUT");
      } catch {
        // Non-fatal on its own — the loads below will fail with something
        // more specific if the backend is genuinely unusable.
      }

      // WebGL is dramatically faster, but it is unavailable on machines with
      // GPU acceleration disabled, old drivers, or hardened browser settings
      // -- exactly the shop-computer situations this has to survive. Fall
      // back to CPU rather than failing: slower per frame, still correct.
      if (tfBackend.getBackend() !== "webgl") {
        try {
          await withTimeout(tfBackend.setBackend("webgl"), BACKEND_TIMEOUT_MS, "MODEL_BACKEND_TIMEOUT");
          await withTimeout(tfBackend.ready(), BACKEND_TIMEOUT_MS, "MODEL_BACKEND_TIMEOUT");
        } catch {
          try {
            await withTimeout(tfBackend.setBackend("cpu"), BACKEND_TIMEOUT_MS, "MODEL_BACKEND_TIMEOUT");
            await withTimeout(tfBackend.ready(), BACKEND_TIMEOUT_MS, "MODEL_BACKEND_TIMEOUT");
          } catch {
            // 2026-09-23: бусад алдааны замтай адил reset — эс бөгөөс
            // "Дахин оролдох" хуудсыг сэргээх хүртэл ижил татгалзсан promise-ийг
            // буцааж, дахин оролдох боломжгүй байв.
            modelsPromise = null;
            throw new Error("MODEL_BACKEND");
          }
        }
      }

      try {
        // 2026-09-23: хугацаатай (6.8 MB утасны сүлжээгээр) — мөнхийн спиннер биш.
        await withTimeout(Promise.all([
          lib.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
          lib.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
          lib.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
        ]), MODEL_DOWNLOAD_TIMEOUT_MS, "MODEL_LOAD");
      } catch {
        // Reset so a later retry can try again instead of being stuck with a
        // permanently rejected cached promise.
        modelsPromise = null;
        throw new Error("MODEL_LOAD");
      }
    })();
  }
  return modelsPromise;
}

/**
 * Runs each network once on a tiny blank canvas (2026-09-13).
 *
 * The first inference on the WebGL backend is where TFJS compiles its
 * shaders -- one to two seconds on an integrated GPU, and it used to land
 * exactly at "Боловсруулж байна…", after the person had already done their
 * part. Tom saw the spinner sit there on a laptop and called the whole thing
 * laggy. Paying that cost while the camera is still opening (this is called
 * right after loadFaceModels, never awaited by the UI) makes the descriptor
 * step later feel instant. A 160px blank frame finds no face, which is
 * fine: the detector's shaders are what compile; the landmark and
 * recognition nets are exercised on a synthetic 150px crop below.
 */
let warmedUp: Promise<void> | null = null;
export function warmUpFaceModels(): Promise<void> {
  if (!warmedUp) {
    warmedUp = (async () => {
      const lib = requireFaceApi();
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.fillStyle = "#888"; ctx.fillRect(0, 0, 160, 160); }
      try {
        await lib.detectAllFaces(canvas, new lib.TinyFaceDetectorOptions({ inputSize: DETECTOR_INPUT_SIZE, scoreThreshold: FACE_MIN_DETECTION_SCORE }));
        // Landmark + recognition nets take an aligned face; a blank 150px
        // canvas is enough to trigger their shader compilation.
        const face = document.createElement("canvas");
        face.width = 150;
        face.height = 150;
        await lib.nets.faceLandmark68Net.detectLandmarks(face);
        await lib.nets.faceRecognitionNet.computeFaceDescriptor(face);
      } catch {
        // Warm-up is best effort; a failure here surfaces properly on the
        // real call with the real error handling.
      }
    })();
  }
  return warmedUp;
}

/** Which TFJS backend the recogniser ended up on -- "webgl" is the fast
 *  path, "cpu" is the slow fallback. Reported in the verification
 *  diagnostic so a slow machine is diagnosable from the Security Center. */
export function faceBackendName(): string {
  try {
    return ((faceapi?.tf as unknown as TfBackendControls | undefined)?.getBackend?.() ?? "?");
  } catch {
    return "?";
  }
}

export type CameraError =
  | "INSECURE_CONTEXT"
  | "UNSUPPORTED"
  | "DENIED"
  | "NOT_FOUND"
  | "IN_USE"
  | "CONSTRAINTS"
  | "UNKNOWN";

export class FaceCameraError extends Error {
  constructor(public readonly kind: CameraError) {
    super(kind);
    this.name = "FaceCameraError";
  }
}

/**
 * Opens the camera and returns the stream.
 *
 * Every documented getUserMedia rejection is mapped to its own cause, because
 * "camera failed" is useless to the person standing there: "another program
 * is using your camera" and "you denied permission" need completely
 * different actions from them.
 */
export async function startCamera(): Promise<MediaStream> {
  // getUserMedia simply does not exist off a secure origin, so without this
  // check the failure looks like an unsupported browser rather than the real
  // cause. localhost counts as secure, so dev is unaffected.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new FaceCameraError("INSECURE_CONTEXT");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new FaceCameraError("UNSUPPORTED");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // "ideal", never "exact": an exact constraint is what produces
        // OverconstrainedError on webcams that cannot hit the requested mode,
        // and any reasonable resolution works fine for face recognition.
        // 1280x720 rather than 640x480: the recognition network crops a
        // 150x150 aligned face out of this frame, and at VGA a normally-
        // seated face did not contain that much real detail, so the crop was
        // upscaled and the resulting descriptors were too alike between
        // different people. This is a request, not a demand ("ideal"), so a
        // webcam that cannot do 720p still works at whatever it offers.
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      },
    });
  } catch (error) {
    const name = (error as DOMException)?.name ?? "";
    switch (name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        throw new FaceCameraError("DENIED");
      case "NotFoundError":
      case "DevicesNotFoundError":
        throw new FaceCameraError("NOT_FOUND");
      case "NotReadableError":
      case "TrackStartError":
        throw new FaceCameraError("IN_USE");
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        // Safari raises this for a missing camera where Chrome raises
        // NotFoundError, so it is deliberately not treated as a pure
        // constraints problem in the UI copy.
        throw new FaceCameraError("CONSTRAINTS");
      case "SecurityError":
        throw new FaceCameraError("INSECURE_CONTEXT");
      default:
        throw new FaceCameraError("UNKNOWN");
    }
  }
}

/** Releases the camera. Called on unmount, on cancel, and after a successful
 *  check — the camera light must never stay on longer than the flow needs. */
export function stopCamera(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach(track => track.stop());
}

export type QualityIssue = "NO_FACE" | "MULTIPLE_FACES" | "TOO_FAR" | "OFF_CENTER" | "LOW_CONFIDENCE";

export type FaceSample = {
  descriptor: number[];
  landmarks: readonly { x: number; y: number }[];
  box: FaceApi.Box;
  score: number;
};

export type CaptureResult =
  | { ok: true; sample: FaceSample }
  | { ok: false; issue: QualityIssue };

/**
 * Runs one detection pass over the current video frame and applies the
 * quality gates.
 *
 * The gates are not padding: the most common cause of a face system rejecting
 * its own enrolled user later is a poor frame accepted at enrollment (too far
 * away, half out of shot). Rejecting those here — with a specific reason the
 * UI turns into "move closer" — is what keeps false rejections low.
 */
/** Either the live <video> or a frame copied out of it (faceTracker's
 *  snapshotFrame). Since 2026-09-13 the descriptor is computed from
 *  snapshots chosen by the MediaPipe tracker, after the fact, so the tracking
 *  loop is never blocked by this -- the expensive -- step. */
export type FaceInput = HTMLVideoElement | HTMLCanvasElement;

function inputSize(input: FaceInput): { width: number; height: number } {
  return input instanceof HTMLVideoElement
    ? { width: input.videoWidth, height: input.videoHeight }
    : { width: input.width, height: input.height };
}

export async function captureFace(
  video: FaceInput,
  /** Loosened for enrolment snapshots of a deliberately turned head, whose
   *  projected width is narrower than a frontal one. */
  minBoxRatio: number = FACE_MIN_BOX_RATIO,
): Promise<CaptureResult> {
  // A <video> with a live stream still reports 0x0 until the first frame is
  // decoded, and the detector finds no faces in a zero-pixel image. Treated
  // as "no face yet" so the caller simply tries the next frame.
  if (video instanceof HTMLVideoElement && video.readyState < 2) return { ok: false, issue: "NO_FACE" };
  const { width: frameWidth, height: frameHeight } = inputSize(video);
  if (frameWidth === 0 || frameHeight === 0) return { ok: false, issue: "NO_FACE" };

  const lib = requireFaceApi();
  const options = new lib.TinyFaceDetectorOptions({
    inputSize: DETECTOR_INPUT_SIZE,
    scoreThreshold: FACE_MIN_DETECTION_SCORE,
  });

  // Passing the ELEMENT (not a hand-made tensor) is deliberate: face-api
  // allocates and disposes the intermediate tensors itself in that path,
  // which is what avoids the well-documented leak in issues #205/#345/#25.
  //
  // detectAllFaces rather than detectSingleFace on purpose -- "is there
  // exactly one person in shot?" is a real security question here (someone
  // else's face must not be silently picked), and detectSingleFace would
  // just return the best one without telling us a second person was present.
  const detections = await lib
    .detectAllFaces(video, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length === 0) return { ok: false, issue: "NO_FACE" };
  if (detections.length > 1) return { ok: false, issue: "MULTIPLE_FACES" };

  const detection = detections[0];
  const { box, score } = detection.detection;

  if (score < FACE_MIN_DETECTION_SCORE) return { ok: false, issue: "LOW_CONFIDENCE" };

  if (box.width / frameWidth < minBoxRatio) {
    return { ok: false, issue: "TOO_FAR" };
  }

  const offsetX = Math.abs((box.x + box.width / 2) - frameWidth / 2) / frameWidth;
  const offsetY = Math.abs((box.y + box.height / 2) - frameHeight / 2) / frameHeight;
  if (offsetX > FACE_MAX_CENTER_OFFSET_RATIO || offsetY > FACE_MAX_CENTER_OFFSET_RATIO) {
    return { ok: false, issue: "OFF_CENTER" };
  }

  return {
    ok: true,
    sample: {
      descriptor: Array.from(detection.descriptor),
      landmarks: detection.landmarks.positions,
      box,
      score,
    },
  };
}

// ---------------------------------------------------------------------------
// Live face-mesh overlay — the wireframe drawn over the face while scanning.
//
// Purely visual, and deliberately so: it renders the SAME 68 landmark points
// the recogniser is actually using, so it is an honest depiction of what the
// system sees rather than decorative theatre. It also gives the person
// immediate feedback that they are being tracked, which is why every real
// eKYC flow shows something like it.
// ---------------------------------------------------------------------------

/** Landmark groups drawn as closed loops (eyes, mouth) vs open paths (jaw,
 *  brows, nose). Indices are into the standard 68-point layout. */
const MESH_PATHS: { points: number[]; closed: boolean }[] = [
  { points: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], closed: false },   // jaw
  { points: [17, 18, 19, 20, 21], closed: false },                                          // left brow
  { points: [22, 23, 24, 25, 26], closed: false },                                          // right brow
  { points: [27, 28, 29, 30], closed: false },                                              // nose bridge
  { points: [31, 32, 33, 34, 35], closed: false },                                          // nostrils
  { points: [36, 37, 38, 39, 40, 41], closed: true },                                       // left eye
  { points: [42, 43, 44, 45, 46, 47], closed: true },                                       // right eye
  { points: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], closed: true },               // outer lip
  { points: [60, 61, 62, 63, 64, 65, 66, 67], closed: true },                               // inner lip
];

/** Extra spans that turn the separate outlines into a connected mesh, the way
 *  the reference images look. Chosen to span the cheeks and forehead, which
 *  the 68-point model has no landmarks of its own for. */
const MESH_BRIDGES: [number, number][] = [
  [17, 36], [21, 39], [22, 42], [26, 45],   // brows to eyes
  [39, 27], [42, 27],                        // inner eyes to nose bridge
  [36, 31], [45, 35],                        // outer eyes to nostrils
  [31, 48], [35, 54],                        // nostrils to mouth corners
  [0, 36], [16, 45],                         // jaw to outer eyes
  [3, 48], [13, 54],                         // jaw to mouth corners
  [5, 57], [11, 57],                         // lower jaw to chin/lip
  [30, 51],                                  // nose tip to upper lip
];

/**
 * Draws the landmark mesh onto an overlay canvas sized to the video.
 *
 * The canvas is mirrored to match the preview (which is CSS-flipped so that
 * moving left on screen matches moving left in reality) -- without this the
 * mesh would slide the opposite way to the face under it.
 */
export type LandmarkSet = readonly { x: number; y: number }[];

export function drawFaceMesh(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: LandmarkSet | null,
  box: FaceApi.Box | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Match the canvas's backing store to the video's real pixel size, or the
  // mesh lands at the wrong scale.
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks || !box) return;

  ctx.save();
  // Mirror horizontally to sit on top of the mirrored preview.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  const points = landmarks;
  const scale = Math.max(canvas.width, canvas.height) / 640;

  // --- corner brackets around the detected face -------------------------
  const pad = box.width * 0.12;
  const bx = box.x - pad;
  const by = box.y - pad;
  const bw = box.width + pad * 2;
  const bh = box.height + pad * 2;
  const arm = Math.min(bw, bh) * 0.22;
  ctx.strokeStyle = "rgba(255, 214, 92, .95)";
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = "round";
  for (const [cx, cy, dx, dy] of [
    [bx, by, 1, 1],
    [bx + bw, by, -1, 1],
    [bx, by + bh, 1, -1],
    [bx + bw, by + bh, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * arm);
    ctx.stroke();
  }

  // --- mesh lines --------------------------------------------------------
  ctx.strokeStyle = "rgba(150, 210, 255, .75)";
  ctx.lineWidth = 1.1 * scale;

  for (const path of MESH_PATHS) {
    ctx.beginPath();
    path.points.forEach((index, i) => {
      const p = points[index];
      if (!p) return;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (path.closed) ctx.closePath();
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(150, 210, 255, .4)";
  ctx.beginPath();
  for (const [a, b] of MESH_BRIDGES) {
    const pa = points[a];
    const pb = points[b];
    if (!pa || !pb) continue;
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
  }
  ctx.stroke();

  // --- landmark dots -----------------------------------------------------
  ctx.fillStyle = "rgba(255, 255, 255, .92)";
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.7 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Smooth 60fps mesh renderer.
 *
 * Detection runs at roughly 10-15fps -- it is a neural network, not a cheap
 * operation -- so drawing the mesh only when a detection lands makes it snap
 * between positions and look broken even though the tracking is fine.
 *
 * This decouples the two: detections are fed in as they arrive, and a
 * requestAnimationFrame loop draws continuously at the display's refresh
 * rate, interpolating between the previous and latest landmark sets. The
 * mesh then glides with the face instead of stuttering behind it.
 *
 * Interpolation is per-point and eased, so a fast head movement still tracks
 * closely rather than lagging noticeably behind.
 */
export class SmoothMeshRenderer {
  private previous: { points: LandmarkSet; box: FaceApi.Box | null } | null = null;
  private latest: { points: LandmarkSet; box: FaceApi.Box | null } | null = null;
  private receivedAt = 0;
  private frame: number | null = null;
  /** Expected gap between detections, used to pace the interpolation. Adapts
   *  to the machine: a slow laptop detects less often and should interpolate
   *  over a correspondingly longer window. */
  private interval = 90;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
    /** How to paint one interpolated frame. Defaults to the 68-point mesh;
     *  the MediaPipe tracker passes its own 478-point painter, which ignores
     *  the box and takes normalised points. */
    private readonly draw: (canvas: HTMLCanvasElement, video: HTMLVideoElement, points: LandmarkSet, box: FaceApi.Box | null) => void = drawFaceMesh,
  ) {}

  /** Feed a new detection. Cheap: it only stores state, never draws. The box
   *  is optional: the MediaPipe painter works from the points alone, and
   *  interpolating a placeholder box every frame was pure waste. */
  push(points: LandmarkSet, box: FaceApi.Box | null = null): void {
    const now = performance.now();
    if (this.latest) {
      const gap = now - this.receivedAt;
      // Exponential moving average, clamped: one slow frame should nudge the
      // pacing, not redefine it.
      if (gap > 16 && gap < 500) this.interval = this.interval * 0.7 + gap * 0.3;
      this.previous = this.latest;
    }
    this.latest = { points, box };
    this.receivedAt = now;
    this.start();
  }

  /** Face lost: fade the mesh out rather than leaving it frozen mid-air. */
  clear(): void {
    this.previous = null;
    this.latest = null;
    clearFaceMesh(this.canvas);
  }

  start(): void {
    if (this.frame !== null) return;
    const tick = () => {
      this.frame = requestAnimationFrame(tick);
      if (!this.latest) return;

      const elapsed = performance.now() - this.receivedAt;
      // 0..1 through the expected inter-detection gap.
      const raw = Math.min(1, elapsed / Math.max(32, this.interval));
      // easeOutCubic: moves promptly toward the new position, settles gently.
      const t = 1 - Math.pow(1 - raw, 3);

      const from = this.previous ?? this.latest;
      const points = this.latest.points.map((p, i) => {
        const q = from.points[i] ?? p;
        return { x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t };
      });
      const to = this.latest.box;
      const was = from.box ?? to;
      const box = to && was ? {
        ...to,
        x: was.x + (to.x - was.x) * t,
        y: was.y + (to.y - was.y) * t,
        width: was.width + (to.width - was.width) * t,
        height: was.height + (to.height - was.height) * t,
      } as FaceApi.Box : null;

      this.draw(this.canvas, this.video, points, box);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

/** Clears the overlay without needing a landmark set — used when the face is
 *  lost, so a stale mesh doesn't hang in mid-air. */
export function clearFaceMesh(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}
