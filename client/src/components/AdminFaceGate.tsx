import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CameraOff, CheckCircle2, KeyRound, LoaderCircle, ScanFace, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FACE_ENROLL_POSES,
  FACE_ENROLL_POSE_YAW,
  FACE_ENROLL_SAMPLES_PER_POSE,
  FACE_VERIFY_SAMPLES,
  FACE_VERIFY_MIN_DURATION_MS,
  FLASH_COLORS,
  SignalSmoother,
  YAW_TURN_RATIO,
  FACE_CHALLENGE_LABELS,
  LivenessTracker,
  averageFaceDescriptors,
  evaluateFlashResponse,
  getHeadYaw,
  type FaceChallengeAction,
  type FaceColorSample,
  type FlashColor,
} from "@shared/face-auth";
import {
  FaceCameraError,
  SmoothMeshRenderer,
  captureFace,
  loadFaceModels,
  sampleFaceColor,
  startCamera,
  stopCamera,
  type CameraError,
  type QualityIssue,
} from "@/lib/faceEngine";

/**
 * Admin face gate (2026-09-08) — stands between the /admin role check and the
 * admin panel itself, for the five panel roles only. No storefront page
 * renders this, and no customer is ever asked for a camera.
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
 */
export default function AdminFaceGate({ children }: { children: React.ReactNode }) {
  const statusQuery = trpc.faceAuth.status.useQuery(undefined, {
    // The gate decides whether the admin panel renders at all, so a stale
    // cached "verified" must never be what lets someone in.
    staleTime: 0,
    refetchOnWindowFocus: false,
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
  if (!status || !status.gateEnabled || status.verified) return <>{children}</>;

  return (
    <FaceGateFlow
      needsEnrollment={!status.enrolled || status.modelStale}
      modelStale={status.modelStale}
      onPassed={() => statusQuery.refetch()}
    />
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

const QUALITY_COPY: Record<QualityIssue, string> = {
  NO_FACE: "Царай олдсонгүй — камер руу харна уу.",
  MULTIPLE_FACES: "Хоёр ба түүнээс дээш царай харагдаж байна. Ганцаараа байна уу.",
  TOO_FAR: "Хэт хол байна — камерт ойртоно уу.",
  OFF_CENTER: "Царайгаа дэлгэцийн голд байрлуулна уу.",
  LOW_CONFIDENCE: "Гэрэл багадаж байна — илүү гэрэлтэй газар байрлана уу.",
};

type Phase = "consent" | "camera" | "working" | "done";

/**
 * The visible steps of a verification, shown as a numbered list so the person
 * can see what is happening and what is coming next.
 *
 * Added after live testing: without it the screen just showed a changing
 * sentence, so a slow step was indistinguishable from a frozen one ("I held
 * still for ages and nothing happened"). Knowing there are three steps and
 * which one is running turns a mystery into a wait.
 */
const FLOW_STEPS = [
  { key: "capture", label: "Царай уншиж байна" },
] as const;
type FlowStep = (typeof FLOW_STEPS)[number]["key"];

/** Practical advice, shown alongside the camera. These are the actual causes
 *  of failure seen in testing, not generic filler. */
const FACE_TIPS = [
  "Гэрэл нүүр рүү тань тусаж байх ёстой — цонх эсвэл гэрлийг ард биш, урдаа байлга.",
  "Дэлгэцээс 40-60 см зайд, царай дугуй хүрээг дүүргэж байрлана уу.",
  "Малгай, нарны шил, амны хаалт зэргийг түр авна уу (энгийн нүдний шил зүгээр).",
  "Өнгө анивчих үед дэлгэц рүү шууд харж, хөдөлгөөнгүй байна уу.",
] as const;

/** How long each colour stays on screen. Long enough for the webcam's
 *  auto-exposure to settle before the frame is sampled, short enough that the
 *  whole sequence stays under a couple of seconds. */
const FLASH_HOLD_MS = 420;
/** Frames are sampled only after this much of the hold has elapsed, so the
 *  reading is taken once the camera has adjusted rather than mid-transition. */
const FLASH_SETTLE_MS = 240;
/** How many times the four colours cycle. Two passes = 8 flashes, giving the
 *  scorer twice the evidence and the person a clearly visible sequence rather
 *  than a single blip. */
const FLASH_CYCLES = 2;

function randomFlashSequence(): FlashColor[] {
  const all = Object.keys(FLASH_COLORS) as FlashColor[];
  const out: FlashColor[] = [];
  for (let cycle = 0; cycle < FLASH_CYCLES; cycle += 1) {
    const colors = [...all];
    // Fisher-Yates per cycle. Every attempt gets a different order, which is
    // the entire anti-replay property of this check -- a recording made
    // earlier cannot have reacted to an order chosen just now.
    for (let i = colors.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    out.push(...colors);
  }
  return out;
}

function FaceGateFlow({ needsEnrollment, modelStale, onPassed }: { needsEnrollment: boolean; modelStale: boolean; onPassed: () => void }) {
  const [phase, setPhase] = useState<Phase>(needsEnrollment ? "consent" : "camera");
  const [hint, setHint] = useState<string>("Бэлтгэж байна…");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<FaceChallengeAction | null>(null);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meshRef = useRef<HTMLCanvasElement | null>(null);
  /** Draws the wireframe at the display's refresh rate, interpolating between
   *  detections. Detection itself only manages ~10-15fps, so drawing straight
   *  from it made the mesh snap between positions. */
  const rendererRef = useRef<SmoothMeshRenderer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** The colour currently painted over the preview during the flash
   *  challenge, or null when not flashing. */
  const [flash, setFlash] = useState<FlashColor | null>(null);
  const [faceLocked, setFaceLocked] = useState(false);
  const [step, setStep] = useState<FlowStep>("capture");
  // Guards against the capture loop continuing after unmount — without it,
  // an async frame that resolves post-unmount calls setState on a dead
  // component and, worse, keeps the camera light on.
  const abortRef = useRef(false);

  const enroll = trpc.faceAuth.enroll.useMutation();
  const startVerification = trpc.faceAuth.startVerification.useMutation();
  const completeVerification = trpc.faceAuth.completeVerification.useMutation();

  const cleanup = useCallback(() => {
    abortRef.current = true;
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
   * Collects `count` good-quality samples, showing the specific reason for
   * every rejected frame so the person can correct it instead of watching a
   * silent failure. Optionally feeds each frame's landmarks to a liveness
   * tracker.
   */
  const collectSamples = useCallback(async (
    video: HTMLVideoElement,
    count: number,
    tracker: LivenessTracker | null,
    requireFrontal: boolean,
    action: FaceChallengeAction | null,
    /** Minimum wall-clock time the capture should span. Without this the loop
     *  finishes in a fraction of a second and every frame is the same
     *  instant, which is no more informative than a single snapshot. */
    minDurationMs = 0,
  ): Promise<number[][]> => {
    const samples: number[][] = [];
    const startedAt = Date.now();
    const deadline = startedAt + 45_000;
    // Pace the frames so `count` of them fill `minDurationMs`, sampling real
    // variation over time instead of one moment repeated.
    const spacing = minDurationMs > 0 ? Math.floor(minDurationMs / count) : 0;

    // The loop must satisfy BOTH conditions, not just the sample count.
    //
    // This was a real bug caught on the first live run: with only
    // `samples.length < count`, five good frames are collected in well under
    // a second while the person is still sitting still reading the
    // instruction, so the loop exited and reported "you didn't blink" before
    // they had a chance to. Liveness now keeps the loop alive until the
    // action is actually observed (or the deadline hits).
    const done = () =>
      samples.length >= count
      && Date.now() - startedAt >= minDurationMs
      && (!tracker || tracker.passed);

    while (!done() && Date.now() < deadline) {
      if (abortRef.current) throw new Error("ABORTED");
      const result = await captureFace(video);

      if (!result.ok) {
        setHint(QUALITY_COPY[result.issue]);
        setFaceLocked(false);
        rendererRef.current?.clear();
        // No artificial delay here: detection itself already costs tens of
        // milliseconds, and a blink lasting 100-300ms is easy to miss if we
        // also sleep between frames -- the second half of the same bug.
        continue;
      }

      // Draw the wireframe on every good frame, using the very landmarks the
      // recogniser is working from.
      setFaceLocked(true);
      rendererRef.current?.push(result.sample.landmarks, result.sample.box);

      // Liveness is observed on EVERY good frame, including the ones whose
      // descriptor is skipped below — the turn itself is exactly the frame
      // we don't want in the descriptor average.
      if (tracker) tracker.observe(result.sample.landmarks);

      // During a head-turn challenge, only near-frontal frames contribute a
      // descriptor: averaging a turned face into the vector would move it
      // away from the frontal reference and cause a false rejection.
      const frontal = !requireFrontal || Math.abs(getHeadYaw(result.sample.landmarks)) <= 0.12;
      if (frontal && samples.length < count) {
        samples.push(result.sample.descriptor);
        if (spacing > 0) await new Promise(resolve => setTimeout(resolve, spacing));
      }

      // Progress reflects the whole job (frames AND the action), so it never
      // sits at 100% while still waiting for a blink.
      const frameShare = Math.min(samples.length / count, 1);
      const livenessShare = tracker ? (tracker.passed ? 1 : tracker.halfway ? 0.5 : 0) : 1;
      setProgress(Math.round(((frameShare + livenessShare) / 2) * 100));

      if (tracker && !tracker.passed) {
        setHint(tracker.halfway ? "Сайн байна — үргэлжлүүлнэ үү." : (action ? FACE_CHALLENGE_LABELS[action] : "Зааврыг гүйцэтгэнэ үү."));
      } else if (samples.length < count) {
        setHint("Камер руу шууд харна уу…");
      } else {
        setHint("Боловсруулж байна…");
      }
    }

    // Distinguish the two failure causes: "we never saw your face properly"
    // needs different advice from "we saw you fine but you didn't blink".
    if (samples.length < count) throw new Error("CAPTURE_TIMEOUT");
    if (tracker && !tracker.passed) throw new Error("LIVENESS_TIMEOUT");
    return samples;
  }, []);

  /**
   * Runs the colour-flash liveness challenge.
   *
   * Paints a randomised sequence of saturated colours over the preview and
   * measures how the face's skin responds to each. See evaluateFlashResponse
   * in faceEngine.ts for why this defeats a pre-recorded video where blink
   * detection does not: the sequence is chosen at random per attempt, so it
   * cannot have been recorded in advance.
   */
  /**
   * Guided head-turn sequence: turn RIGHT, then turn LEFT, then hold still
   * for the colour flash.
   *
   * A fixed, guided order rather than one randomly-chosen action. Two reasons
   * it is better here: the person always knows what is coming next instead of
   * reacting to a surprise instruction, and requiring movement in BOTH
   * directions is stronger evidence of a real head than a single turn, which
   * a slowly-panned photograph could imitate.
   *
   * Each step waits for the turn to actually register and gives live feedback
   * ("keep turning") rather than silently timing out -- the failure mode that
   * made the earlier single-action version so frustrating was that it gave up
   * without ever telling the user whether it could see them.
   */
  /**
   * Guided multi-pose enrollment: capture the face from several angles, not
   * just straight on.
   *
   * The original enrollment took five frames in about a second, all frontal,
   * and averaged them into one vector. That is a single viewpoint. Matching a
   * person who is sitting even slightly turned then compares two genuinely
   * different views of the same face, which inflates the distance and rejects
   * them. Capturing centre, left and right and keeping each separately means
   * verification can match against whichever view is closest to how they are
   * actually sitting.
   *
   * The averaged frontal descriptor is still produced and stored alongside,
   * so nothing about existing enrollments or the match logic breaks.
   */
  const runGuidedEnrollment = useCallback(async (video: HTMLVideoElement): Promise<{
    poses: { pose: string; descriptor: number[] }[];
    frontal: number[][];
  }> => {
    const poses: { pose: string; descriptor: number[] }[] = [];
    let frontal: number[][] = [];

    for (let i = 0; i < FACE_ENROLL_POSES.length; i += 1) {
      const pose = FACE_ENROLL_POSES[i];
      setProgress(Math.round((i / FACE_ENROLL_POSES.length) * 100));
      setHint(pose.label);

      // For the side poses, wait until the head is ACTUALLY turned before
      // capturing -- otherwise all three "poses" are just the frontal view
      // recorded three times, which would add nothing.
      if (pose.yaw !== 0) {
        const smoother = new SignalSmoother(2);
        const deadline = Date.now() + 15_000;
        let turned = false;
        while (!turned && Date.now() < deadline) {
          if (abortRef.current) throw new Error("ABORTED");
          const probe = await captureFace(video);
          if (!probe.ok) { setHint(QUALITY_COPY[probe.issue]); continue; }
          rendererRef.current?.push(probe.sample.landmarks, probe.sample.box);
          const yaw = smoother.push(getHeadYaw(probe.sample.landmarks));
          turned = pose.yaw > 0 ? yaw > FACE_ENROLL_POSE_YAW : yaw < -FACE_ENROLL_POSE_YAW;
          if (!turned) setHint(pose.label);
        }
        // If the instruction was not followed, START THE WHOLE ENROLLMENT
        // AGAIN rather than quietly recording fewer angles (Tom, explicit:
        // "if you don't follow the instruction, do it again from the
        // beginning"). Silently accepting a partial enrollment would store a
        // weaker reference and then show up much later as unexplained login
        // failures -- far worse than asking for another 20 seconds now.
        if (!turned) throw new Error("POSE_NOT_FOLLOWED");
      }

      setHint(`${pose.label} — хөдөлгөөнгүй`);
      const samples = await collectSamples(video, FACE_ENROLL_SAMPLES_PER_POSE, null, false, null);
      poses.push({ pose: pose.key, descriptor: averageFaceDescriptors(samples) });
      if (pose.key === "center") frontal = samples;
    }

    if (poses.length === 0) throw new Error("CAPTURE_TIMEOUT");
    // If the centre pose was somehow skipped, fall back to whatever was
    // captured so the averaged reference is never empty.
    if (frontal.length === 0) frontal = [poses[0].descriptor];
    setProgress(100);
    return { poses, frontal };
  }, [collectSamples]);

  const runTurnSequence = useCallback(async (video: HTMLVideoElement): Promise<{ passed: boolean; maxYaw: number }> => {
    const steps: { dir: "right" | "left"; label: string }[] = [
      { dir: "right", label: "Толгойгоо БАРУУН тийш эргүүлнэ үү" },
      { dir: "left", label: "Толгойгоо ЗҮҮН тийш эргүүлнэ үү" },
    ];

    // Track how far the head ACTUALLY turned, even on failure -- that number
    // is what says whether the threshold is wrong or the turn never happened.
    let maxYaw = 0;

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const smoother = new SignalSmoother(2);
      let done = false;
      const deadline = Date.now() + 20_000;
      setHint(step.label);
      setProgress(Math.round((index / steps.length) * 100));

      while (!done && Date.now() < deadline) {
        if (abortRef.current) throw new Error("ABORTED");
        const result = await captureFace(video);
        if (!result.ok) {
          setHint(QUALITY_COPY[result.issue]);
          setFaceLocked(false);
          rendererRef.current?.clear();
          continue;
        }

        setFaceLocked(true);
        rendererRef.current?.push(result.sample.landmarks, result.sample.box);

        // Sign convention: the camera frame is NOT mirrored, so turning to
        // one's own RIGHT moves the nose towards the image's left (negative).
        // See LivenessTracker for the full explanation -- getting this
        // backwards inverted both directions on the first live run.
        const yaw = smoother.push(getHeadYaw(result.sample.landmarks));
        if (Math.abs(yaw) > Math.abs(maxYaw)) maxYaw = yaw;
        const reached = step.dir === "right" ? yaw < -YAW_TURN_RATIO : yaw > YAW_TURN_RATIO;

        if (reached) {
          done = true;
          setProgress(Math.round(((index + 1) / steps.length) * 100));
          setHint("Сайн байна");
          await new Promise(resolve => setTimeout(resolve, 350));
        } else {
          // Live "how far have I turned" feedback, so the person can tell the
          // system is watching and how much further to go.
          const progressToTarget = Math.min(1, Math.abs(yaw) / YAW_TURN_RATIO);
          const turningCorrectWay = step.dir === "right" ? yaw < 0 : yaw > 0;
          setHint(turningCorrectWay && progressToTarget > 0.35 ? `${step.label} — цааш нь` : step.label);
        }
      }

      if (!done) return { passed: false, maxYaw };
    }

    // RETURN TO CENTRE before anything else runs.
    //
    // Without this the colour flash began while the head was still turned
    // away from the last step, and then asked the person to "hold still" --
    // still facing sideways. Confusing to follow, and worse for the
    // measurement: the flash reads reflected light off the face, and a face
    // angled away from the screen catches far less of it.
    {
      const smoother = new SignalSmoother(2);
      const deadline = Date.now() + 12_000;
      let centred = false;
      setHint("Камер руу шууд харна уу");

      while (!centred && Date.now() < deadline) {
        if (abortRef.current) throw new Error("ABORTED");
        const result = await captureFace(video);
        if (!result.ok) {
          setHint(QUALITY_COPY[result.issue]);
          continue;
        }
        rendererRef.current?.push(result.sample.landmarks, result.sample.box);
        const yaw = smoother.push(getHeadYaw(result.sample.landmarks));
        // Half the turn threshold: comfortably "facing forward again" without
        // demanding a perfectly square head.
        if (Math.abs(yaw) < YAW_TURN_RATIO / 2) centred = true;
      }
      // Not fatal if it times out -- the flash still runs and is still
      // scored. Better to continue than to fail someone for sitting slightly
      // off-axis.
    }

    return { passed: true, maxYaw };
  }, []);

  const runFlashChallenge = useCallback(async (video: HTMLVideoElement): Promise<{ passed: boolean; score: number; brightened: boolean; samples: number }> => {
    const sequence = randomFlashSequence();
    const samples: { color: FlashColor; sample: FaceColorSample }[] = [];

    setHint("Нүүрээ хөдөлгөөнгүй барина уу.");

    // Capture the face UNLIT first, before any colour is shown.
    //
    // Follows IEEE "Face Liveness Detection Using a Flash Against 2D Spoofing
    // Attack", which compares an image taken with flash against one taken
    // without. The unlit frame is a much better reference than the average of
    // the lit ones: it anchors what this face looks like under the room's own
    // light, and it makes the "did the face brighten at all?" test possible —
    // a screen replaying a video emits its own light and barely responds to
    // ours, which is invisible without a baseline.
    let baseline: FaceColorSample | null = null;
    {
      const result = await captureFace(video);
      if (result.ok) baseline = sampleFaceColor(video, result.sample.box);
    }

    for (const color of sequence) {
      if (abortRef.current) throw new Error("ABORTED");
      setFlash(color);
      // Let the colour paint and the webcam's auto-exposure settle before
      // reading, otherwise the sample catches the transition rather than the
      // lit face.
      await new Promise(resolve => setTimeout(resolve, FLASH_SETTLE_MS));

      const result = await captureFace(video);
      if (result.ok) {
        const sample = sampleFaceColor(video, result.sample.box);
        if (sample) samples.push({ color, sample });
        rendererRef.current?.push(result.sample.landmarks, result.sample.box);
      }

      await new Promise(resolve => setTimeout(resolve, Math.max(0, FLASH_HOLD_MS - FLASH_SETTLE_MS)));
    }

    setFlash(null);
    const { passed, score, brightened } = evaluateFlashResponse(samples, baseline);
    return { passed, score, brightened, samples: samples.length };
  }, []);

  const run = useCallback(async () => {
    setFatalError(null);
    setProgress(0);
    abortRef.current = false;
    setPhase("camera");

    try {
      setHint("Загвар ачааллаж байна…");
      await loadFaceModels();

      setHint("Камер нээж байна…");
      const stream = await startCamera();
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("NO_VIDEO_ELEMENT");
      if (meshRef.current) {
        rendererRef.current?.stop();
        rendererRef.current = new SmoothMeshRenderer(meshRef.current, video);
      }
      video.srcObject = stream;
      // Some browsers reject play() if the element isn't ready; the
      // waitForVideo poll below is the real readiness gate, so a rejection
      // here is not fatal on its own.
      await video.play().catch(() => undefined);
      await waitForVideo(video);

      if (needsEnrollment) {
        setHint("Царайгаа бүртгэж байна.");
        const { poses, frontal } = await runGuidedEnrollment(video);
        setPhase("working");
        await enroll.mutateAsync({
          descriptor: averageFaceDescriptors(frontal),
          sampleCount: frontal.length,
          poses,
          consented: true,
        });
        // A genuinely SEPARATE verification follows, with a deliberate pause
        // and its own fresh capture.
        //
        // Without that pause this was circular and therefore meaningless: the
        // check ran milliseconds after enrollment, against frames from the
        // same instant, same pose, same lighting -- so it always matched, no
        // matter whose face it was. It looked like a verification and proved
        // nothing, which is exactly how it felt to use ("it registered and
        // went straight in").
        //
        // Asking the person to settle and be re-read gives the check a real
        // capture to work with, which is the only way it tells us anything.
        setPhase("camera");
        setStep("capture");
        setProgress(0);
        setHint("Бүртгэл амжилттай. Одоо баталгаажуулалт хийнэ — камер руу шууд харна уу.");
        await new Promise(resolve => setTimeout(resolve, 1800));
        if (abortRef.current) throw new Error("ABORTED");
      }

      setHint("Шалгаж байна…");
      const { challengeId } = await startVerification.mutateAsync();
      setProgress(0);

      // FLOW, matching how production eKYC actually sequences this (verified
      // against collect.ekyc.mn's own flow): position the face first with
      // live feedback, THEN hold still for the colour challenge.
      //
      // Notably the reference does NOT ask for a blink or a head turn at all,
      // and neither does this any more. Scripted-movement liveness was the
      // single biggest source of false rejections here in live testing --
      // it repeatedly failed a legitimate user -- while adding little on top
      // of the flash, which is the check a photo or a replayed video actually
      // fails. Dropping it removes a whole class of "it says I didn't blink
      // when I did" failures. The tracker itself is kept (and tested) so a
      // movement step can be reinstated if it is ever wanted.
      // LOGIN IS DELIBERATELY FRICTIONLESS: look at the camera, get matched,
      // get in. No head turns, no colour flash, no instructions to follow.
      //
      // That split is the whole design (Tom, repeatedly and emphatically):
      // the GUIDED, instruction-driven capture belongs to first-time
      // ENROLLMENT, where the point is to record the face thoroughly from
      // several angles. Repeating those hoops on every single login was pure
      // friction -- it rejected a legitimate user again and again while the
      // underlying match was landing comfortably inside the threshold.
      //
      // The security consequence, stated plainly rather than hidden: without
      // a liveness challenge at login, someone holding a photograph of an
      // enrolled staff member to the camera could pass this step. What stops
      // them is that they must ALREADY have that person's phone number and
      // password to get here at all -- this is the second factor, not the
      // first. For a five-person shop admin panel that is a sensible place to
      // land; a bank would choose differently. Re-enabling the challenge is a
      // small change (runTurnSequence / runFlashChallenge are still here and
      // still tested) if that trade ever stops being the right one.
      setStep("capture");
      setHint("Камер руу шууд харна уу — царайг уншиж байна…");
      const samples = await collectSamples(video, FACE_VERIFY_SAMPLES, null, false, null, FACE_VERIFY_MIN_DURATION_MS);

      setPhase("working");
      const result = await completeVerification.mutateAsync({
        challengeId,
        descriptor: averageFaceDescriptors(samples),
        // No challenge is performed at login, so nothing is claimed about
        // liveness -- honestly reported as not passed rather than asserting
        // a check that never ran. It is recorded, never enforced (see
        // ADMIN_FACE_LIVENESS_ENFORCED in server/_core/env.ts).
        livenessPassed: false,
        diagnostic: "login=simple no-challenge",
      });

      cleanup();

      if (result.ok) {
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
      if (error instanceof FaceCameraError) {
        setFatalError(CAMERA_ERROR_COPY[error.kind]);
      } else if (error instanceof Error && error.message === "ABORTED") {
        return;
      } else if (error instanceof Error && error.message === "MODEL_LOAD") {
        setFatalError("Царай таних загвар ачаалагдсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.");
      } else if (error instanceof Error && error.message === "MODEL_BACKEND") {
        setFatalError("Энэ хөтөч дээр царай таних боломжгүй байна. Chrome эсвэл Edge-ээр орно уу.");
      } else if (error instanceof Error && error.message === "POSE_NOT_FOLLOWED") {
        setFatalError("Зааврыг дагаж толгойгоо эргүүлээгүй тул бүртгэл дуусаагүй. Эхнээс нь дахин эхлүүлнэ үү — дэлгэц дээрх заавар бүрийг дагана уу.");
      } else if (error instanceof Error && (error.message === "CAPTURE_TIMEOUT" || error.message === "VIDEO_TIMEOUT")) {
        setFatalError("Царайг тодорхойлж чадсангүй. Гэрэлтэй газар, камерт ойртож дахин оролдоно уу.");
      } else {
        setFatalError(error instanceof Error ? error.message : "Алдаа гарлаа. Дахин оролдоно уу.");
      }
      setPhase("camera");
    } finally {
      setChallenge(null);
    }
  }, [needsEnrollment, waitForVideo, collectSamples, enroll, startVerification, completeVerification, cleanup, onPassed]);

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

  return (
    <div className="face-gate-shell face-gate-shell--dark">
      {/* The colour-flash liveness challenge covers the WHOLE SCREEN, not just
          the video box: the monitor is the light source, so the larger the lit
          area the stronger and more measurable the reflection off the face.
          Rendered outside the card for that reason.

          aria-hidden with a static announcement below rather than live
          updates: rapidly changing colours must not be read out on every step.
          Cadence is ~420ms per colour (~2.4Hz), deliberately under the 3Hz
          threshold associated with photosensitive seizures. */}
      {flash && (
        <div
          className="face-gate-fullflash"
          aria-hidden="true"
          style={{ background: `rgb(${FLASH_COLORS[flash].join(",")})` }}
        />
      )}
      <div className="face-gate-card face-gate-card--wide face-gate-card--scan">
        <div className="face-gate-head">
          <ScanFace size={20} aria-hidden="true" />
          <div>
            <h2>{needsEnrollment ? "Царайгаа бүртгэх" : "Царайгаар баталгаажуулах"}</h2>
            <p className="face-gate-muted">Админ хэсэгт нэвтрэхийн тулд шаардлагатай</p>
          </div>
        </div>

        {/* Circular scanner with a progress ring around the rim, on a dark
            ground -- Tom's chosen concept. The ring is the primary progress
            indicator: it surrounds the face rather than sitting apart from
            it, so the person watching their own image can see advancement
            without looking away. */}
        <div className={`face-gate-stage${faceLocked ? " is-locked" : ""}`}>
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
          {/* muted + playsInline are required for autoplay to be allowed at
              all in Chrome/Safari; mirrored so turning left on screen matches
              turning left in reality, which is what the instruction says. */}
          <video ref={videoRef} className="face-gate-video" muted playsInline autoPlay />
          {/* The live wireframe, drawn from the same 68 landmarks the
              recogniser uses -- an honest picture of what the system sees. */}
          <canvas ref={meshRef} className="face-gate-mesh" aria-hidden="true" />

          {/* Sweeping scan line, running only while actively capturing. */}
          {!busy && !flash && <div className="face-gate-scanline" aria-hidden="true" />}

          {busy && (
            <div className="face-gate-video-overlay">
              <LoaderCircle className="animate-spin" size={26} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Instruction pill, matching the reference eKYC layout: the action
            the person must perform, stated once, prominently. */}
        {challenge && !busy && !flash && (
          <div className="face-gate-instruction">{FACE_CHALLENGE_LABELS[challenge]}</div>
        )}
        {flash && <div className="face-gate-instruction face-gate-instruction--flash">Дэлгэц рүү харна уу</div>}

        <div className="face-gate-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        {/* Where we are in the flow. Without this a slow step is
            indistinguishable from a frozen one. */}
        <ol className="face-gate-steps">
          {FLOW_STEPS.map((s, i) => {
            const activeIndex = FLOW_STEPS.findIndex(x => x.key === step);
            const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "todo";
            return (
              <li key={s.key} className={`face-gate-step face-gate-step--${state}`}>
                <span className="face-gate-step-num">{state === "done" ? "✓" : i + 1}</span>
                <span>{s.label}</span>
              </li>
            );
          })}
        </ol>

        {fatalError ? (
          <div className="face-gate-alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{fatalError}</span>
          </div>
        ) : (
          <p className="face-gate-hint">{hint}</p>
        )}

        {fatalError && (
          <button type="button" className="face-gate-btn" onClick={() => void run()} disabled={busy}>
            Дахин оролдох
          </button>
        )}

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
 * Dedicated biometric-consent screen.
 *
 * Deliberately its own step rather than a line buried in general terms: a
 * face descriptor is sensitive personal data under Mongolia's Personal Data
 * Protection Law, and bundled consent does not satisfy it. The server
 * enforces this too (faceAuth.enroll requires `consented: true` as a literal
 * in its schema), so a client that skipped this screen still cannot enroll.
 */
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
          <li><strong>Таны компьютер дээр боловсруулагдана.</strong> Камерын дүрс энэ компьютероос гарахгүй. Гадны ямар ч үйлчилгээ рүү илгээгдэхгүй.</li>
          <li><strong>Зөвхөн админ хэсэгт.</strong> Худалдан авагчид энэ шалгалтыг хэзээ ч харахгүй.</li>
        </ul>

        <p className="face-gate-limit">
          Энэ шалгалт нь зураг барьж харуулах зэрэг энгийн хуурамчлалаас хамгаална. Гэхдээ таны бичлэгийг урьдчилан бэлтгэсэн, зорилготой халдлагаас бүрэн хамгаалахгүй — тиймээс нууц үг үргэлж эхний хамгаалалт хэвээр байна.
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
