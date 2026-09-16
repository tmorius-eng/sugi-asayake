import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CameraOff, CheckCircle2, KeyRound, LoaderCircle, ScanFace, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import FaceHandoffPanel from "./admin/FaceHandoffPanel";
import FaceMethodChooser from "./admin/FaceMethodChooser";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FACE_HEARTBEAT_INTERVAL_MS,
  FACE_IDLE_TIMEOUT_MS,
  FACE_IDLE_WARNING_MS,
  FACE_DIAGNOSTIC_MAX,
  averageFaceDescriptors,
} from "@shared/face-auth";
import {
  BlinkDetector,
  COVERAGE_SECTORS,
  CoverageTracker,
  ENROLL_TURN_MAX,
  LOGIN_FRONTAL_TOLERANCE,
  LOGIN_SNAPSHOTS,
  LOGIN_SNAPSHOT_SPACING_MS,
  POSE_MIN_FACE_WIDTH_RATIO_TURNED,
  SECTOR_KEYS,
  SECTOR_LABELS,
  StillnessTracker,
  checkFraming,
  getHeadPose,
  type FramingIssue,
  type HeadPose,
} from "@shared/face-pose";
import {
  FaceCameraError,
  SmoothMeshRenderer,
  captureFace,
  loadFaceModels,
  startCamera,
  stopCamera,
  type CameraError,
} from "@/lib/faceEngine";
import { drawTrackedMesh, loadFaceTracker, overlaySize, snapshotFrame, trackFrame, trackerDelegate, warmMeshContours } from "@/lib/faceTracker";
import { faceBackendName, warmUpFaceModels } from "@/lib/faceEngine";

/**
 * Admin face gate (2026-09-08; tracking rebuilt 2026-09-13) — stands between
 * the /admin role check and the admin panel itself, for the five panel roles
 * only. No storefront page renders this, and no customer is ever asked for a
 * camera.
 *
 * Three states, decided by faceAuth.status:
 *   1. gate off, or this device already verified  -> render the panel, no camera
 *   2. no enrollment yet (or a stale model)       -> consent, then enroll, then verify
 *   3. enrolled but this device not verified      -> verify
 *
 * DESIGNED SO IT CANNOT LOCK ANYONE OUT, which matters more here than
 * anywhere else in the app because the thing behind this gate is the tool you
 * would use to fix the gate. Three independent escapes exist: the
 * ADMIN_FACE_GATE_ENABLED env switch turns the whole thing off without a code
 * change; an admin can clear any user's enrollment from the Users drawer; and
 * every failure path below offers a retry rather than dead-ending.
 *
 * HOW THE 2026-09-13 REBUILD CHANGED THE FLOW (Tom, from a phone: "reading
 * your face takes far too long", and enrolment "was very basic -- a slight
 * turn to the right and it was registered"):
 *
 *  - Tracking is MediaPipe Face Landmarker (client/src/lib/faceTracker.ts):
 *    478 points and blendshapes at camera frame rate, on a phone GPU. The
 *    dlib descriptor network -- the slow part -- now runs only on a handful
 *    of snapshots the tracker picked, not on every frame.
 *  - Enrolment is the Face ID gesture: turn the head slowly in a circle and
 *    fill eight ring segments (plus the centre). Nine views are stored, so
 *    verification later matches whichever one is closest to how the person
 *    is actually sitting. Sweeping past a direction does not count; it has
 *    to be held for a few frames.
 *  - Login stays frictionless (look at the camera, three still snapshots,
 *    done) but now MEASURES liveness passively: a natural blink seen by the
 *    blendshapes is reported honestly as livenessPassed. It is recorded, not
 *    enforced, exactly as before (ADMIN_FACE_LIVENESS_ENFORCED).
 */
