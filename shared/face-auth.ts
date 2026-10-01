/**
 * Admin царайны хаалга (2026-09-08) — царайн descriptor тооцдог хөтөч ба түүнийг
 * харьцуулдаг сервер хоёрын хуваалцдаг утгууд, тиймээс хэн /admin-д орохыг шийддэг
 * тоон дээр хоёр хэзээ ч зөрөхгүй.
 *
 * ХАМРАХ ХҮРЭЭ (Tom, шууд бөгөөд давтан): ЗӨВХӨН /admin нээж чадах 5 эрх — staff,
 * finance, marketing, warehouse, admin. Харилцагчид хандсан функц биш. Сайтад
 * худалдан авч буй хэнээс ч камер асуухгүй, энэ кодын юу ч storefront хуудсанд
 * ажиллахгүй.
 *
 * ЯАГААД ЭНЭ ЗАГВАР: таних сүлжээ dlib-ийн `face_recognition_resnet_model_v1`,
 * зохиогч нь жинг public domain-д гаргасан ("хэн ч эдгээр загварын файлаар юу ч
 * хийж болно"). Илүү нарийвчлалтай ArcFace/InsightFace-ийг санаатай татгалзсан:
 * тэдний pretrained жин зөвхөн арилжааны бус судалгаанд лицензтэй, энэ бол бодит
 * арилжааны дэлгүүр. Tom арилжааны лиценз төлөхийн оронд үнэгүй public-domain замыг
 * шууд сонгосон.
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
 * ABSOLUTE cap on one face check: however busy the day is, /admin asks again
 * after this long — one shift, so somebody who signs in at opening isn't
 * re-prompted all day, but a machine left signed in overnight is.
 *
 * The proof cookie is also cleared on logout and invalidated by any
 * sessionVersion bump (password reset / sign-out-everywhere), so in practice a
 * fresh check is required at every new sign-in regardless of this number.
 *
 * Two timeouts, which is what every session-management standard asks for: an
 * absolute one and an idle one (below). OWASP ASVS V7 and the Session
 * Management Cheat Sheet put a high-value application's absolute window at
 * 4–8h; NIST SP 800-63B allows 12h at AAL2. 8h is the shift length here.
 */
export const FACE_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 8;

/**
 * IDLE timeout (2026-09-12, Tom asked for 25 minutes): that long with no real
 * interaction in /admin and the face check expires — the panel locks and asks
 * for the face again.
 *
 * The counter is driven by ACTUAL INPUT (pointer, key, touch, scroll), never
 * by the panel's own background polling. That distinction is the whole
 * feature: the dashboard refetches the bell and the outbox on timers, so a
 * screen left open would otherwise keep renewing itself and the timeout would
 * be fiction.
 *
 * Where 25 sits among the standards this has to answer to: NIST SP 800-63B
 * requires reauthentication after 30 minutes of inactivity at AAL2; PCI DSS
 * v4.0 req. 8.2.8 requires 15 minutes for administrative access; OWASP's
 * Session Management Cheat Sheet suggests 15–30 minutes for high-value
 * applications. 25 is inside all three.
 */
export const FACE_IDLE_TIMEOUT_MS = 1000 * 60 * 25;

/** How long before the lock a warning appears, so nobody loses a half-typed
 *  product description without notice. A usability requirement, not a
 *  security one — the lock happens either way. */
export const FACE_IDLE_WARNING_MS = 1000 * 60 * 2;

/**
 * QR-аар утсаар баталгаажуулах шилжүүлэг (handoff, 2026-09-16, Tom-ийн
 * шийдвэр) — камергүй компьютер дээр admin-д нэвтрэх цорын ганц зам.
 * Дэлгэрэнгүй дизайн ба аюулгүй байдлын үндэслэл: docs/FACE-HANDOFF-PLAN.md.
 *
 * TTL нь 90 секунд: QR-ийг гэрэл зургаар авч дараа нь ашиглах цонхыг аль болох
 * богино байлгана (аж үйлдвэрийн зөвлөмж 60–180с, аюулгүй байдлын өндөр
 * шаардлагатайд 60–90с), гэхдээ утсаа гаргаж, камераа нээж, царайгаа
 * уншуулахад хүрэлцэнэ. Хугацаа дуусвал компьютер шинэ QR өгнө.
 */
export const FACE_HANDOFF_TTL_MS = 1000 * 90;

