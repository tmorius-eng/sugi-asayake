/**
 * Admin face gate (2026-09-08) — values shared by the browser that computes a
 * face descriptor and the server that compares it, so the two can never drift
 * apart on the numbers that decide whether someone gets into /admin.
 *
 * SCOPE (Tom, explicit and repeated): this covers ONLY the five roles that can
 * open /admin — staff, finance, marketing, warehouse, admin. It is not a
 * customer-facing feature. Nobody shopping on the site is ever asked for a
 * camera, and none of this code runs on any storefront page.
 *
 * WHY THIS MODEL: the recognition net is dlib's
 * `face_recognition_resnet_model_v1`, whose author released the weights into
 * the public domain ("anyone can do whatever they want with these model
 * files"). The more accurate ArcFace/InsightFace models were deliberately
 * rejected: their pretrained weights are licensed for non-commercial research
 * only, and this is a real commercial shop. Tom chose the free public-domain
 * route explicitly over paying for a commercial licence.
 */

/**
 * Identifies which pipeline produced a stored descriptor. Descriptors from
 * different pipelines are NOT comparable — bump this whenever the model or
 * the capture conditions change, so existing enrollments are detected as
 * stale and re-enrolled instead of being silently compared against
 * incompatible vectors (which rejects everybody and looks like an outage).
 *
 * "-hq" marks the capture-quality fix that followed a real wrong-person
 * admission: 720p capture and a much larger minimum face size. Enrollments
 * made before it were recorded from small, upscaled crops, and comparing one
 * of those against a sharp new capture is comparing two different things --
 * it would reject the legitimate owner under the tightened 0.45 threshold.
 * Bumping this forces everyone to re-enroll once, which is the correct
 * outcome rather than an inconvenience: the old references are exactly what
 * made a stranger's distance (0.688) sit so close to the owner's (0.553).
 */
export const FACE_MODEL_VERSION = "dlib-face-recognition-resnet-v1-hq";

/** face-api.js descriptors are always 128 floats. Validated server-side so a
 *  malformed or hand-crafted payload is rejected before it reaches any math. */
export const FACE_DESCRIPTOR_LENGTH = 128;

/**
 * Euclidean distance below which two descriptors are considered the same
 * person.
 *
 * TIGHTENED FROM 0.6 TO 0.45 after a real security failure: a different
 * person was admitted to /admin. The recorded distances showed why, and they
 * are the reason this is no longer the library's default:
 *
 *     enrolled user, 9 logins :  0.265 - 0.553
 *     a different person      :  0.688
 *
 * Those ranges nearly touch. At 0.6 there was almost no separation left, so a
 * second attempt by the wrong person landed under the line. The root cause
 * was descriptor QUALITY, not this number (see FACE_MIN_BOX_RATIO and the
 * capture resolution in client/src/lib/faceEngine.ts, both raised in the same
 * change); for this model a same-person pair should sit around 0.2-0.4 and a
 * different-person pair around 0.7-1.0, and reaching 0.553 for the enrolled
 * user meant the network was being fed a small, upscaled, blurry crop.
 *
 * 0.45 is deliberately conservative. With sharper crops a genuine match
 * should land well inside it; if legitimate staff are rejected, fix the
 * capture conditions FIRST (lighting, distance) and only then reconsider this
 * number. Never raise it past 0.55 -- that is where a stranger got in.
 * face_attempts.distance records every real attempt so this stays a decision
 * made from data.
 */
export const FACE_MATCH_THRESHOLD = 0.45;

/**
 * How long one successful face check stays valid on a device.
 *
 * The proof cookie is also cleared on logout and invalidated by any
 * sessionVersion bump (password reset / sign-out-everywhere), so in practice a
 * fresh check is required at every new sign-in regardless of this number. This
 * only bounds how long one continuous working session can run before being
 * asked again — one shift, so somebody who signs in at opening isn't
 * re-prompted all day, but a machine left signed in overnight is.
 */
export const FACE_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 8;

/** How long an issued liveness challenge stays usable. Short on purpose: an
 *  unused challenge should die quickly rather than sit around replayable. */
export const FACE_CHALLENGE_TTL_MS = 1000 * 60 * 3;