export default function AdminFaceGate({ children }: { children: React.ReactNode }) {
  /**
   * Аль замаар баталгаажуулахаа сонгосон эсэх (2026-09-16). `null` бол
   * сонголтын дэлгэц. Өмнө нь хаалга шууд камер асаадаг байсан тул утсаар
   * баталгаажуулах гарц зөвхөн камер УНАСНЫ дараа л харагддаг байв — Tom
   * камергүй компьютер дээр олж чадаагүй.
   */
  const [method, setMethod] = useState<"camera" | "phone" | null>(null);
  const statusQuery = trpc.faceAuth.status.useQuery(undefined, {
    // The gate decides whether the admin panel renders at all, so a stale
    // cached "verified" must never be what lets someone in.
    staleTime: 0,
    // 2026-09-12: re-check when the tab comes back (a laptop lid opening is
    // exactly the moment an idle lock should show) and once a minute while
    // open, so a proof that lapsed server-side is noticed even if this tab's
    // own timer was frozen. Cheap: one indexed lookup plus a signature check.
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  if (statusQuery.isLoading) {
    return (
      <div className="face-gate-shell">
        <div className="face-gate-card">
          <LoaderCircle className="animate-spin" size={22} aria-hidden="true" />
          <p className="face-gate-muted">Шалгаж байна…</p>
        </div>
      </div>
    );
  }

  // Fail OPEN on a status error, deliberately. A network blip or a DB hiccup
  // must not brick the admin panel: the password login already happened, and
  // this is the second factor, not the first. Failing closed here would mean
  // one transient error locks every staff member out of the tool they would
  // need to fix it.
  if (statusQuery.isError) return <>{children}</>;

  const status = statusQuery.data;
  if (!status || !status.gateEnabled) return <>{children}</>;
  if (status.verified) {
    return (
      <>
        <IdleLockWatcher idleTimeoutMs={status.idleTimeoutMs} onLocked={() => statusQuery.refetch()} />
        {children}
      </>
    );
  }

  // Царайн БҮРТГЭЛ хийхэд камер зайлшгүй (олон өнцгийн зураг) тул утсаар
  // баталгаажуулах зам зөвхөн БҮРТГЭЛТЭЙ хүнд нээлттэй
  // (docs/FACE-HANDOFF-PLAN.md).
  const needsEnrollment = !status.enrolled || status.modelStale;
  const canHandoff = !needsEnrollment;

  if (canHandoff && method === null) {
    return <FaceMethodChooser tips={FACE_TIPS} onUseCamera={() => setMethod("camera")} onUsePhone={() => setMethod("phone")} />;
  }
  if (method === "phone") {
    return <FaceHandoffPanel onPassed={() => { setMethod(null); void statusQuery.refetch(); }} onBack={() => setMethod(null)} />;
  }
  return (
    <FaceGateFlow
      needsEnrollment={needsEnrollment}
      modelStale={status.modelStale}
      onPassed={() => statusQuery.refetch()}
      onUseHandoff={canHandoff ? () => setMethod("phone") : undefined}
      onBack={canHandoff ? () => setMethod(null) : undefined}
    />
  );
}

/**
 * Locks /admin after FACE_IDLE_TIMEOUT_MS without real interaction, and warns
 * shortly before (2026-09-12, Tom: 25 минут ямар ч үйлдэлгүй бол дахин
 * нүүрээ таниулах).
 *
 * Three things make this an actual timeout rather than a decoration:
 *
 *  - Only REAL input counts. The panel polls on timers (the bell, the
 *    notification log), so if any request counted as activity, a dashboard
 *    left open on a counter would renew itself forever.
 *  - The server is the one that enforces it. This component's timer decides
 *    WHEN to lock and gives the warning; the lock itself clears the proof
 *    cookie server-side, so a browser with its JavaScript paused (or a
 *    machine asleep past the deadline) is refused on its next request
 *    anyway -- the proof carries its own expiry.
 *  - Every open tab locks together, through a BroadcastChannel. Locking one
 *    tab while a second sat unlocked on the same screen would be worse than
 *    no lock at all.
 */
function IdleLockWatcher({ idleTimeoutMs, onLocked }: { idleTimeoutMs: number; onLocked: () => void }) {
  const lock = trpc.faceAuth.lock.useMutation();
  const heartbeat = trpc.faceAuth.heartbeat.useMutation();
  const lastActivityRef = useRef(Date.now());
  const lastBeatRef = useRef(Date.now());
  const lockingRef = useRef(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const timeout = idleTimeoutMs > 0 ? idleTimeoutMs : FACE_IDLE_TIMEOUT_MS;

  const doLock = useCallback(async (broadcast: boolean) => {
    if (lockingRef.current) return;
    lockingRef.current = true;
    try {
      if (broadcast) channelRef.current?.postMessage("lock");
      await lock.mutateAsync({ reason: "idle" });
    } catch {
      // Even if the call fails, fall through to onLocked: the proof has
      // expired on its own by now, so the refetched status will say so.
    }
    onLocked();
  }, [lock, onLocked]);

  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    channelRef.current = typeof BroadcastChannel === "function" ? new BroadcastChannel("sugi-admin-idle") : null;
    const channel = channelRef.current;
    if (channel) channel.onmessage = event => { if (event.data === "lock") void doLock(false); };
    return () => { channel?.close(); channelRef.current = null; };
  }, [doLock]);

  useEffect(() => {
    // Pointer/key/touch/scroll -- what a person does. Deliberately NOT
    // "any fetch" and not mousemove alone (a nudged desk should not count as
    // working, and a trackpad drifting under a sleeve certainly should not).
    const markActive = () => {
      lastActivityRef.current = Date.now();
      setRemainingMs(null);
      if (Date.now() - lastBeatRef.current >= FACE_HEARTBEAT_INTERVAL_MS) {
        lastBeatRef.current = Date.now();
        heartbeat.mutate();
      }
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    for (const event of events) window.addEventListener(event, markActive, { passive: true });

    const tick = window.setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= timeout) { void doLock(true); return; }
      // Count down only inside the warning window, so nothing is shown for
      // the first 23 quiet minutes.
      setRemainingMs(idleFor >= timeout - FACE_IDLE_WARNING_MS ? timeout - idleFor : null);
    }, 1000);

    return () => {
      for (const event of events) window.removeEventListener(event, markActive);
      window.clearInterval(tick);
    };
  }, [doLock, heartbeat, timeout]);

  if (remainingMs === null) return null;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-md rounded-2xl border border-[#f0b52d] bg-[#17181b] px-4 py-3 text-white shadow-lg sm:inset-x-auto sm:right-4">
      <p className="text-sm font-bold text-[#f0b52d]">Түгжигдэх гэж байна</p>
      <p className="mt-1 text-xs leading-5 text-white/80">
        Удаан хугацаанд үйлдэл хийгээгүй тул {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} минутын дараа /admin түгжигдэж, нүүрээ дахин таниулах шаардлагатай болно.
      </p>
      <button type="button" onClick={() => { lastActivityRef.current = Date.now(); lastBeatRef.current = Date.now(); heartbeat.mutate(); setRemainingMs(null); }} className="mt-2 rounded-full bg-[#f0b52d] px-3 py-1.5 text-[11px] font-extrabold text-[#17181b]">
        Үргэлжлүүлэх
      </button>
    </div>
  );
}

