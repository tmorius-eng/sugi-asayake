/**
 * Admin царайны хаалга (2026-09-13) — одоо tracking-ийг жолооддог MediaPipe Face
 * Landmarker pipeline-ийн толгойн байрлал, хамрах хүрээ, анивчилтын арифметик.
 *
 * Цэвэр тоо орж, цэвэр тоо гарна: DOM-гүй, загваргүй, тиймээс "толгой хангалттай
 * эргэсэн үү", "тэр анивчилт байсан уу" гэж шийддэг дүрэм бүр хэн нэгний утсан дээр
 * нээгдэхийн оронд unit-тестлэгдсэн (server/face-pose.test.ts).
 *
 * ЯАГААД shared/face-auth.ts-ийн дотор биш хажууд: хуучин файлын хөдөлгөөний код
 * dlib-ийн 68 цэгийн layout-д бичигдсэн бөгөөд ТАНИХ descriptor тэр pipeline-аас
 * ирсээр тул хадгалагдаж (тестлэгдсээр) байна. Tracking, байрлал, liveness MediaPipe-
 * ийн 478 3-D цэг рүү шилжсэн, индекс ба координатын систем нь өөр тул нэг файлд
 * холивол буруу индексийн хүснэгт ашиглах байнгын урилга болно.
 *
 * Дизайны дагадаг эх сурвалж (docs/FACE-AUTH-RESEARCH-2026-09-13.md):
 *  - Apple-ийн Face ID бүртгэл: хэрэглэгч толгойгоо тойруулан эргүүлж чиглэл бүр
 *    хамрагдахад цагирагийн хэсэг дүүрнэ. Олон өнцгийг хурдан авдаг, хүмүүс аль
 *    хэдийн мэддэг хөдөлгөөн тул авсан.
 *  - Liveness дохиог хэрхэн мэдээлэх ISO/IEC 30107-3 нэр томьёо (bona-fide vs
 *    attack presentation): хэмжигдэж, бүртгэгдэнэ, нэг frame-ээс хэзээ ч таагдахгүй.
 *  - MediaPipe Face Landmarker: 478 цэг, 52 ARKit маягийн blendshape (eyeBlinkLeft/
 *    Right, jawOpen...) — анивчилт илрүүлэлт хүн бүрд тааруулах ёстой гараар хийсэн
 *    нүдний харьцаа биш загварын гаралт дээрх босго болно.
 */

/** A normalised landmark from MediaPipe: x and y in [0, 1] of the frame, z
 *  roughly in the same scale (depth, relative to the face centre). */
export type MpLandmark = { x: number; y: number; z?: number };
export type MpLandmarks = readonly MpLandmark[];

/** Canonical face-mesh indices used here. From MediaPipe's canonical model;
 *  stable across releases of the .task file. */
export const MP = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  /** Face-oval points level with the eyes, one on each side. */
  edgeA: 234,
  edgeB: 454,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
} as const;

/** MediaPipe reports 478 points when the iris refinement is on (it is in the
 *  bundled face_landmarker.task); 468 without. Both are accepted. */
export const MP_MIN_LANDMARKS = 468;

export function hasEnoughLandmarks(landmarks: MpLandmarks | null | undefined): landmarks is MpLandmarks {
  return !!landmarks && landmarks.length >= MP_MIN_LANDMARKS;
}

/**
 * Head pose as signed RATIOS of the face's own size, so the numbers are the
 * same whether the person is close to the camera or far from it.
 *
 *   yaw   > 0 : nose moved towards the image's RIGHT edge = the person turned
 *               their head to THEIR LEFT (the raw frame is not mirrored; only
 *               the on-screen preview is). Negative = turned to their right.
 *   pitch > 0 : nose moved DOWN relative to the forehead–chin midpoint = the
 *               person tilted their head DOWN. Negative = looked up.
 *   roll      : rotation of the eye line, radians, positive = clockwise in
 *               the raw frame.
 *
 * Geometry rather than the 4x4 transformation matrix MediaPipe can also
 * return: the matrix's Euler decomposition has sign conventions that differ
 * between its documentation and its samples, and getting one of them wrong
 * inverts a whole direction silently (exactly the bug the 68-point version
 * shipped with on its first live run). Nose-versus-face-edge ratios have one
 * obvious meaning each and are checked by tests.
 */