export const FACE_CHALLENGE_ACTIONS = ["blink", "turn_left", "turn_right", "open_mouth"] as const;
export type FaceChallengeAction = (typeof FACE_CHALLENGE_ACTIONS)[number];

/** Shown to the user as the instruction to perform on camera. */
export const FACE_CHALLENGE_LABELS: Record<FaceChallengeAction, string> = {
  blink: "Нүдээ анивчина уу",
  turn_left: "Толгойгоо ЗҮҮН тийш эргүүлнэ үү",
  turn_right: "Толгойгоо БАРУУН тийш эргүүлнэ үү",
  open_mouth: "Амаа нээнэ үү",
};

/**
 * Capture-quality gates, applied in the browser before a frame is allowed to
 * produce a descriptor at all.
 *
 * These matter more for real-world accuracy than the choice of detector does:
 * the single biggest cause of a face system rejecting its own enrolled user is
 * a bad enrollment frame (too far away, half out of shot, motion-blurred).
 * Rejecting those up front — with a specific on-screen reason, so the person
 * knows to move closer rather than just seeing "failed" — is what keeps the
 * false-rejection rate low.
 */
export const FACE_MIN_DETECTION_SCORE = 0.5;
/**
 * Minimum share of the video frame's width the detected face box must span.
 *
 * RAISED FROM 0.18 to 0.30 as part of fixing the wrong-person admission. The
 * recognition network works from a 150x150 aligned crop of the face. At 0.18
 * of a 640px frame the face was only ~115px wide, so that crop was UPSCALED
 * from less detail than it needs -- and a blurry input produces a mushy
 * descriptor that sits too close to everyone else's. That is what collapsed
 * the gap between the enrolled user (up to 0.553) and a stranger (0.688).
 *
 * At 0.30 of a 1280px frame the face is ~384px wide, comfortably more than
 * the crop needs, so no upscaling occurs. The cost is that the person must
 * sit properly close to the camera -- which the on-screen guidance already
 * asks for and now genuinely enforces.
 */
export const FACE_MIN_BOX_RATIO = 0.30;
/** How far the face's centre may sit from the frame's centre, as a share of
 *  frame width/height. Keeps the subject roughly framed. */
export const FACE_MAX_CENTER_OFFSET_RATIO = 0.3;

/**
 * How many good frames are averaged into one stored reference descriptor at
 * enrollment. Averaging several captures measurably reduces false rejections
 * later — one unlucky frame at enrollment would otherwise poison every future
 * comparison for that person.
 */
export const FACE_ENROLL_SAMPLES = 5;

/**
 * The head positions captured during enrollment, in order.
 *
 * Enrolling from one angle only is the difference between "it recognises me
 * when I sit exactly like I did that day" and "it recognises me". Each pose
 * is stored separately and verification takes the closest match, so sitting
 * slightly turned no longer inflates the distance.
 *
 * Kept to modest angles on purpose: at a strong profile the detector starts
 * losing landmarks and the descriptor quality collapses, so an extreme pose
 * would add a bad reference rather than a useful one.
 */
export const FACE_ENROLL_POSES = [
  { key: "center", label: "Камер руу шууд харна уу", yaw: 0 },
  { key: "left", label: "Толгойгоо ЗҮҮН тийш бага зэрэг эргүүлнэ үү", yaw: 1 },
  { key: "right", label: "Толгойгоо БАРУУН тийш бага зэрэг эргүүлнэ үү", yaw: -1 },
] as const;
export type FaceEnrollPose = (typeof FACE_ENROLL_POSES)[number]["key"];

/** How far the head must be turned for a side pose to count. Lower than the
 *  liveness turn threshold: enrollment wants a usable angled view, not a
 *  dramatic one. */
export const FACE_ENROLL_POSE_YAW = 0.06;

/** Frames averaged per pose. Fewer than the single-pose count because there
 *  are now several poses; the total captured is higher than before. */
export const FACE_ENROLL_SAMPLES_PER_POSE = 4;

export type StoredFacePose = { pose: string; descriptor: number[] };

/**
 * Distance to the CLOSEST stored view of this face.
 *
 * Verification compares against every enrolled pose and keeps the best,
 * rather than against one averaged frontal vector. Averaging across angles
 * would be actively wrong -- the mean of a left-facing and a right-facing
 * descriptor is not a better frontal face, it is a blur of both.
 */