const CAMERA_ERROR_COPY: Record<CameraError, string> = {
  INSECURE_CONTEXT: "Камер ашиглахын тулд сайт HTTPS холболттой байх шаардлагатай.",
  UNSUPPORTED: "Энэ хөтөч камерыг дэмжихгүй байна. Chrome эсвэл Edge ашиглана уу.",
  // Two genuinely different causes produce the same NotAllowedError, and the
  // second one shows NO browser prompt at all -- so telling the user only to
  // "allow it in the address bar" is useless advice exactly when they need
  // it most (Tom hit this on the first real run: Edge denied instantly with
  // no popup). Both are named here, browser first.
  DENIED: "Камер ашиглах зөвшөөрөл олгогдоогүй байна. (1) Хаягийн мөрөн дэх ⓘ тэмдэг → \"Энэ сайтын зөвшөөрөл\" → Камер → Зөвшөөрөх. (2) Хэрэв ямар ч цонх гараагүй бол: Windows Тохиргоо → Нууцлал ба аюулгүй байдал → Камер → \"Камерын хандалт\" болон \"Дэсктоп апп-д зөвшөөрөх\" хоёуланг нь асаана уу.",
  NOT_FOUND: "Камер олдсонгүй. Компьютерт камер холбогдсон эсэхийг шалгана уу.",
  IN_USE: "Камерыг өөр програм ашиглаж байна. Zoom, Teams зэрэг програмыг хаагаад дахин оролдоно уу.",
  CONSTRAINTS: "Камерын тохиргоо тохирохгүй байна. Өөр камер сонгох эсвэл хөтчөө шинэчилнэ үү.",
  UNKNOWN: "Камер нээхэд алдаа гарлаа. Дахин оролдоно уу.",
};

const FRAMING_COPY: Record<FramingIssue, string> = {
  NO_FACE: "Царай олдсонгүй — камер руу харна уу.",
  MULTIPLE_FACES: "Хоёр ба түүнээс дээш царай харагдаж байна. Ганцаараа байна уу.",
  TOO_FAR: "Хэт хол байна — камерт ойртоно уу.",
  OFF_CENTER: "Царайгаа дугуйн голд байрлуулна уу.",
};

type Phase = "consent" | "camera" | "working" | "done";

/** Practical advice, shown alongside the camera. These are the actual causes
 *  of failure seen in testing, not generic filler. */
const FACE_TIPS = [
  "Гэрэл нүүр рүү тань тусаж байх ёстой — цонх эсвэл гэрлийг ард биш, урдаа байлга.",
  "Дэлгэцээс 40-60 см зайд, царай дугуй хүрээг дүүргэж байрлана уу.",
  "Бүртгүүлэхдээ толгойгоо АААЖУУ тойруулан эргүүлнэ — цагирагийн хэсэг бүр гэрэлтэх хүртэл тэр чиглэлд түр барина.",
  "Малгай, нарны шил, амны хаалт зэргийг түр авна уу (энгийн нүдний шил зүгээр).",
] as const;

/** Tracking cadence. MediaPipe is cheap, but on a phone 60 detections a
 *  second is still wasted heat: the head does not move meaningfully in 16ms.
 *  ~25/s keeps the ring responsive and the mesh smooth (the renderer
 *  interpolates between detections at the display rate). */
const TRACK_INTERVAL_MS = 40;
/** Enrolment gives up after this long without completing the ring. */
const ENROLL_DEADLINE_MS = 90_000;
/** Login gives up after this long without three usable snapshots. */
const LOGIN_DEADLINE_MS = 30_000;

/** The mesh renderer interpolates a box it does not need for the 478-point
 *  painter; this placeholder keeps its interface unchanged. */
const NO_BOX = { x: 0, y: 0, width: 0, height: 0 } as unknown as Parameters<SmoothMeshRenderer["push"]>[1];

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export type FaceVerificationSubmit = (payload: {
  challengeId: number;
  descriptor: number[];
  livenessPassed: boolean;
  diagnostic: string;
}) => Promise<{ ok: boolean; reason?: string; distance?: number }>;

/**
 * `submitVerification` (2026-09-16): камергүй компьютерийн QR handoff-д
 * УТАС энэ урсгалыг яг тэр чигт нь ажиллуулдаг — ялгаа нь зөвхөн сүүлийн
 * дуудлага: `faceAuth.completeVerification` (өөрийн төхөөрөмжийг нээх)
 * эсвэл `faceAuth.approveHandoff` (компьютерийг нээх). Камер, амьд байдал,
 * дескриптор, алдааны мессеж бүгд ганц эх сурвалжтай хэвээр — утсанд
 * зориулж хоёр дахь камерын код бичих нь тэр даруй хоцрох байсан.
 */
