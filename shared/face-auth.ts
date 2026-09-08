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

/** Identifies which model produced a stored descriptor. Descriptors from
 *  different models are NOT comparable — bump this whenever the model changes
 *  so existing enrollments are detected as stale and re-enrolled, instead of
 *  being silently compared against incompatible vectors (which would reject
 *  everybody and look like a mysterious outage). */
export const FACE_MODEL_VERSION = "dlib-face-recognition-resnet-v1";

/** face-api.js descriptors are always 128 floats. Validated server-side so a
 *  malformed or hand-crafted payload is rejected before it reaches any math. */
export const FACE_DESCRIPTOR_LENGTH = 128;

/**
 * Euclidean distance below which two descriptors are considered the same
 * person. 0.6 is the long-standing dlib/face-api.js convention and the value
 * their own accuracy figures are quoted at.
 *
 * TUNING NOTE: this is a starting point, not a proven value for these
 * particular staff. face_attempts.distance records the real distance of every
 * attempt precisely so the actual distribution can be inspected later. If
 * legitimate staff are being rejected, raise it toward 0.65; if it ever
 * accepted the wrong person, lower it toward 0.5. Do not change it blind —
 * look at the recorded distances first.
 */
export const FACE_MATCH_THRESHOLD = 0.6;

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
/** Minimum share of the video frame's width the detected face box must span.
 *  Roughly "sit at normal laptop distance, not across the room." */
export const FACE_MIN_BOX_RATIO = 0.18;
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
  red: [255, 40, 40],
  green: [40, 255, 40],
  blue: [40, 80, 255],
  yellow: [255, 230, 40],
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
export function evaluateFlashResponse(samples: { color: FlashColor; sample: FaceColorSample }[]): {
  passed: boolean;
  score: number;
} {
  if (samples.length < 3) return { passed: false, score: 0 };

  // Normalise each reading to channel SHARES, which removes overall
  // brightness. A flash makes the face brighter too, and brightness alone
  // proves nothing — a sheet of white paper would do it.
  const shares = samples.map(({ color, sample }) => {
    const total = sample.r + sample.g + sample.b || 1;
    return { color, r: sample.r / total, g: sample.g / total, b: sample.b / total };
  });

  const mean = {
    r: shares.reduce((sum, s) => sum + s.r, 0) / shares.length,
    g: shares.reduce((sum, s) => sum + s.g, 0) / shares.length,
    b: shares.reduce((sum, s) => sum + s.b, 0) / shares.length,
  };

  let correct = 0;
  for (const s of shares) {
    let shift: number;
    switch (s.color) {
      case "red": shift = s.r - mean.r; break;
      case "green": shift = s.g - mean.g; break;
      case "blue": shift = s.b - mean.b; break;
      // Yellow is red+green together, so it is scored on that pair rising
      // while blue falls — scoring it on one channel would double-count red.
      case "yellow": shift = ((s.r - mean.r) + (s.g - mean.g)) / 2 - (s.b - mean.b); break;
    }
    if (shift > FLASH_MIN_SHIFT) correct += 1;
  }

  const score = correct / shares.length;
  return { passed: score >= FLASH_PASS_RATIO, score };
}

/** Guards every descriptor arriving from a browser before it is stored or
 *  compared: right length, all finite numbers, plausible magnitude. Rejects
 *  malformed and hand-crafted payloads at the edge rather than letting them
 *  reach the distance math. */
export function isValidFaceDescriptor(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== FACE_DESCRIPTOR_LENGTH) return false;
  return value.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10);
}
