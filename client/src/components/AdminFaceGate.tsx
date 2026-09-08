import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CameraOff, CheckCircle2, LoaderCircle, ScanFace, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  FACE_CHALLENGE_LABELS,
  FLASH_COLORS,
  evaluateFlashResponse,
  type FaceColorSample,
  type FlashColor,
  FACE_ENROLL_SAMPLES,
  FACE_VERIFY_SAMPLES,
  averageFaceDescriptors,
  type FaceChallengeAction,
} from "@shared/face-auth";
import {
  FaceCameraError,
  LivenessTracker,
  captureFace,
  clearFaceMesh,
  drawFaceMesh,
  getHeadYaw,
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

/** How long each colour stays on screen. Long enough for the webcam's
 *  auto-exposure to settle before the frame is sampled, short enough that the
 *  whole sequence stays under a couple of seconds. */
const FLASH_HOLD_MS = 420;
/** Frames are sampled only after this much of the hold has elapsed, so the
 *  reading is taken once the camera has adjusted rather than mid-transition. */
const FLASH_SETTLE_MS = 240;
/** How many colours are flashed per attempt. Randomised order each time — that
 *  randomness is what a pre-recorded video cannot anticipate. */
const FLASH_SEQUENCE_LENGTH = 4;

function randomFlashSequence(): FlashColor[] {
  const colors = Object.keys(FLASH_COLORS) as FlashColor[];
  // Fisher-Yates, then take the first N. Every attempt gets a different
  // order, which is the entire anti-replay property of this check.
  for (let i = colors.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  return colors.slice(0, FLASH_SEQUENCE_LENGTH);
}

function FaceGateFlow({ needsEnrollment, modelStale, onPassed }: { needsEnrollment: boolean; modelStale: boolean; onPassed: () => void }) {
  const [phase, setPhase] = useState<Phase>(needsEnrollment ? "consent" : "camera");
  const [hint, setHint] = useState<string>("Бэлтгэж байна…");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<FaceChallengeAction | null>(null);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meshRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** The colour currently painted over the preview during the flash
   *  challenge, or null when not flashing. */
  const [flash, setFlash] = useState<FlashColor | null>(null);
  const [faceLocked, setFaceLocked] = useState(false);
  // Guards against the capture loop continuing after unmount — without it,
  // an async frame that resolves post-unmount calls setState on a dead
  // component and, worse, keeps the camera light on.
  const abortRef = useRef(false);

  const enroll = trpc.faceAuth.enroll.useMutation();
  const startVerification = trpc.faceAuth.startVerification.useMutation();
  const completeVerification = trpc.faceAuth.completeVerification.useMutation();

  const cleanup = useCallback(() => {
    abortRef.current = true;
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
  ): Promise<number[][]> => {
    const samples: number[][] = [];
    const deadline = Date.now() + 45_000;

    // The loop must satisfy BOTH conditions, not just the sample count.
    //
    // This was a real bug caught on the first live run: with only
    // `samples.length < count`, five good frames are collected in well under
    // a second while the person is still sitting still reading the
    // instruction, so the loop exited and reported "you didn't blink" before
    // they had a chance to. Liveness now keeps the loop alive until the
    // action is actually observed (or the deadline hits).
    const done = () => samples.length >= count && (!tracker || tracker.passed);

    while (!done() && Date.now() < deadline) {
      if (abortRef.current) throw new Error("ABORTED");
      const result = await captureFace(video);

      if (!result.ok) {
        setHint(QUALITY_COPY[result.issue]);
        setFaceLocked(false);
        if (meshRef.current) clearFaceMesh(meshRef.current);
        // No artificial delay here: detection itself already costs tens of
        // milliseconds, and a blink lasting 100-300ms is easy to miss if we
        // also sleep between frames -- the second half of the same bug.
        continue;
      }

      // Draw the wireframe on every good frame, using the very landmarks the
      // recogniser is working from.
      setFaceLocked(true);
      if (meshRef.current) drawFaceMesh(meshRef.current, video, result.sample.landmarks, result.sample.box);

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
  const runFlashChallenge = useCallback(async (video: HTMLVideoElement): Promise<boolean> => {
    const sequence = randomFlashSequence();
    const samples: { color: FlashColor; sample: FaceColorSample }[] = [];

    setHint("Дэлгэц рүү шууд харна уу — өнгө анивчина.");

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
        if (meshRef.current) drawFaceMesh(meshRef.current, video, result.sample.landmarks, result.sample.box);
      }

      await new Promise(resolve => setTimeout(resolve, Math.max(0, FLASH_HOLD_MS - FLASH_SETTLE_MS)));
    }

    setFlash(null);
    const { passed } = evaluateFlashResponse(samples);
    return passed;
  }, []);

  const run = useCallback(async () => {
    setFatalError(null);
    setProgress(0);
    abortRef.current = false;
    setPhase("camera");

    let activeChallenge: FaceChallengeAction | null = null;
    try {
      setHint("Загвар ачааллаж байна…");
      await loadFaceModels();

      setHint("Камер нээж байна…");
      const stream = await startCamera();
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("NO_VIDEO_ELEMENT");
      video.srcObject = stream;
      // Some browsers reject play() if the element isn't ready; the
      // waitForVideo poll below is the real readiness gate, so a rejection
      // here is not fatal on its own.
      await video.play().catch(() => undefined);
      await waitForVideo(video);

      if (needsEnrollment) {
        setHint("Царайгаа бүртгэж байна — камер руу харна уу.");
        const samples = await collectSamples(video, FACE_ENROLL_SAMPLES, null, false, null);
        setPhase("working");
        await enroll.mutateAsync({
          descriptor: averageFaceDescriptors(samples),
          sampleCount: samples.length,
          consented: true,
        });
        // Enrollment alone does not open /admin -- a live check runs
        // immediately after, otherwise enrolling would bypass the gate it
        // feeds. Fall through to verification below.
        setPhase("camera");
      }

      setHint("Шалгаж байна…");
      const { challengeId, action } = await startVerification.mutateAsync();
      activeChallenge = action;
      setChallenge(action);
      setProgress(0);
      setHint(FACE_CHALLENGE_LABELS[action]);

      const tracker = new LivenessTracker(action);
      const samples = await collectSamples(video, FACE_VERIFY_SAMPLES, tracker, true, action);

      // Two independent liveness signals, both required. The movement proves
      // a live person is following an instruction; the colour flash proves
      // the thing in front of the camera is a real 3D surface reflecting
      // light rather than a photo or a replayed video.
      const flashPassed = await runFlashChallenge(video);

      setPhase("working");
      const result = await completeVerification.mutateAsync({
        challengeId,
        descriptor: averageFaceDescriptors(samples),
        livenessPassed: tracker.passed && flashPassed,
      });

      cleanup();

      if (result.ok) {
        setPhase("done");
        onPassed();
        return;
      }

      switch (result.reason) {
        case "no_match":
          setFatalError("Царай таарсангүй. Гэрэлтэй газар, камер руу шууд харж дахин оролдоно уу. Асуудал давтагдвал админд хандаж бүртгэлээ шинэчлүүлнэ үү.");
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
      } else if (error instanceof Error && (error.message === "CAPTURE_TIMEOUT" || error.message === "VIDEO_TIMEOUT")) {
        setFatalError("Царайг тодорхойлж чадсангүй. Гэрэлтэй газар, камерт ойртож дахин оролдоно уу.");
      } else {
        setFatalError(error instanceof Error ? error.message : "Алдаа гарлаа. Дахин оролдоно уу.");
      }
      setPhase("camera");
    } finally {
      if (activeChallenge) setChallenge(null);
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
    <div className="face-gate-shell">
      <div className="face-gate-card face-gate-card--wide">
        <div className="face-gate-head">
          <ScanFace size={20} aria-hidden="true" />
          <div>
            <h2>{needsEnrollment ? "Царайгаа бүртгэх" : "Царайгаар баталгаажуулах"}</h2>
            <p className="face-gate-muted">Админ хэсэгт нэвтрэхийн тулд шаардлагатай</p>
          </div>
        </div>

        <div className={`face-gate-stage${faceLocked ? " is-locked" : ""}`}>
          {/* muted + playsInline are required for autoplay to be allowed at
              all in Chrome/Safari; mirrored so turning left on screen matches
              turning left in reality, which is what the instruction says. */}
          <video ref={videoRef} className="face-gate-video" muted playsInline autoPlay />
          {/* The live wireframe, drawn from the same 68 landmarks the
              recogniser uses -- an honest picture of what the system sees. */}
          <canvas ref={meshRef} className="face-gate-mesh" aria-hidden="true" />

          {/* Sweeping scan line, running only while actively capturing. */}
          {!busy && !flash && <div className="face-gate-scanline" aria-hidden="true" />}

          {/* The colour-flash liveness challenge. aria-hidden + a static
              announcement elsewhere: rapidly changing colours must not be
              announced to a screen reader on every step. */}
          {flash && (
            <div
              className="face-gate-flash"
              aria-hidden="true"
              style={{ background: `rgb(${FLASH_COLORS[flash].join(",")})` }}
            />
          )}

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
function ConsentScreen({ modelStale, onAccept }: { modelStale: boolean; onAccept: () => void }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="face-gate-shell">
      <div className="face-gate-card face-gate-card--wide">
        <div className="face-gate-head">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <h2>Царайгаар баталгаажуулах</h2>
            <p className="face-gate-muted">Админ хэсэгт нэвтрэх нэмэлт хамгаалалт</p>
          </div>
        </div>

        {modelStale && (
          <div className="face-gate-alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Царай таних загвар шинэчлэгдсэн тул дахин бүртгүүлэх шаардлагатай.</span>
          </div>
        )}

        {/* Every claim below is literally true of the implementation. If the
            architecture ever changes, this copy must change with it. */}
        <ul className="face-gate-facts">
          <li><strong>Зураг хадгалагдахгүй.</strong> Таны царайны зураг сервер рүү илгээгдэхгүй, хаана ч хадгалагдахгүй.</li>
          <li><strong>Зөвхөн 128 тоо.</strong> Царайг тань таних математик утга (128 тоо) л хадгалагдана. Үүнээс таны зургийг сэргээх боломжгүй.</li>
          <li><strong>Таны компьютер дээр боловсруулагдана.</strong> Камерын дүрс энэ компьютероос гарахгүй. Гадны ямар ч үйлчилгээ рүү илгээгдэхгүй.</li>
          <li><strong>Зөвхөн админ хэсэгт.</strong> Худалдан авагчид энэ шалгалтыг хэзээ ч харахгүй.</li>
          <li><strong>Нууц үгээ орлохгүй.</strong> Энэ нь нууц үгийн дараах нэмэлт шалгалт бөгөөд түүнийг орлохгүй.</li>
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