export function FaceGateFlow({ needsEnrollment, modelStale, onPassed, submitVerification, onUseHandoff, onBack }: { needsEnrollment: boolean; modelStale: boolean; onPassed: () => void; submitVerification?: FaceVerificationSubmit; onUseHandoff?: () => void; onBack?: () => void }) {
  const [phase, setPhase] = useState<Phase>(needsEnrollment ? "consent" : "camera");
  const [hint, setHint] = useState<string>("Бэлтгэж байна…");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [faceLocked, setFaceLocked] = useState(false);
  /** Enrolment ring state, mirrored from the CoverageTracker for rendering. */
  const [covered, setCovered] = useState<ReadonlySet<number>>(new Set());
  const [currentSector, setCurrentSector] = useState<number | null>(null);
  const [targetSector, setTargetSector] = useState<number | null>(null);
  const [centerDone, setCenterDone] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** The visible preview. The <video> itself is kept at opacity 0 (still
   *  decoding -- display:none would stop it on iOS) and its frames are
   *  painted here, because iOS 17+ Safari draws its own play/pause overlay
   *  inside any inline <video> and no CSS reaches that layer (Tom, twice:
   *  "the pause button is still there"). A canvas has nothing to overlay. */
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const meshRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SmoothMeshRenderer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Guards against the capture loop continuing after unmount — without it,
  // an async frame that resolves post-unmount calls setState on a dead
  // component and, worse, keeps the camera light on.
  const abortRef = useRef(false);

  const enroll = trpc.faceAuth.enroll.useMutation();
  const startVerification = trpc.faceAuth.startVerification.useMutation();
  const completeVerification = trpc.faceAuth.completeVerification.useMutation();

  const cleanup = useCallback(() => {
    abortRef.current = true;
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
    previewFrameRef.current = null;
    rendererRef.current?.stop();
    rendererRef.current = null;
    stopCamera(streamRef.current);
    streamRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Waits for the <video> to actually have decoded frames. A stream is
   *  attached long before the first frame exists, and detecting during that
   *  window silently finds nothing — the classic "it just says no face"
   *  bug. */
  const waitForVideo = useCallback(async (video: HTMLVideoElement) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (abortRef.current) throw new Error("ABORTED");
      if (video.readyState >= 2 && video.videoWidth > 0) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("VIDEO_TIMEOUT");
  }, []);

  /**
   * One tracked frame: runs the landmarker, feeds the mesh, and returns what
   * the flows need. Paces itself to TRACK_INTERVAL_MS.
   */
  const track = useCallback(async (video: HTMLVideoElement, lastAt: { t: number }) => {
    const wait = TRACK_INTERVAL_MS - (performance.now() - lastAt.t);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    await nextFrame();
    if (abortRef.current) throw new Error("ABORTED");
    lastAt.t = performance.now();
    const frame = trackFrame(video);
    if (frame.landmarks) rendererRef.current?.push(frame.landmarks, NO_BOX);
    else rendererRef.current?.clear();
    setFaceLocked(!!frame.landmarks);
    return frame;
  }, []);

  /**
   * Face ID-style enrolment: hold the head in each of eight directions and
   * straight on; snapshot the frame the moment each is covered.
   *
   * Returns the raw snapshots. The descriptor network is NOT run here -- it
   * would stall the ring for half a second per direction on a phone. The
   * snapshots are processed after the gesture is complete, with a visible
   * counter, so the interactive part stays fluid.
   */
  const runRingEnrollment = useCallback(async (video: HTMLVideoElement): Promise<{
    center: HTMLCanvasElement[];
    sectors: { sector: number; frame: HTMLCanvasElement; pose: HeadPose }[];
  }> => {
    const coverage = new CoverageTracker();
    const center: HTMLCanvasElement[] = [];
    const sectors: { sector: number; frame: HTMLCanvasElement; pose: HeadPose }[] = [];
    const lastAt = { t: 0 };
    const deadline = Date.now() + ENROLL_DEADLINE_MS;
    let centerExtras = 0;

    setEnrolling(true);
    setCovered(new Set());
    setCurrentSector(null);
    setCenterDone(false);
    setTargetSector(null);
    setHint("Эхлээд камер руу шууд харна уу");

    while (!coverage.complete && Date.now() < deadline) {
      const frame = await track(video, lastAt);
      const framing = checkFraming(frame.faces, frame.landmarks, coverage.current !== null);
      if (framing || !frame.landmarks) {
        setHint(FRAMING_COPY[framing ?? "NO_FACE"]);
        continue;
      }

      const pose = getHeadPose(frame.landmarks);
      const event = coverage.observe(pose);
      setCurrentSector(coverage.current);
      setProgress(Math.round(coverage.progress * 100));

      if (event?.type === "center") {
        center.push(snapshotFrame(video));
        setCenterDone(true);
      } else if (event?.type === "sector") {
        // Store a reference only from a MODERATE turn: past ENROLL_TURN_MAX
        // the recogniser starts losing the face and the descriptor quality
        // collapses, so the segment still lights up but no view is kept.
        const strength = Math.hypot(pose.yaw, pose.pitch);
        if (strength <= ENROLL_TURN_MAX) sectors.push({ sector: event.sector, frame: snapshotFrame(video), pose });
        setCovered(new Set(coverage.coveredSectors));
      } else if (coverage.hasCenter && coverage.current === null && centerExtras < 3
        && Math.abs(pose.yaw) < 0.05 && Math.abs(pose.pitch) < 0.05 && center.length > 0) {
        // A few more frontal frames while the person passes through the
        // centre between directions, for a better-averaged frontal vector.
        centerExtras += 1;
        center.push(snapshotFrame(video));
      }

      const target = coverage.hasCenter ? coverage.nextTarget() : null;
      setTargetSector(target);
      if (!coverage.hasCenter) setHint("Камер руу шууд харна уу — хөдөлгөөнгүй");
      else if (target !== null) setHint(`Толгойгоо аажуу тойруулан эргүүлнэ үү → ${SECTOR_LABELS[target]}`);
      else setHint("Сайн байна");
    }

    setEnrolling(false);
    setTargetSector(null);
    if (!coverage.complete) throw new Error("RING_TIMEOUT");
    if (center.length === 0) throw new Error("CAPTURE_TIMEOUT");
    return { center, sectors };
  }, [track]);

  /**
   * Turns snapshots into descriptors with the dlib network, one at a time,
   * reporting progress. A snapshot the recogniser cannot use (its own
   * detector disagrees with the tracker, or the crop is too small) is
   * skipped rather than failing the whole enrolment; the centre needs at
   * least two usable frames.
   */
  const describeSnapshots = useCallback(async (input: { center: HTMLCanvasElement[]; sectors: { sector: number; frame: HTMLCanvasElement }[] }) => {
    const total = input.center.length + input.sectors.length;
    let done = 0;
    const centerDescriptors: number[][] = [];
    for (const frame of input.center) {
      if (abortRef.current) throw new Error("ABORTED");
      setProcessing(`Боловсруулж байна ${done + 1}/${total}`);
      const result = await captureFace(frame);
      if (result.ok) centerDescriptors.push(result.sample.descriptor);
      done += 1;
      setProgress(Math.round((done / total) * 100));
    }
    const poses: { pose: string; descriptor: number[] }[] = [];
    for (const { sector, frame } of input.sectors) {
      if (abortRef.current) throw new Error("ABORTED");
      setProcessing(`Боловсруулж байна ${done + 1}/${total}`);
      const result = await captureFace(frame, POSE_MIN_FACE_WIDTH_RATIO_TURNED);
      if (result.ok) poses.push({ pose: SECTOR_KEYS[sector], descriptor: result.sample.descriptor });
      done += 1;
      setProgress(Math.round((done / total) * 100));
    }
    setProcessing(null);
    if (centerDescriptors.length < 2) throw new Error("CAPTURE_TIMEOUT");
    return { centerDescriptors, poses };
  }, []);

  /**
   * Login capture: three still, frontal snapshots a few hundred milliseconds
   * apart, while a blink detector watches the blendshapes.
   */
  const runLoginCapture = useCallback(async (video: HTMLVideoElement): Promise<{ frames: HTMLCanvasElement[]; blinks: number; frontal: number; trackMsAvg: number }> => {
    const blink = new BlinkDetector();
    const still = new StillnessTracker();
    const frames: HTMLCanvasElement[] = [];
    const lastAt = { t: 0 };
    const deadline = Date.now() + LOGIN_DEADLINE_MS;
    let lastSnapshotAt = 0;
    let frontalFrames = 0;

    setHint("Камер руу шууд харна уу");
    let trackMsTotal = 0;
    let trackCount = 0;
    while (frames.length < LOGIN_SNAPSHOTS && Date.now() < deadline) {
      const t0 = performance.now();
      const frame = await track(video, lastAt);
      trackMsTotal += performance.now() - t0;
      trackCount += 1;
      const framing = checkFraming(frame.faces, frame.landmarks);
      if (framing || !frame.landmarks) {
        setHint(FRAMING_COPY[framing ?? "NO_FACE"]);
        still.reset();
        continue;
      }
      blink.observe(frame.blendshapes);
      const pose = getHeadPose(frame.landmarks);
      const frontal = Math.abs(pose.yaw) < LOGIN_FRONTAL_TOLERANCE && Math.abs(pose.pitch) < LOGIN_FRONTAL_TOLERANCE;
      const isStill = still.observe(frame.landmarks);
      if (!frontal) {
        setHint("Камер руу шууд харна уу");
        continue;
      }
      frontalFrames += 1;
      if (!isStill) {
        setHint("Хөдөлгөөнгүй байна уу…");
        continue;
      }
      if (performance.now() - lastSnapshotAt >= LOGIN_SNAPSHOT_SPACING_MS) {
        frames.push(snapshotFrame(video));
        lastSnapshotAt = performance.now();
        setProgress(Math.round((frames.length / LOGIN_SNAPSHOTS) * 60));
        setHint(frames.length < LOGIN_SNAPSHOTS ? "Царай уншиж байна…" : "Боловсруулж байна…");
      }
    }
    if (frames.length === 0) throw new Error("CAPTURE_TIMEOUT");
    return { frames, blinks: blink.count, frontal: frontalFrames, trackMsAvg: trackCount ? trackMsTotal / trackCount : 0 };
  }, [track]);

  const run = useCallback(async () => {
    setFatalError(null);
    setProgress(0);
    setProcessing(null);
    abortRef.current = false;
    setPhase("camera");

    try {
      // Camera permission, the tracker runtime and the recogniser weights all
      // load at once: the person answers the camera prompt while the models
      // download, instead of waiting for one and then the other.
      setHint("Загвар ачааллаж байна…");
      warmMeshContours();
      const [stream] = await Promise.all([startCamera(), loadFaceTracker(), loadFaceModels()]);
      streamRef.current = stream;
      // Compile the recogniser's shaders now, while the person is still
      // lining up their face -- not later, under the spinner.
      void warmUpFaceModels();

      const video = videoRef.current;
      if (!video) throw new Error("NO_VIDEO_ELEMENT");
      if (meshRef.current) {
        rendererRef.current?.stop();
        rendererRef.current = new SmoothMeshRenderer(meshRef.current, video, (canvas, v, points) => drawTrackedMesh(canvas, v, points));
      }
      video.srcObject = stream;
      // Some browsers reject play() if the element isn't ready; the
      // waitForVideo poll below is the real readiness gate, so a rejection
      // here is not fatal on its own.
      await video.play().catch(() => undefined);
      await waitForVideo(video);

      // Paint the camera into the preview canvas at the display rate. One
      // drawImage per frame; the GPU does the scaling.
      const preview = previewRef.current;
      const previewCtx = preview?.getContext("2d");
      if (preview && previewCtx) {
        const paint = () => {
          previewFrameRef.current = requestAnimationFrame(paint);
          if (video.readyState < 2 || video.videoWidth === 0) return;
          const size = overlaySize(video);
          if (preview.width !== size.width || preview.height !== size.height) {
            preview.width = size.width;
            preview.height = size.height;
          }
          previewCtx.drawImage(video, 0, 0, size.width, size.height);
        };
        paint();
      }

      if (needsEnrollment) {
        const snapshots = await runRingEnrollment(video);
        const { centerDescriptors, poses } = await describeSnapshots(snapshots);
        setPhase("working");
        await enroll.mutateAsync({
          descriptor: averageFaceDescriptors(centerDescriptors),
          sampleCount: centerDescriptors.length,
          poses,
          consented: true,
        });
        // A genuinely SEPARATE verification follows, with a deliberate pause
        // and its own fresh capture. Without the pause this was circular:
        // the check ran milliseconds after enrollment against frames from
        // the same instant and always matched, proving nothing.
        setPhase("camera");
        setProgress(0);
        setHint("Бүртгэл амжилттай. Одоо баталгаажуулалт хийнэ — камер руу шууд харна уу.");
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (abortRef.current) throw new Error("ABORTED");
      }

      setHint("Шалгаж байна…");
      const { challengeId } = await startVerification.mutateAsync();
      setProgress(0);

      // LOGIN IS DELIBERATELY FRICTIONLESS: look at the camera, get matched,
      // get in. No head turns, no colour flash, no instructions to follow.
      // The guided capture belongs to ENROLMENT; repeating hoops on every
      // login rejected legitimate users while the match itself was fine.
      //
      // Liveness is still MEASURED: a natural blink during the second or so
      // of capture is reported as livenessPassed. Recorded, never enforced
      // (ADMIN_FACE_LIVENESS_ENFORCED). Stated plainly: without an enforced
      // challenge, someone with the enrolled person's phone AND password
      // AND a photograph of them could pass this step. This is the second
      // factor, not the first.
      const capture = await runLoginCapture(video);
      setPhase("working");
      const descriptors: number[][] = [];
      const describeStartedAt = performance.now();
      for (const frame of capture.frames) {
        const result = await captureFace(frame);
        if (result.ok) descriptors.push(result.sample.descriptor);
      }
      const describeMs = Math.round(performance.now() - describeStartedAt);
      if (descriptors.length === 0) throw new Error("CAPTURE_TIMEOUT");
      setProgress(90);

      const submit: FaceVerificationSubmit = submitVerification ?? (payload => completeVerification.mutateAsync(payload));
      const result = await submit({
        challengeId,
        descriptor: averageFaceDescriptors(descriptors),
        livenessPassed: capture.blinks > 0,
        // Machine-diagnosable from the Security Center: which backends ran
        // and how long the recogniser took, so "it was slow on that laptop"
        // comes with numbers.
        diagnostic: `login=mp snaps=${descriptors.length}/${capture.frames.length} blinks=${capture.blinks} frontal=${capture.frontal} tfjs=${faceBackendName()} mp=${trackerDelegate()} describeMs=${describeMs} trackMs=${Math.round(capture.trackMsAvg)}`.slice(0, FACE_DIAGNOSTIC_MAX),
      });

      cleanup();

      if (result.ok) {
        setProgress(100);
        setPhase("done");
        onPassed();
        return;
      }

      switch (result.reason) {
        case "no_match":
          setFatalError("Царайг тань таньсангүй. Дахин уншуулна уу — гэрэлтэй газар, камер руу шууд харна уу. Хэд дахин болохгүй бол админд хандаж царайн бүртгэлээ шинэчлүүлээрэй.");
          break;
        case "liveness_failed":
          setFatalError("Хөдөлгөөн баталгаажсангүй. Дэлгэц дээрх зааврыг гүйцэтгэнэ үү.");
          break;
        case "bad_challenge":
          setFatalError("Шалгалтын хугацаа дууссан байна. Дахин оролдоно уу.");
          break;
        case "stale_model":
        case "no_enrollment":
          setFatalError("Бүртгэл хүчингүй болсон байна. Дахин бүртгүүлнэ үү.");
          break;
      }
      setPhase("camera");
    } catch (error) {
      cleanup();
      setEnrolling(false);
      setProcessing(null);
      if (error instanceof FaceCameraError) {
        setFatalError(CAMERA_ERROR_COPY[error.kind]);
      } else if (error instanceof Error && error.message === "ABORTED") {
        return;
      } else if (error instanceof Error && (error.message === "MODEL_LOAD" || error.message === "TRACKER_LOAD")) {
        setFatalError("Царай таних загвар ачаалагдсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.");
      } else if (error instanceof Error && error.message === "MODEL_BACKEND") {
        setFatalError("Энэ хөтөч дээр царай таних боломжгүй байна. Chrome эсвэл Edge-ээр орно уу.");
      } else if (error instanceof Error && error.message === "RING_TIMEOUT") {
        setFatalError("Цагираг бүрэн дүүрсэнгүй. Толгойгоо аажуу тойруулан эргүүлж, гэрэлтэх хүртэл чиглэл бүрд түр барина уу. Эхнээс нь дахин оролдоно уу.");
      } else if (error instanceof Error && (error.message === "CAPTURE_TIMEOUT" || error.message === "VIDEO_TIMEOUT")) {
        setFatalError("Царайг тодорхойлж чадсангүй. Гэрэлтэй газар, камерт ойртож дахин оролдоно уу.");
      } else {
        setFatalError(error instanceof Error ? error.message : "Алдаа гарлаа. Дахин оролдоно уу.");
      }
      setPhase("camera");
    }
  }, [needsEnrollment, waitForVideo, runRingEnrollment, describeSnapshots, runLoginCapture, enroll, startVerification, completeVerification, submitVerification, cleanup, onPassed]);

  // Auto-start for the verify-only path. Enrollment waits for explicit
  // consent first -- capturing a face before someone has agreed to it being
  // stored would be exactly the thing the consent screen exists to prevent.
  useEffect(() => {
    if (!needsEnrollment) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "consent") {
    return <ConsentScreen modelStale={modelStale} onAccept={() => void run()} />;
  }

  if (phase === "done") {
    return (
      <div className="face-gate-shell">
        <div className="face-gate-card">
          <CheckCircle2 size={30} className="face-gate-ok" aria-hidden="true" />
          <h2>Баталгаажлаа</h2>
          <p className="face-gate-muted">Админ хэсэг рүү орж байна…</p>
        </div>
      </div>
    );
  }

  const busy = phase === "working";
  const showRing = needsEnrollment && (enrolling || processing !== null);

  return (
    <div className="face-gate-shell face-gate-shell--dark">
      <div className="face-gate-card face-gate-card--wide face-gate-card--scan">
        <div className="face-gate-head">
          <ScanFace size={20} aria-hidden="true" />
          <div>
            <h2>{needsEnrollment ? "Царайгаа бүртгэх" : "Царайгаар баталгаажуулах"}</h2>
            <p className="face-gate-muted">Админ хэсэгт нэвтрэхийн тулд шаардлагатай</p>
          </div>
        </div>

        {/* Circular scanner on a dark ground. During enrolment the rim is the
            eight-segment coverage ring (Face ID's gesture); during login it
            is a plain progress ring. */}
        <div className={`face-gate-stage${faceLocked ? " is-locked" : ""}`}>
          {showRing ? (
            <CoverageRing covered={covered} current={currentSector} target={targetSector} />
          ) : (
            <svg className="face-gate-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle className="face-gate-ring-track" cx="50" cy="50" r="47" />
              <circle
                className="face-gate-ring-value"
                cx="50" cy="50" r="47"
                /* 2*pi*r = 295.3. Offsetting the dash by the remaining share
                   draws exactly `progress` percent of the rim. */
                strokeDasharray="295.3"
                strokeDashoffset={295.3 * (1 - Math.min(100, Math.max(0, progress)) / 100)}
              />
            </svg>
          )}
          {/* muted + playsInline are required for autoplay to be allowed at
              all in Chrome/Safari; mirrored so turning left on screen matches
              turning left in reality, which is what the instruction says. */}
          <video ref={videoRef} className="face-gate-video" muted playsInline autoPlay controls={false} disablePictureInPicture disableRemotePlayback />
          <canvas ref={previewRef} className="face-gate-preview" aria-hidden="true" />
          {/* The live wireframe, drawn from the tracker's own landmarks -- an
              honest picture of what the system sees. */}
          <canvas ref={meshRef} className="face-gate-mesh" aria-hidden="true" />
          {showRing && <div className={`face-gate-center${centerDone ? " face-gate-center--done" : ""}`} aria-hidden="true" />}
          {showRing && targetSector !== null && (
            <div className="face-gate-arrow" aria-hidden="true" style={{ transform: `rotate(${targetSector * (360 / COVERAGE_SECTORS)}deg)` }} />
          )}

          {/* Sweeping scan line, running only while actively capturing. */}
          {!busy && !processing && !showRing && <div className="face-gate-scanline" aria-hidden="true" />}

          {processing && <div className="face-gate-processing">{processing}</div>}
          {busy && (
            <div className="face-gate-video-overlay">
              <LoaderCircle className="animate-spin" size={26} aria-hidden="true" />
            </div>
          )}
        </div>

        {showRing && (
          <p className="face-gate-count" aria-live="polite">
            {covered.size + (centerDone ? 1 : 0)}/{COVERAGE_SECTORS + 1} чиглэл
          </p>
        )}

        <div className="face-gate-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        {fatalError ? (
          <div className="face-gate-alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{fatalError}</span>
          </div>
        ) : (
          <p className="face-gate-hint" aria-live="polite">{hint}</p>
        )}

        {fatalError && (
          <button type="button" className="face-gate-btn" onClick={() => void run()} disabled={busy}>
            Дахин оролдох
          </button>
        )}

        {/* Камергүй/эвдэрсэн камертай компьютерийн цорын ганц зам. Алдаа
            гарсан үед ТОМООР, бусад үед чимээгүй холбоосоор — камертай хүнд
            энэ нь илүү удаан зам тул түрүүлж санал болгохгүй. */}
        {onUseHandoff && (fatalError
          ? <button type="button" className="face-gate-btn face-gate-btn-quiet" onClick={onUseHandoff}>Утсаараа баталгаажуулах</button>
          : <button type="button" className="face-gate-link" onClick={onUseHandoff}>Энэ компьютерт камер алга — утсаараа баталгаажуулах</button>)}
        {onBack && <button type="button" className="face-gate-link" onClick={onBack}>← Буцах</button>}

        {/* Practical advice, always visible rather than hidden behind a
            "why did this fail?" link -- these are the real causes of failure
            seen in testing, and reading them BEFORE failing saves a retry. */}
        <details className="face-gate-tips" open={!!fatalError}>
          <summary>Заавар ба зөвлөмж</summary>
          <ul>
            {FACE_TIPS.map(tip => <li key={tip}>{tip}</li>)}
          </ul>
          <p className="face-gate-tips-note">
            Хэд дахин оролдоод болохгүй бол админд хандаж царайн бүртгэлээ шинэчлүүлээрэй. Нууц үгэнд нөлөөлөхгүй.
          </p>
        </details>
      </div>
    </div>
  );
}