export type HeadPose = { yaw: number; pitch: number; roll: number };

export function getHeadPose(landmarks: MpLandmarks): HeadPose {
  const nose = landmarks[MP.noseTip];
  const a = landmarks[MP.edgeA];
  const b = landmarks[MP.edgeB];
  const top = landmarks[MP.forehead];
  const bottom = landmarks[MP.chin];
  const le = landmarks[MP.leftEyeOuter];
  const re = landmarks[MP.rightEyeOuter];
  if (!nose || !a || !b || !top || !bottom || !le || !re) return { yaw: 0, pitch: 0, roll: 0 };

  const width = Math.abs(b.x - a.x);
  const height = Math.abs(bottom.y - top.y);
  const midX = (a.x + b.x) / 2;
  const midY = (top.y + bottom.y) / 2;
  const yaw = width > 0 ? (nose.x - midX) / width : 0;
  const pitch = height > 0 ? (nose.y - midY) / height : 0;
  const roll = Math.atan2(re.y - le.y, re.x - le.x);
  return { yaw, pitch, roll };
}

/**
 * The face's bounding box in normalised frame units, from the landmarks
 * themselves. MediaPipe's own detector box is not exposed by the landmarker
 * task, and the landmark hull is a better "how big is the face" measure
 * anyway -- the detector box includes hair and varies with it.
 */