/**
 * Handoff-оор нээгдсэн сессийн идэвхгүй түгжээ (Tom: "idle tugjeeg 10min
 * bolgo"). Ердийн 25 минутаас богино: камергүй компьютер дээр дахин түгжвэл
 * дахин утас хэрэгтэй болдог ч, тэр компьютерийг орхиод явахад admin панель
 * нээлттэй үлдэх хугацаа хамгийн богино байх ёстой.
 */
export const FACE_HANDOFF_IDLE_TIMEOUT_MS = 1000 * 60 * 10;

/** Тоо тааруулахад утсан дээр харагдах сонголтын тоо (зөв нь нэг). */
export const FACE_HANDOFF_NUMBER_CHOICES = 3;

/** How often a browser WITH real activity tells the server it is still there.
 *  Far below the idle timeout, so one dropped request cannot lock somebody
 *  out mid-sentence; far above "every request", so it is not chatty. */
export const FACE_HEARTBEAT_INTERVAL_MS = 1000 * 60 * 2;

/** How long an issued liveness challenge stays usable. Short on purpose: an
 *  unused challenge should die quickly rather than sit around replayable. */
export const FACE_CHALLENGE_TTL_MS = 1000 * 60 * 3;

export const FACE_CHALLENGE_ACTIONS = ["blink", "turn_left", "turn_right", "open_mouth"] as const;
export type FaceChallengeAction = (typeof FACE_CHALLENGE_ACTIONS)[number];

/**
 * The action every LOGIN challenge asks for (2026-09-22, Tom chose "анивчилт
 * заавал"). The enum above stays because it is the face_challenges.action
 * column type; the server now always issues "blink", and the browser shows
 * "нэг анивчина уу" and refuses to submit until it has seen one -- a held-up
 * photograph cannot blink. Turns/mouth were rejected for login: they add 2-3 s
 * to every entry and fail more often in poor light.
 */
export const FACE_LOGIN_CHALLENGE: FaceChallengeAction = "blink";

/**
 * How long a password step-up (ADMIN_REAUTH_COOKIE_NAME) stays good for the
 * face check that follows it, in one tab.
 *
 * 2026-09-22, second pass (Tom tested it: "zuwhun face unshij baina, password
 * garj irehgui baina"): the step is now ONE-SHOT. It is used up the moment a
 * face check succeeds, and a sign-in no longer counts as it -- so every time
 * /admin asks for the face (a new tab, after the 25-minute idle lock, after
 * signing out, after 8 hours) the password screen comes first. Ten minutes is
 * the time to finish that face check: enrolment is ~90 s, a QR handoff 90 s.
 */
export const FACE_REAUTH_TTL_MS = 1000 * 60 * 10;

/**
 * Per-account face lockout (2026-09-22 audit): this many failed matches or
 * failed liveness checks inside the window and no further face check starts
 * for this account until the window passes. The IP rate limit alone (8/15 min)
 * could be sidestepped by rotating addresses, which is exactly what an
 * attacker iterating descriptors would do.
 */
export const FACE_FAILURE_LOCKOUT_MAX = 5;
export const FACE_FAILURE_LOCKOUT_WINDOW_MS = 1000 * 60 * 15;

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

/** Where the self-hosted model weights are served from. Same origin as the
 *  app — deliberately not a CDN, so no third party sees that a staff member is
 *  authenticating, and so the gate keeps working if a CDN is blocked. */
export const FACE_MODEL_URL = "/face-models";

export const ADMIN_PANEL_ROLES = ["staff", "finance", "marketing", "warehouse", "admin"] as const;

/** Нийтлэл унших/ноорог preview хийх эрхтэй дүрүүд — contentReadProcedure болон content.bySlug-ийн ИЖИЛ жагсаалт. */
export const CONTENT_READ_ROLES = ["admin", "staff", "marketing"] as const;

export function isContentReadRole(role: string | null | undefined): boolean {
  return (CONTENT_READ_ROLES as readonly string[]).includes(role ?? "");
}

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

/** Averages several descriptors into one reference vector (the frontal
 *  snapshots of an enrolment, or the three of a login). Plain component-wise
 *  mean — descriptors from this
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

/** Guards every descriptor arriving from a browser before it is stored or
 *  compared: right length, all finite numbers, plausible magnitude. Rejects
 *  malformed and hand-crafted payloads at the edge rather than letting them
 *  reach the distance math. */
export function isValidFaceDescriptor(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== FACE_DESCRIPTOR_LENGTH) return false;
  return value.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10);
}

/** Max length of the diagnostic string the client sends with a verification.
 *  Keeps it inside face_attempts.detail's column width. */
export const FACE_DIAGNOSTIC_MAX = 150;