/**
 * The eight-segment coverage ring. Sector 0 is centred on the right (3
 * o'clock) and they proceed clockwise, matching shared/face-pose's sectorOf,
 * which is computed in SCREEN space -- so the segment that lights up is the
 * one the person sees themselves turning towards on the mirrored preview.
 */
function CoverageRing({ covered, current, target }: { covered: ReadonlySet<number>; current: number | null; target: number | null }) {
  const r = 47;
  const step = 360 / COVERAGE_SECTORS;
  const gapDeg = 6;
  const arc = (index: number) => {
    const start = ((index * step - step / 2 + gapDeg / 2) * Math.PI) / 180;
    const end = ((index * step + step / 2 - gapDeg / 2) * Math.PI) / 180;
    const x1 = 50 + r * Math.cos(start);
    const y1 = 50 + r * Math.sin(start);
    const x2 = 50 + r * Math.cos(end);
    const y2 = 50 + r * Math.sin(end);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  return (
    <svg className="face-gate-sectors" viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: COVERAGE_SECTORS }, (_, i) => {
        const cls = covered.has(i)
          ? "face-gate-sector face-gate-sector--covered"
          : i === current
            ? "face-gate-sector face-gate-sector--current"
            : i === target
              ? "face-gate-sector face-gate-sector--target"
              : "face-gate-sector";
        return <path key={i} className={cls} d={arc(i)} />;
      })}
    </svg>
  );
}