export function bestFaceDistance(
  candidate: readonly number[],
  references: readonly (readonly number[])[],
): number | null {
  let best: number | null = null;
  for (const reference of references) {
    if (reference.length !== candidate.length) continue;
    const d = faceDescriptorDistance(candidate, reference);
    if (best === null || d < best) best = d;
  }
  return best;
}

/** How many frames a single verification attempt captures; the best (closest)
 *  match among them decides the outcome. */
export const FACE_VERIFY_SAMPLES = 5;

/** Where the self-hosted model weights are served from. Same origin as the
 *  app — deliberately not a CDN, so no third party sees that a staff member is
 *  authenticating, and so the gate keeps working if a CDN is blocked. */
export const FACE_MODEL_URL = "/face-models";

export const ADMIN_PANEL_ROLES = ["staff", "finance", "marketing", "warehouse", "admin"] as const;

export function isAdminPanelRole(role: string | null | undefined): boolean {
  return !!role && (ADMIN_PANEL_ROLES as readonly string[]).includes(role);
}

/** Euclidean distance between two descriptors. Shared so the browser can show
 *  a live "how close am I" reading using exactly the same math the server
 *  makes its decision with. */
export function faceDescriptorDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("Descriptor length mismatch");
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/** Averages several descriptors into one reference vector (see
 *  FACE_ENROLL_SAMPLES). Plain component-wise mean — descriptors from this
 *  model live on a scale where that is the conventional way to combine
 *  samples of the same face. */
export function averageFaceDescriptors(samples: readonly (readonly number[])[]): number[] {
  if (samples.length === 0) throw new Error("No descriptor samples to average");
  const length = samples[0].length;
  const out = new Array<number>(length).fill(0);
  for (const sample of samples) {
    if (sample.length !== length) throw new Error("Descriptor length mismatch");
    for (let i = 0; i < length; i += 1) out[i] += sample[i];
  }
  for (let i = 0; i < length; i += 1) out[i] /= samples.length;
  return out;
}

// ---------------------------------------------------------------------------
// ACTIVE FLASH LIVENESS — the technique real eKYC systems use (AWS Rekognition
// Face Liveness calls it a "colour challenge"; ekyc.mn does the same thing).
//
// The screen flashes a RANDOMISED sequence of saturated colours. A real,
// three-dimensional face reflects that light, so the skin measurably shifts
// towards each colour in turn:
//
//   - A printed photo is flat and matte; it reflects far less, and far more
//     uniformly, than living skin.
//   - A video replay cannot fake it at all, because the attacker would have
//     had to record a reaction to a colour sequence chosen at random AFTER
//     they started. This is precisely the property blink detection lacks,
//     and the reason blink alone is beatable with a recording.
//
// Lives in shared/ rather than next to the camera code because it is pure
// arithmetic over numbers — no DOM, no model — which makes it unit-testable
// (server/faceAuth.test.ts) alongside the descriptor math above.
//
// Honest limits: the effect depends on ambient light and monitor brightness,
// so it is weaker in a very bright room. It raises the bar substantially over
// motion-only liveness; it is not an unbeatable presentation-attack defence,
// and this remains a second factor behind a password.
// ---------------------------------------------------------------------------

/** The colours flashed at the face. Widely separated in hue so their
 *  reflections are easy to tell apart, plus one (yellow) that mostly raises
 *  brightness rather than a single channel. */
export const FLASH_COLORS = {
  red: [255, 45, 45],
  green: [90, 240, 105],
  blue: [70, 140, 255],
  yellow: [250, 235, 60],
  orange: [245, 150, 45],
  violet: [150, 70, 240],
} as const;

export type FlashColor = keyof typeof FLASH_COLORS;

/** Mean RGB of the face region under one flash. */
export type FaceColorSample = { r: number; g: number; b: number };

/** How far above the attempt's own average a channel must sit to count as a
 *  genuine response. Small, because the shares below are normalised — a real
 *  face produces a consistent shift of this order, a flat photo produces
 *  essentially zero. */
export const FLASH_MIN_SHIFT = 0.004;

/** Fraction of flashes that must respond correctly. Not all of them: one
 *  frame can legitimately land mid-transition while the camera's
 *  auto-exposure catches up. */