export function landmarkBox(landmarks: MpLandmarks): { x: number; y: number; width: number; height: number } {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

// ---------------------------------------------------------------------------
// Framing gates -- applied to every tracked frame before it may count for
// anything. Same purpose as the 68-point gates in shared/face-auth.ts (a bad
// enrolment frame is the main cause of later false rejections), re-expressed
// for normalised coordinates.
// ---------------------------------------------------------------------------

/** Face width as a share of the frame width. MediaPipe's landmark hull is a
 *  little narrower than dlib's detector box for the same face, so this is
 *  slightly below the 0.30 used for the descriptor gate. At 720p that still
 *  leaves the face ~330px wide -- ample for the 150px recognition crop. */
export const POSE_MIN_FACE_WIDTH_RATIO = 0.26;
/** Same gate for angled views, where the projected width shrinks. */
export const POSE_MIN_FACE_WIDTH_RATIO_TURNED = 0.20;
/** How far the face centre may sit from the frame centre. */
export const POSE_MAX_CENTER_OFFSET = 0.22;

export type FramingIssue = "NO_FACE" | "MULTIPLE_FACES" | "TOO_FAR" | "OFF_CENTER";

export function checkFraming(faces: number, landmarks: MpLandmarks | null, turned = false): FramingIssue | null {
  if (faces === 0 || !landmarks) return "NO_FACE";
  if (faces > 1) return "MULTIPLE_FACES";
  const box = landmarkBox(landmarks);
  if (box.width < (turned ? POSE_MIN_FACE_WIDTH_RATIO_TURNED : POSE_MIN_FACE_WIDTH_RATIO)) return "TOO_FAR";
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (Math.abs(cx - 0.5) > POSE_MAX_CENTER_OFFSET || Math.abs(cy - 0.5) > POSE_MAX_CENTER_OFFSET) return "OFF_CENTER";
  return null;
}

// ---------------------------------------------------------------------------
// Directional coverage -- the Face ID-style ring.
//
// The head direction is a 2-D vector (screen-x from yaw, screen-y from
// pitch). Once its length passes ENROLL_TURN_MIN the vector's angle selects
// one of eight 45-degree sectors. A sector counts as covered after the head
// has been held in it for a few consecutive frames, which filters the
// instant a fast sweep passes through and would otherwise "cover" sectors
// the model never got a clean look at.
// ---------------------------------------------------------------------------

export const COVERAGE_SECTORS = 8;
/** Minimum turn (vector length, face-size ratio) for a direction to count. */
export const ENROLL_TURN_MIN = 0.09;
/** Beyond this the descriptor network starts losing the face; the ring keeps
 *  filling but no reference is stored from such frames. */
export const ENROLL_TURN_MAX = 0.26;
/** Consecutive frames the head must stay in a sector before it is covered. */
export const ENROLL_HOLD_FRAMES = 3;
/** Frames of "facing straight" needed for the centre reference. */
export const ENROLL_CENTER_FRAMES = 4;
/** |yaw| and |pitch| both below this = facing straight at the camera. */
export const CENTER_TOLERANCE = 0.05;

/**
 * Screen-space direction of the head: +x = the person is turning towards the
 * viewer's RIGHT on the mirrored preview (their own right), +y = down.
 *
 * The preview is CSS-mirrored so that the ring segment that lights up is the
 * one the person sees themselves turning towards. That mirror is applied
 * HERE, once, so that both the ring and every instruction agree.
 */
export function screenDirection(pose: HeadPose): { x: number; y: number } {
  return { x: -pose.yaw, y: pose.pitch };
}

/** Sector index for a screen-space direction, 0 = right, then clockwise
 *  (1 = down-right, 2 = down ... 6 = up, 7 = up-right), or null when the head
 *  is not turned far enough to count. */
export function sectorOf(direction: { x: number; y: number }): number | null {
  const length = Math.hypot(direction.x, direction.y);
  if (length < ENROLL_TURN_MIN) return null;
  const degrees = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  return Math.floor((((degrees + 360) % 360) + 360 / COVERAGE_SECTORS / 2) / (360 / COVERAGE_SECTORS)) % COVERAGE_SECTORS;
}

/** Human labels, indexed by sector, in the order sectorOf returns. */
export const SECTOR_LABELS: readonly string[] = [
  "баруун", "баруун доош", "доош", "зүүн доош", "зүүн", "зүүн дээш", "дээш", "баруун дээш",
];

/** Stable pose keys stored with each sector's descriptor. */
export const SECTOR_KEYS: readonly string[] = ["r", "dr", "d", "dl", "l", "ul", "u", "ur"];

export type CoverageEvent =
  | { type: "sector"; sector: number }
  | { type: "center" }
  | null;

/**
 * Tracks which directions have been covered during enrolment.
 *
 * Feed it one pose per tracked frame; it reports the moment a new sector (or
 * the centre) becomes covered so the caller can snapshot that frame. It never
 * reports the same sector twice.
 */
export class CoverageTracker {
  private readonly covered = new Set<number>();
  private centerCovered = false;
  private currentSector: number | null = null;
  private holdCount = 0;
  private centerCount = 0;

  observe(pose: HeadPose): CoverageEvent {
    const direction = screenDirection(pose);
    const sector = sectorOf(direction);

    if (sector === null) {
      this.currentSector = null;
      this.holdCount = 0;
      const centred = Math.abs(pose.yaw) < CENTER_TOLERANCE && Math.abs(pose.pitch) < CENTER_TOLERANCE;
      if (centred && !this.centerCovered) {
        this.centerCount += 1;
        if (this.centerCount >= ENROLL_CENTER_FRAMES) {
          this.centerCovered = true;
          return { type: "center" };
        }
      } else if (!centred) {
        this.centerCount = 0;
      }
      return null;
    }

    this.centerCount = 0;
    if (sector === this.currentSector) this.holdCount += 1;
    else {
      this.currentSector = sector;
      this.holdCount = 1;
    }
    if (this.holdCount >= ENROLL_HOLD_FRAMES && !this.covered.has(sector)) {
      this.covered.add(sector);
      return { type: "sector", sector };
    }
    return null;
  }

  /** The sector the head is currently held in, for live highlighting. */
  get current(): number | null {
    return this.currentSector;
  }

  get coveredSectors(): ReadonlySet<number> {
    return this.covered;
  }

  get hasCenter(): boolean {
    return this.centerCovered;
  }

  get complete(): boolean {
    return this.centerCovered && this.covered.size >= COVERAGE_SECTORS;
  }

  /** 0..1 across centre + all sectors, for the ring and the progress bar. */
  get progress(): number {
    return (this.covered.size + (this.centerCovered ? 1 : 0)) / (COVERAGE_SECTORS + 1);
  }

  /** The nearest uncovered sector to the current direction, so the hint can
   *  say "now turn up-left" instead of a generic "keep going". */
  nextTarget(): number | null {
    if (this.covered.size >= COVERAGE_SECTORS) return null;
    const from = this.currentSector ?? 0;
    for (let step = 0; step < COVERAGE_SECTORS; step += 1) {
      const candidate = (from + step) % COVERAGE_SECTORS;
      if (!this.covered.has(candidate)) return candidate;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Blink, from blendshapes.
//
// MediaPipe's eyeBlinkLeft / eyeBlinkRight scores are trained outputs in
// [0, 1], which removes the per-person eye-shape calibration the 68-point
// eye-aspect-ratio needed. A blink is still a SEQUENCE (open, shut, open) --
// a single "eyes shut" frame is what a photo of a sleeping person gives.
// ---------------------------------------------------------------------------

export const BLINK_SHUT = 0.5;
export const BLINK_OPEN = 0.25;

export type Blendshapes = ReadonlyMap<string, number>;

export function blendshapeMap(categories: readonly { categoryName: string; score: number }[] | undefined): Blendshapes {
  const map = new Map<string, number>();
  for (const c of categories ?? []) map.set(c.categoryName, c.score);
  return map;
}

export class BlinkDetector {
  private shut = false;
  private blinks = 0;

  observe(shapes: Blendshapes): void {
    const left = shapes.get("eyeBlinkLeft") ?? 0;
    const right = shapes.get("eyeBlinkRight") ?? 0;
    const closed = Math.min(left, right);
    if (!this.shut && closed > BLINK_SHUT) this.shut = true;
    else if (this.shut && closed < BLINK_OPEN) {
      this.shut = false;
      this.blinks += 1;
    }
  }

  get count(): number {
    return this.blinks;
  }

  get seen(): boolean {
    return this.blinks > 0;
  }
}

// ---------------------------------------------------------------------------
// Stillness -- "hold still" before a recognition snapshot is taken. Motion
// blur is the other big source of mushy descriptors besides distance.
// ---------------------------------------------------------------------------

/** Max per-frame movement of the nose tip (share of face width) to be still. */
export const STILL_MAX_MOTION = 0.02;
export const STILL_FRAMES = 3;

export class StillnessTracker {
  private last: { x: number; y: number; width: number } | null = null;
  private stillRun = 0;

  observe(landmarks: MpLandmarks): boolean {
    const nose = landmarks[MP.noseTip];
    const box = landmarkBox(landmarks);
    if (!nose || box.width === 0) {
      this.stillRun = 0;
      return false;
    }
    if (this.last) {
      const motion = Math.hypot(nose.x - this.last.x, nose.y - this.last.y) / box.width;
      if (motion <= STILL_MAX_MOTION) this.stillRun += 1;
      else this.stillRun = 0;
    }
    this.last = { x: nose.x, y: nose.y, width: box.width };
    return this.stillRun >= STILL_FRAMES;
  }

  reset(): void {
    this.last = null;
    this.stillRun = 0;
  }
}

// ---------------------------------------------------------------------------
// Login capture policy.
// ---------------------------------------------------------------------------

/** Snapshots taken at login, each turned into one descriptor and averaged.
 *  Three, not twelve: the descriptor network is the expensive step (it is
 *  what made the old check take ages on a phone), and three still frames of
 *  a centred face spaced a few hundred milliseconds apart carry the useful
 *  variation; the other nine were near-duplicates. */
export const LOGIN_SNAPSHOTS = 3;
/** Minimum gap between login snapshots so they are not the same instant. */
export const LOGIN_SNAPSHOT_SPACING_MS = 260;
/** Frontal tolerance for a login snapshot (looser than enrolment's centre,
 *  since every enrolled direction is available to match against). */
export const LOGIN_FRONTAL_TOLERANCE = 0.10;