/**
 * Dedicated biometric-consent screen.
 *
 * Deliberately its own step rather than a line buried in general terms: a
 * face descriptor is sensitive personal data under Mongolia's Personal Data
 * Protection Law, and bundled consent does not satisfy it. The server
 * enforces this too (faceAuth.enroll requires `consented: true` as a literal
 * in its schema), so a client that skipped this screen still cannot enroll.
 *
 * LAYOUT, adapted from the enterprise sign-in pattern Tom pointed at (Oracle
 * Cloud's "Enable Secure Verification" screen) rather than copied from it:
 * a branded strip, the identity being enrolled, then a three-part diagram of
 * the security model, then the action. The diagram earns its place — it says
 * "password + face = access" in one glance, which is precisely the honest
 * framing this feature needs and which prose keeps having to repeat: the
 * face is a SECOND factor, never a replacement for the password.
 */
function ConsentScreen({ modelStale, onAccept }: { modelStale: boolean; onAccept: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const { user } = useAuth();

  return (
    <div className="face-gate-shell">
      <div className="face-gate-card face-gate-card--wide face-gate-card--consent">
        <div className="face-gate-brandstrip" aria-hidden="true" />

        <p className="face-gate-brand">SUGI ASAYAKE ADMIN</p>
        {/* Who is being enrolled. Shown because enrolling a face is tied to a
            specific account, and someone left signed in as a colleague should
            notice before their face is bound to the wrong one. */}
        {user && <p className="face-gate-identity">{user.name || user.phone || `#${user.id}`}</p>}

        <h2 className="face-gate-title">Царайгаар баталгаажуулах</h2>
        <p className="face-gate-lede">
          Админ хэсэгт нэвтрэхийн тулд нууц үгийн дараа царайгаар нэмэлт баталгаажуулалт хийнэ. Энэ нь таны бүртгэлийг өөр хүн нууц үгийг тань мэдсэн ч ашиглахаас хамгаална.
        </p>

        {modelStale && (
          <div className="face-gate-alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Царай таних загвар шинэчлэгдсэн тул дахин бүртгүүлэх шаардлагатай.</span>
          </div>
        )}

        {/* The security model in one line. Not decoration: "password AND
            face", never "face instead of password". */}
        <div className="face-gate-diagram" role="img" aria-label="Нууц үг нэмэх царай тэнцүү админ хандалт">
          <div className="face-gate-diagram-item">
            <span className="face-gate-diagram-icon"><KeyRound size={22} aria-hidden="true" /></span>
            <span>Нууц үг</span>
          </div>
          <span className="face-gate-diagram-op" aria-hidden="true">+</span>
          <div className="face-gate-diagram-item">
            <span className="face-gate-diagram-icon face-gate-diagram-icon--accent"><ScanFace size={22} aria-hidden="true" /></span>
            <span>Царай</span>
          </div>
          <span className="face-gate-diagram-op" aria-hidden="true">=</span>
          <div className="face-gate-diagram-item">
            <span className="face-gate-diagram-icon face-gate-diagram-icon--ok"><ShieldCheck size={22} aria-hidden="true" /></span>
            <span>Админ хандалт</span>
          </div>
        </div>

        {/* Every claim below is literally true of the implementation. If the
            architecture ever changes, this copy must change with it. */}
        <ul className="face-gate-facts">
          <li><strong>Зураг хадгалагдахгүй.</strong> Таны царайны зураг сервер рүү илгээгдэхгүй, хаана ч хадгалагдахгүй.</li>
          <li><strong>Зөвхөн 128 тоо.</strong> Царайг тань таних математик утга (128 тоо) л хадгалагдана. Үүнээс таны зургийг сэргээх боломжгүй.</li>
          <li><strong>Таны төхөөрөмж дээр боловсруулагдана.</strong> Камерын дүрс энэ төхөөрөмжөөс гарахгүй. Гадны ямар ч үйлчилгээ рүү илгээгдэхгүй.</li>
          <li><strong>Зөвхөн админ хэсэгт.</strong> Худалдан авагчид энэ шалгалтыг хэзээ ч харахгүй.</li>
        </ul>

        <p className="face-gate-limit">
          Бүртгэхдээ толгойгоо аажуу тойруулан эргүүлж, 8 чиглэл + төвийг бүртгэнэ (30 секунд орчим). Энэ шалгалт нь зураг барьж харуулах зэрэг энгийн хуурамчлалаас хамгаална. Гэхдээ таны бичлэгийг урьдчилан бэлтгэсэн, зорилготой халдлагаас бүрэн хамгаалахгүй — тиймээс нууц үг үргэлж эхний хамгаалалт хэвээр байна.
        </p>

        <label className="face-gate-consent">
          <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
          <span>Дээрхийг уншиж ойлгосон бөгөөд царайгаа бүртгүүлэхийг зөвшөөрч байна.</span>
        </label>

        <button type="button" className="face-gate-btn" disabled={!agreed} onClick={onAccept}>
          Камер нээж бүртгүүлэх
        </button>

        <p className="face-gate-muted face-gate-footnote">
          <CameraOff size={13} aria-hidden="true" /> Асуудал гарвал админ таны бүртгэлийг устгаж дахин эхлүүлэх боломжтой.
        </p>
      </div>
    </div>
  );
}