export const FLASH_PASS_RATIO = 0.6;

/**
 * Decides whether the measured skin responses actually track the colours that
 * were flashed.
 *
 * The method is deliberately RELATIVE, not absolute. Absolute thresholds
 * ("the red channel must exceed X") fail immediately across different skin
 * tones, cameras with auto-white-balance, and rooms with different lighting.
 * Instead each flash is compared against the average across ALL flashes in
 * the same attempt: under the red flash the face must be redder *than that
 * same face was under the other colours*. That comparison is self-
 * normalising, so it behaves the same for any skin tone and any camera —
 * which matters a great deal here, given the documented history of face
 * models performing worse on non-white faces.
 */
export function evaluateFlashResponse(
  samples: { color: FlashColor; sample: FaceColorSample }[],
  /** The face measured with NO flash, captured immediately before the
   *  sequence. Optional so existing callers keep working, but supplying it
   *  materially strengthens the check — see below. */
  baseline?: FaceColorSample | null,
): {
  passed: boolean;
  score: number;
  brightened: boolean;
} {
  if (samples.length < 3) return { passed: false, score: 0, brightened: false };

  // Normalise each reading to channel SHARES, which removes overall
  // brightness. A flash makes the face brighter too, and brightness alone
  // proves nothing — a sheet of white paper would do it.
  const shares = samples.map(({ color, sample }) => {
    const total = sample.r + sample.g + sample.b || 1;
    return { color, r: sample.r / total, g: sample.g / total, b: sample.b / total };
  });

  // Reference point for "what does this face look like unlit".
  //
  // Following IEEE "Face Liveness Detection Using a Flash Against 2D Spoofing
  // Attack", which captures one image WITH flash and one WITHOUT and compares
  // them: an unlit baseline is a far better anchor than the mean of the lit
  // frames, and the paper notes the flash comparison also suppresses the
  // influence of ambient lighting. When no baseline is supplied this falls
  // back to the mean across the flashes, which still works but is weaker.
  const mean = baseline
    ? (() => {
        const total = baseline.r + baseline.g + baseline.b || 1;
        return { r: baseline.r / total, g: baseline.g / total, b: baseline.b / total };
      })()
    : {
        r: shares.reduce((sum, s) => sum + s.r, 0) / shares.length,
        g: shares.reduce((sum, s) => sum + s.g, 0) / shares.length,
        b: shares.reduce((sum, s) => sum + s.b, 0) / shares.length,
      };

  // Did the face actually get brighter when lit at all? A screen replaying a
  // video emits its own light and barely responds to ours; a real face in
  // front of a bright monitor clearly does. Only checkable with a baseline.
  let brightened = true;
  if (baseline) {
    const baseLuma = baseline.r + baseline.g + baseline.b;
    const litLuma = samples.reduce((sum, s) => sum + s.sample.r + s.sample.g + s.sample.b, 0) / samples.length;
    brightened = litLuma > baseLuma * 1.02;
  }

  let correct = 0;
  for (const s of shares) {
    let shift: number;
    switch (s.color) {
      case "red": shift = s.r - mean.r; break;
      case "green": shift = s.g - mean.g; break;
      case "blue": shift = s.b - mean.b; break;
      // Yellow, orange and violet are channel COMBINATIONS, so each is scored
      // on its own mix rather than a single channel -- scoring yellow on red
      // alone, for instance, would double-count the red flash.
      case "yellow": shift = ((s.r - mean.r) + (s.g - mean.g)) / 2 - (s.b - mean.b); break;
      case "orange": shift = (s.r - mean.r) - (s.b - mean.b); break;
      case "violet": shift = ((s.r - mean.r) + (s.b - mean.b)) / 2 - (s.g - mean.g); break;
    }
    if (shift > FLASH_MIN_SHIFT) correct += 1;
  }

  const score = correct / shares.length;
  return { passed: score >= FLASH_PASS_RATIO && brightened, score, brightened };
}

/** Guards every descriptor arriving from a browser before it is stored or
 *  compared: right length, all finite numbers, plausible magnitude. Rejects
 *  malformed and hand-crafted payloads at the edge rather than letting them
 *  reach the distance math. */
export function isValidFaceDescriptor(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== FACE_DESCRIPTOR_LENGTH) return false;
  return value.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10);
}

// ---------------------------------------------------------------------------
// Motion liveness, derived from the 68-point landmark model. Runs alongside
// the colour-flash challenge above; real eKYC flows ask for both.
//
// Lives here rather than beside the camera code so it can be unit-tested
// without loading a 1.4MB ML library. That matters more than usual for this
// particular code: three separate real bugs were found in it by hand-testing
// (fixed thresholds that failed narrower eye shapes, an inverted head-turn
// direction, and a capture loop that gave up before the user could act), none
// of which a type-checker could catch and all of which a test would have.
// ---------------------------------------------------------------------------

/** Just the shape the geometry needs — deliberately not face-api's own type,
 *  so shared/ carries no dependency on the model library. `positions` from a
 *  face-api landmark set satisfies this directly. */
export type LandmarkPoint = { x: number; y: number };
/** The standard 68 points, in their conventional order. */
export type FaceLandmarks = readonly LandmarkPoint[];

function distance(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Eye aspect ratio — the standard blink measure (Soukupová & Čech).
 * Height-over-width of the eye polygon: roughly 0.3 open, under ~0.2 closed.
 * Using a RATIO rather than raw pixels is what makes it independent of how
 * close the person is sitting.
 */
function eyeAspectRatio(eye: readonly LandmarkPoint[]): number {
  if (eye.length < 6) return 1;
  const vertical = distance(eye[1], eye[5]) + distance(eye[2], eye[4]);
  const horizontal = distance(eye[0], eye[3]) * 2;
  if (horizontal === 0) return 1;
  return vertical / horizontal;
}

export function getEyeOpenness(landmarks: FaceLandmarks): number {
  return (eyeAspectRatio(landmarks.slice(36, 42)) + eyeAspectRatio(landmarks.slice(42, 48))) / 2;
}

/**
 * Mouth openness, same ratio trick as the eyes: inner lip gap over mouth
 * width, so it does not change with how close the person is sitting.
 *
 * getMouth() returns the 68-point model's points 48–67 in order, so within
 * that array: 0 = left corner (48), 6 = right corner (54), 14 = inner upper
 * lip (62), 18 = inner lower lip (66). The INNER lip pair is used rather than
 * the outer one because the outer points barely separate on a small mouth
 * opening, which made the threshold unreliable.
 */
const MOUTH_LEFT_CORNER = 0;
const MOUTH_RIGHT_CORNER = 6;
const MOUTH_INNER_TOP = 14;
const MOUTH_INNER_BOTTOM = 18;

export function getMouthOpenness(landmarks: FaceLandmarks): number {
  const mouth = landmarks.slice(48, 68);
  if (mouth.length <= MOUTH_INNER_BOTTOM) return 0;
  const width = distance(mouth[MOUTH_LEFT_CORNER], mouth[MOUTH_RIGHT_CORNER]);
  if (width === 0) return 0;
  return distance(mouth[MOUTH_INNER_TOP], mouth[MOUTH_INNER_BOTTOM]) / width;
}

/**
 * Head yaw, as a signed ratio: negative when the face turns to the subject's
 * left, positive to their right, ~0 facing forward.
 *
 * Measured by how far the nose sits between the two jaw edges rather than by
 * solving a full 3D pose — far fewer moving parts, and precise enough to tell
 * a deliberate head turn from noise, which is all the challenge needs.
 */
export function getHeadYaw(landmarks: FaceLandmarks): number {
  const jaw = landmarks.slice(0, 17);
  const nose = landmarks.slice(27, 36);
  if (jaw.length < 17 || nose.length === 0) return 0;
  const left = jaw[0];
  const right = jaw[16];
  const noseTip = nose[nose.length - 1] ?? nose[0];

  // Normalised left/right ASYMMETRY, not a raw x-offset from the midpoint.
  //
  // Both measure the same thing when the head is upright, but this version
  // uses true 2D distances, which makes it invariant to head ROLL (tilt).
  // The x-only version silently reported a yaw for someone who merely
  // tilted their head, because tilting moves the nose's x-coordinate away
  // from the midpoint of the two jaw x-coordinates without any actual turn.
  //
  // The literature does this properly with solvePnP over six anatomical
  // points (nose tip, chin, eye corners, mouth corners) against a 3D model.
  // That is more accurate, but needs a camera intrinsic matrix, and the
  // sources note a guessed focal length makes extreme yaw unreliable anyway.
  // For "did this person deliberately turn their head?" the asymmetry ratio
  // is sufficient and has far fewer ways to go wrong.
  const toLeft = distance(noseTip, left);
  const toRight = distance(noseTip, right);
  const total = toLeft + toRight;
  if (total === 0) return 0;
  // Positive = nose closer to the image's right edge = the person turned to
  // THEIR left (the camera frame is not mirrored). See LivenessTracker.
  return (toLeft - toRight) / total;
}

/**
 * Rolling average over the last few frames.
 *
 * The head-pose literature is explicit that "landmark noise causes pose
 * jitter, requiring careful filtering" — the detector's points wobble by a
 * pixel or two every frame even on a perfectly still face, and on a
 * ratio-based measure that wobble is enough to cross a threshold on its own.
 * Without smoothing, a still face can register a phantom blink or turn (a
 * false PASS, which is the dangerous direction), and a real slow movement can
 * be missed.
 */
export class SignalSmoother {
  private readonly window: number[] = [];

  /**
   * Window size is a real trade-off, not a free improvement, and it is set to
   * 2 deliberately.
   *
   * Larger windows suppress more landmark jitter (fewer false PASSes, the
   * dangerous direction) but also average away short real events (more false
   * REJECTs, the infuriating direction). A blink lasts roughly 100-300ms,
   * which is only 2-4 frames at this capture rate, so a 3-frame mean can
   * dilute a genuine quick blink below the threshold entirely -- caught by
   * the unit tests when the window was 3. Two frames removes single-frame
   * spikes, which is what jitter actually looks like, while leaving a real
   * blink clearly visible.
   */
  constructor(private readonly size = 2) {}

  push(value: number): number {
    this.window.push(value);
    if (this.window.length > this.size) this.window.shift();
    return this.window.reduce((sum, v) => sum + v, 0) / this.window.length;
  }

  get ready(): boolean {
    return this.window.length >= this.size;
  }
}

/**
 * Liveness thresholds.
 *
 * The blink and mouth checks are RELATIVE to each person's own measured
 * baseline, not absolute numbers. That is not a refinement, it is a
 * correctness fix: eye aperture varies enormously between people, and a fixed
 * eye-aspect-ratio cutoff silently fails anyone whose eyes are naturally
 * narrower than whoever the constant was tuned on -- it either reads them as
 * permanently "closed" or never sees them re-open. This bit real users on the
 * first live run. Calibrating against the person in front of the camera is
 * the same self-normalising principle evaluateFlashResponse uses, and for the
 * same reason: fixed thresholds encode the assumption that everyone looks
 * like the developer.
 */
/** Fraction of the person's own resting eye openness that counts as closed. */
const BLINK_CLOSE_FACTOR = 0.72;
/** Fraction of their own resting openness that counts as open again. */
const BLINK_REOPEN_FACTOR = 0.88;
/** How far the mouth must open beyond its own resting state. */
const MOUTH_OPEN_FACTOR = 1.9;
const MOUTH_CLOSE_FACTOR = 1.3;
/**
 * How far the head must turn to count, as a share of face width. Yaw is
 * already a ratio, so it needs no per-person calibration.
 *
 * Lowered from 0.13 after live testing: 0.13 demanded an uncomfortably large
 * turn, and a user who turns far enough that the detector starts losing
 * landmarks gets no credit at all -- the check has to trigger while the face
 * is still cleanly visible, not at the point it stops being trackable.
 */
export const YAW_TURN_RATIO = 0.10;

/** Max length of the diagnostic string the client sends with a verification.
 *  Keeps it inside face_attempts.detail's column width. */
export const FACE_DIAGNOSTIC_MAX = 150;
/** Frames spent measuring the resting baseline before judging anything. */
const CALIBRATION_FRAMES = 6;

/**
 * Tracks whether the challenged action actually happened across a sequence of
 * frames.
 *
 * Stateful on purpose. A blink is not "eyes are closed right now" — it is
 * open, then closed, then open again, and only checking the current frame
 * would accept a photo of someone with their eyes shut. The same reasoning
 * applies to the head turns (must return toward centre) and the mouth.
 */
export class LivenessTracker {
  private sawClosed = false;
  private sawOpenAfterClosed = false;
  private sawTurn = false;
  private sawReturnAfterTurn = false;
  private sawMouthOpen = false;
  private sawMouthClosedAfterOpen = false;

  /** Resting measurements for THIS person, collected over the first few
   *  frames before any judgement is made. */
  private baselineSamples: number[] = [];
  private baseline: number | null = null;

  /** Smooths the raw per-frame measurement before any threshold is applied.
   *  See SignalSmoother: unfiltered landmark jitter can cross a threshold on
   *  a completely still face, which would be a false PASS. */
  private readonly smoother = new SignalSmoother(2);

  constructor(private readonly action: FaceChallengeAction) {}

  /** True until enough frames have been seen to know this person's resting
   *  state. The UI uses it to say "hold still" rather than issuing the
   *  instruction before it can even be judged. */
  get calibrating(): boolean {
    return this.action !== "turn_left" && this.action !== "turn_right" && this.baseline === null;
  }

  private calibrate(value: number): boolean {
    if (this.baseline !== null) return true;
    this.baselineSamples.push(value);
    if (this.baselineSamples.length < CALIBRATION_FRAMES) return false;
    // Median, not mean: if the person happens to blink during calibration,
    // a mean would be dragged down and corrupt every later comparison.
    const sorted = [...this.baselineSamples].sort((a, b) => a - b);
    this.baseline = sorted[Math.floor(sorted.length / 2)];
    return true;
  }

  observe(landmarks: FaceLandmarks): void {
    switch (this.action) {
      case "blink": {
        const ear = this.smoother.push(getEyeOpenness(landmarks));
        if (!this.calibrate(ear)) return;
        const rest = this.baseline!;
        if (ear < rest * BLINK_CLOSE_FACTOR) this.sawClosed = true;
        else if (this.sawClosed && ear > rest * BLINK_REOPEN_FACTOR) this.sawOpenAfterClosed = true;
        break;
      }
      case "turn_left":
      case "turn_right": {
        const yaw = this.smoother.push(getHeadYaw(landmarks));
        // DIRECTION, and why it is this way round: getHeadYaw measures the
        // RAW camera frame, which is not mirrored (only the on-screen preview
        // is, via CSS). In the raw frame the camera faces the person, so the
        // person's own left-hand side appears on the RIGHT of the image --
        // turning their head to their left moves the nose towards the image's
        // right, i.e. yaw goes POSITIVE. Coding it the intuitive way round
        // inverts both challenges, which is exactly what happened on the
        // first live run: "turn left" only passed when turning right.
        const turned = this.action === "turn_left" ? yaw > YAW_TURN_RATIO : yaw < -YAW_TURN_RATIO;
        if (turned) this.sawTurn = true;
        else if (this.sawTurn && Math.abs(yaw) < YAW_TURN_RATIO / 2) this.sawReturnAfterTurn = true;
        break;
      }
      case "open_mouth": {
        const openness = this.smoother.push(getMouthOpenness(landmarks));
        if (!this.calibrate(openness)) return;
        // A closed mouth can measure near zero, so a pure ratio would be
        // unstable -- the floor keeps it meaningful for everyone.
        const rest = Math.max(this.baseline!, 0.04);
        if (openness > rest * MOUTH_OPEN_FACTOR) this.sawMouthOpen = true;
        else if (this.sawMouthOpen && openness < rest * MOUTH_CLOSE_FACTOR) this.sawMouthClosedAfterOpen = true;
        break;
      }
    }
  }

  get passed(): boolean {
    switch (this.action) {
      case "blink": return this.sawClosed && this.sawOpenAfterClosed;
      case "turn_left":
      case "turn_right": return this.sawTurn && this.sawReturnAfterTurn;
      case "open_mouth": return this.sawMouthOpen && this.sawMouthClosedAfterOpen;
    }
  }

  /** Drives the on-screen progress hint so the user can tell the system is
   *  seeing them, instead of staring at a static instruction wondering
   *  whether it registered. */
  get halfway(): boolean {
    switch (this.action) {
      case "blink": return this.sawClosed;
      case "turn_left":
      case "turn_right": return this.sawTurn;
      case "open_mouth": return this.sawMouthOpen;
    }
  }
}
