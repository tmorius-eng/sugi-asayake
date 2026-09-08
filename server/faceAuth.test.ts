import { describe, expect, it } from "vitest";
import {
  FACE_DESCRIPTOR_LENGTH,
  FACE_MATCH_THRESHOLD,
  averageFaceDescriptors,
  bestFaceDistance,
  evaluateFlashResponse,
  faceDescriptorDistance,
  isAdminPanelRole,
  isValidFaceDescriptor,
  LivenessTracker,
  type FaceColorSample,
  type FlashColor,
} from "../shared/face-auth";

/**
 * Admin face gate (2026-09-08) — pure unit tests for the math and the input
 * guards that decide whether someone gets into /admin.
 *
 * Deliberately ungated (no RUN_*_INTEGRATION_TESTS): none of this touches a
 * database, a camera or a network, so it should run everywhere including CI,
 * the same reasoning server/integrations.integration.test.ts's own "unit"
 * block already applies.
 */

/** A descriptor-shaped vector whose values are deterministic, so a test
 *  failure is reproducible rather than randomly flaky. */
function makeDescriptor(seed: number): number[] {
  return Array.from({ length: FACE_DESCRIPTOR_LENGTH }, (_, i) => Math.sin((i + 1) * seed) * 0.5);
}

describe("faceDescriptorDistance", () => {
  it("reports zero distance for identical descriptors", () => {
    const a = makeDescriptor(1.1);
    expect(faceDescriptorDistance(a, a)).toBe(0);
  });

  it("is symmetric", () => {
    const a = makeDescriptor(1.1);
    const b = makeDescriptor(2.3);
    expect(faceDescriptorDistance(a, b)).toBeCloseTo(faceDescriptorDistance(b, a), 12);
  });

  it("grows as vectors diverge", () => {
    const base = makeDescriptor(1.1);
    const near = base.map((v, i) => v + (i === 0 ? 0.01 : 0));
    const far = base.map(v => v + 0.4);
    expect(faceDescriptorDistance(base, near)).toBeLessThan(faceDescriptorDistance(base, far));
  });

  it("refuses to compare mismatched lengths rather than silently padding", () => {
    // A silent comparison here would be the dangerous failure: two
    // incompatible vectors could land under the threshold by accident and
    // admit the wrong person.
    expect(() => faceDescriptorDistance([1, 2, 3], [1, 2])).toThrow();
  });

  it("treats a small perturbation as the same person and a large one as different", () => {
    // Guards the actual security decision: the threshold has to sit between
    // "same face, slightly different frame" and "different face".
    const base = makeDescriptor(1.7);
    const sameFaceNoise = base.map(v => v + 0.02);
    const differentFace = makeDescriptor(9.4);
    expect(faceDescriptorDistance(base, sameFaceNoise)).toBeLessThan(FACE_MATCH_THRESHOLD);
    expect(faceDescriptorDistance(base, differentFace)).toBeGreaterThan(FACE_MATCH_THRESHOLD);
  });
});

describe("averageFaceDescriptors", () => {
  it("returns the input unchanged for a single sample", () => {
    const a = makeDescriptor(1.3);
    expect(averageFaceDescriptors([a])).toEqual(a);
  });

  it("averages component-wise", () => {
    const a = new Array(FACE_DESCRIPTOR_LENGTH).fill(0);
    const b = new Array(FACE_DESCRIPTOR_LENGTH).fill(1);
    expect(averageFaceDescriptors([a, b])[0]).toBeCloseTo(0.5, 12);
  });

  it("lands closer to the true face than a single noisy sample does", () => {
    // This is the whole reason enrollment averages several frames: one bad
    // capture would otherwise become the permanent reference and cause
    // false rejections forever after.
    const truth = makeDescriptor(1.9);
    const noisy = [0.08, -0.07, 0.06, -0.05, 0.04].map(offset => truth.map(v => v + offset));
    const averaged = averageFaceDescriptors(noisy);
    const worstSingle = Math.max(...noisy.map(sample => faceDescriptorDistance(sample, truth)));
    expect(faceDescriptorDistance(averaged, truth)).toBeLessThan(worstSingle);
  });

  it("rejects an empty sample set instead of producing NaNs", () => {
    expect(() => averageFaceDescriptors([])).toThrow();
  });

  it("rejects mismatched lengths", () => {
    expect(() => averageFaceDescriptors([[1, 2], [1, 2, 3]])).toThrow();
  });
});

describe("isValidFaceDescriptor", () => {
  it("accepts a well-formed descriptor", () => {
    expect(isValidFaceDescriptor(makeDescriptor(1.1))).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidFaceDescriptor(new Array(64).fill(0))).toBe(false);
    expect(isValidFaceDescriptor(new Array(129).fill(0))).toBe(false);
  });

  it("rejects non-arrays and non-numbers", () => {
    expect(isValidFaceDescriptor(null)).toBe(false);
    expect(isValidFaceDescriptor("descriptor")).toBe(false);
    const withString: unknown[] = makeDescriptor(1.1);
    withString[5] = "0.1";
    expect(isValidFaceDescriptor(withString)).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    // NaN is the important one: every comparison against NaN is false, so a
    // NaN-laden descriptor would make `distance > threshold` false and slip
    // straight past the match check into /admin.
    const withNaN = makeDescriptor(1.1);
    withNaN[0] = NaN;
    expect(isValidFaceDescriptor(withNaN)).toBe(false);

    const withInfinity = makeDescriptor(1.1);
    withInfinity[0] = Infinity;
    expect(isValidFaceDescriptor(withInfinity)).toBe(false);
  });

  it("rejects implausibly large magnitudes", () => {
    const huge = makeDescriptor(1.1);
    huge[0] = 1e9;
    expect(isValidFaceDescriptor(huge)).toBe(false);
  });
});

describe("bestFaceDistance (multi-pose matching)", () => {
  it("returns the distance to the CLOSEST enrolled view", () => {
    // The point of enrolling several angles: a person sitting turned should
    // be matched against the angled view captured for exactly that, not
    // forced through a frontal-only reference.
    const frontal = makeDescriptor(1.7);
    const turned = makeDescriptor(2.9);
    const nowSittingTurned = turned.map(v => v + 0.02);

    const frontalOnly = faceDescriptorDistance(nowSittingTurned, frontal);
    const withPoses = bestFaceDistance(nowSittingTurned, [frontal, turned]);

    expect(withPoses).not.toBeNull();
    expect(withPoses!).toBeLessThan(frontalOnly);
    expect(withPoses!).toBeLessThan(FACE_MATCH_THRESHOLD);
  });

  it("does not let extra poses admit a different person", () => {
    // Adding reference views must widen tolerance for the SAME face, never
    // create a back door for a different one.
    const stranger = makeDescriptor(9.4);
    const best = bestFaceDistance(stranger, [makeDescriptor(1.7), makeDescriptor(2.9), makeDescriptor(3.3)]);
    expect(best).not.toBeNull();
    expect(best!).toBeGreaterThan(FACE_MATCH_THRESHOLD);
  });

  it("ignores references of the wrong length rather than throwing", () => {
    const candidate = makeDescriptor(1.7);
    const best = bestFaceDistance(candidate, [[1, 2, 3], candidate]);
    expect(best).toBe(0);
  });

  it("returns null when there is nothing usable to compare against", () => {
    expect(bestFaceDistance(makeDescriptor(1.7), [])).toBeNull();
    expect(bestFaceDistance(makeDescriptor(1.7), [[1, 2, 3]])).toBeNull();
  });
});

describe("evaluateFlashResponse (colour-flash liveness)", () => {
  /** A face lit by `color`: the matching channel is genuinely raised, the way
   *  real skin reflects a coloured screen. `base` is the unlit skin tone. */
  function litFace(color: FlashColor, base: FaceColorSample = { r: 150, g: 120, b: 110 }): FaceColorSample {
    const boost = 55;
    switch (color) {
      case "red": return { r: base.r + boost, g: base.g, b: base.b };
      case "green": return { r: base.r, g: base.g + boost, b: base.b };
      case "blue": return { r: base.r, g: base.g, b: base.b + boost };
      case "yellow": return { r: base.r + boost, g: base.g + boost, b: base.b };
    }
  }

  const ALL: FlashColor[] = ["red", "green", "blue", "yellow"];
  /** Unlit skin, as captured before the sequence starts. */
  const UNLIT: FaceColorSample = { r: 150, g: 120, b: 110 };

  it("passes a real face that reflects each colour", () => {
    const samples = ALL.map(color => ({ color, sample: litFace(color) }));
    const result = evaluateFlashResponse(samples);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it("rejects a flat photo, which reflects nothing", () => {
    // The core attack this check exists to stop: a printed photo held to the
    // lens returns the same colour no matter what is flashed at it.
    const flat: FaceColorSample = { r: 150, g: 120, b: 110 };
    const samples = ALL.map(color => ({ color, sample: { ...flat } }));
    expect(evaluateFlashResponse(samples).passed).toBe(false);
  });

  it("uses an unlit baseline when one is supplied (IEEE flash-comparison method)", () => {
    // Comparing lit frames against a genuinely unlit reference is stronger
    // than comparing them only against each other, and it is what the IEEE
    // "flash vs no-flash" method does.
    const samples = ALL.map(color => ({ color, sample: litFace(color) }));
    expect(evaluateFlashResponse(samples, UNLIT).passed).toBe(true);
  });

  it("rejects a screen replay that never brightens under our light", () => {
    // A monitor emits its own light, so lighting the room barely changes what
    // the camera sees. Only detectable with a baseline to compare against --
    // this test is the reason the baseline was added.
    const dim = ALL.map(color => ({
      color,
      sample: { r: UNLIT.r * 0.99, g: UNLIT.g * 0.99, b: UNLIT.b * 0.99 },
    }));
    const result = evaluateFlashResponse(dim, UNLIT);
    expect(result.brightened).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("rejects a surface that only gets BRIGHTER without shifting hue", () => {
    // A white card, or a screen at max brightness, raises every channel
    // together. Normalising to channel shares is what defeats this — without
    // that step, brightness alone would pass.
    const samples = ALL.map((color, i) => ({
      color,
      sample: { r: 150 + i * 30, g: 120 + i * 30, b: 110 + i * 30 },
    }));
    expect(evaluateFlashResponse(samples).passed).toBe(false);
  });

  it("rejects a replay showing the WRONG colour order", () => {
    // A recorded video of a genuine earlier session cannot know the sequence
    // chosen at random for THIS attempt, so its responses land against the
    // wrong colours. This is the property motion-only liveness lacks.
    const shuffled: FlashColor[] = ["green", "blue", "yellow", "red"];
    const samples = ALL.map((color, i) => ({ color, sample: litFace(shuffled[i]) }));
    expect(evaluateFlashResponse(samples).passed).toBe(false);
  });

  it("still passes when one frame lands mid-transition", () => {
    // Real cameras take a moment to adjust; demanding a perfect score would
    // reject legitimate staff over one unlucky frame.
    const samples = [
      { color: "red" as FlashColor, sample: litFace("red") },
      { color: "green" as FlashColor, sample: litFace("green") },
      { color: "blue" as FlashColor, sample: litFace("blue") },
      { color: "yellow" as FlashColor, sample: { r: 150, g: 120, b: 110 } },
    ];
    expect(evaluateFlashResponse(samples).passed).toBe(true);
  });

  it("refuses to judge too few samples rather than guessing", () => {
    expect(evaluateFlashResponse([]).passed).toBe(false);
    expect(evaluateFlashResponse([{ color: "red", sample: litFace("red") }]).passed).toBe(false);
  });

  it("works the same for a much darker skin tone", () => {
    // The relative/self-normalising comparison exists precisely so this holds
    // — face models have a documented history of performing worse on darker
    // skin, and an absolute threshold here would bake that bias in.
    const darker: FaceColorSample = { r: 70, g: 55, b: 50 };
    const samples = ALL.map(color => ({ color, sample: litFace(color, darker) }));
    expect(evaluateFlashResponse(samples).passed).toBe(true);
  });
});

describe("LivenessTracker (motion challenges)", () => {
  /**
   * Builds a 68-point landmark set. Only the points the geometry actually
   * reads are positioned meaningfully:
   *   36-41 / 42-47  eyes      (eyeOpen scales the vertical aperture)
   *   48-67          mouth     (mouthOpen scales the inner-lip gap)
   *   0-16           jaw       (noseShift slides the nose between the edges)
   *   27-35          nose
   */
  function face({ eyeOpen = 1, mouthOpen = 0, noseShift = 0 } = {}): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));

    // Jaw: a straight span from x=100 to x=300.
    for (let i = 0; i <= 16; i += 1) points[i] = { x: 100 + i * 12.5, y: 200 };

    // Eyes: a hexagon whose height is scaled by eyeOpen. The aperture at
    // eyeOpen=1 is a normal open eye; 0.3 is a blink.
    const eye = (start: number, cx: number) => {
      const h = 6 * eyeOpen;
      points[start] = { x: cx - 15, y: 100 };
      points[start + 1] = { x: cx - 7, y: 100 - h };
      points[start + 2] = { x: cx + 7, y: 100 - h };
      points[start + 3] = { x: cx + 15, y: 100 };
      points[start + 4] = { x: cx + 7, y: 100 + h };
      points[start + 5] = { x: cx - 7, y: 100 + h };
    };
    eye(36, 150);
    eye(42, 250);

    // Nose: tip is the LAST point (index 35), which is what getHeadYaw reads.
    for (let i = 27; i <= 35; i += 1) points[i] = { x: 200, y: 130 };
    points[35] = { x: 200 + noseShift, y: 150 };

    // Mouth: corners at 48/54 (indices 0 and 6 of the slice), inner lips at
    // 62/66 (indices 14 and 18) separated by mouthOpen.
    for (let i = 48; i <= 67; i += 1) points[i] = { x: 200, y: 170 };
    points[48] = { x: 170, y: 170 };
    points[54] = { x: 230, y: 170 };
    points[48 + 14] = { x: 200, y: 170 - mouthOpen * 30 };
    points[48 + 18] = { x: 200, y: 170 + mouthOpen * 30 };

    return points;
  }

  /** Feeds enough resting frames for the tracker to learn this face's
   *  baseline before the action happens. */
  function calibrate(tracker: LivenessTracker, resting = face()) {
    for (let i = 0; i < 8; i += 1) tracker.observe(resting);
  }

  it("detects a blink: open, closed, open again", () => {
    const tracker = new LivenessTracker("blink");
    calibrate(tracker);
    expect(tracker.passed).toBe(false);

    // A real blink spans several frames (~100-300ms), so feed it as one --
    // a single-frame event is not something a camera ever actually produces.
    tracker.observe(face({ eyeOpen: 0.25 }));
    tracker.observe(face({ eyeOpen: 0.2 }));
    expect(tracker.halfway).toBe(true);
    expect(tracker.passed).toBe(false); // eyes still shut — not a blink yet

    tracker.observe(face({ eyeOpen: 1 }));
    tracker.observe(face({ eyeOpen: 1 }));
    expect(tracker.passed).toBe(true);
  });

  it("does not accept eyes that are simply held shut", () => {
    // A photo of someone with their eyes closed must not pass.
    const tracker = new LivenessTracker("blink");
    calibrate(tracker, face({ eyeOpen: 0.25 }));
    for (let i = 0; i < 10; i += 1) tracker.observe(face({ eyeOpen: 0.25 }));
    expect(tracker.passed).toBe(false);
  });

  it("detects a blink for someone whose eyes are naturally much narrower", () => {
    // THE bug Tom hit on the first live run: with a fixed eye-aspect-ratio
    // cutoff, a person whose resting aperture sits below that constant can
    // never pass -- the system reads them as permanently closed. Calibrating
    // against their own baseline is what fixes it, and this is the test that
    // keeps it fixed.
    const narrowResting = face({ eyeOpen: 0.45 });
    const tracker = new LivenessTracker("blink");
    calibrate(tracker, narrowResting);

    tracker.observe(face({ eyeOpen: 0.1 }));
    tracker.observe(face({ eyeOpen: 0.1 }));
    tracker.observe(narrowResting);
    tracker.observe(narrowResting);
    expect(tracker.passed).toBe(true);
  });

  it("turns LEFT are read as left, not right", () => {
    // The camera frame is NOT mirrored (only the on-screen preview is), so a
    // person turning to their own left moves the nose towards the image's
    // right: yaw goes positive. Coding it the intuitive way inverted both
    // challenges -- "turn left" only passed when turning right, which is
    // exactly what Tom reported.
    const tracker = new LivenessTracker("turn_left");
    tracker.observe(face());
    tracker.observe(face());
    tracker.observe(face({ noseShift: 40 }));
    tracker.observe(face({ noseShift: 40 }));
    tracker.observe(face());
    tracker.observe(face());
    expect(tracker.passed).toBe(true);
  });

  it("turning the wrong way does not satisfy a left challenge", () => {
    const tracker = new LivenessTracker("turn_left");
    tracker.observe(face());
    tracker.observe(face());
    tracker.observe(face({ noseShift: -40 }));
    tracker.observe(face({ noseShift: -40 }));
    tracker.observe(face());
    tracker.observe(face());
    expect(tracker.passed).toBe(false);
  });

  it("turns RIGHT are read as right", () => {
    const tracker = new LivenessTracker("turn_right");
    tracker.observe(face());
    tracker.observe(face());
    tracker.observe(face({ noseShift: -40 }));
    tracker.observe(face({ noseShift: -40 }));
    tracker.observe(face());
    tracker.observe(face());
    expect(tracker.passed).toBe(true);
  });

  it("requires the head to come back to centre, not just turn away", () => {
    const tracker = new LivenessTracker("turn_left");
    tracker.observe(face());
    tracker.observe(face());
    tracker.observe(face({ noseShift: 40 }));
    tracker.observe(face({ noseShift: 40 }));
    expect(tracker.passed).toBe(false);
  });

  it("detects an open mouth relative to that person's resting mouth", () => {
    const tracker = new LivenessTracker("open_mouth");
    calibrate(tracker);
    tracker.observe(face({ mouthOpen: 1 }));
    tracker.observe(face({ mouthOpen: 1 }));
    expect(tracker.halfway).toBe(true);
    tracker.observe(face({ mouthOpen: 0 }));
    tracker.observe(face({ mouthOpen: 0 }));
    expect(tracker.passed).toBe(true);
  });

  it("reports it is still calibrating before it has a baseline", () => {
    // The UI uses this to say "hold still" instead of issuing an instruction
    // it cannot yet judge — the other half of the "it gave up before I could
    // act" problem.
    const tracker = new LivenessTracker("blink");
    expect(tracker.calibrating).toBe(true);
    calibrate(tracker);
    expect(tracker.calibrating).toBe(false);
  });

  it("needs no calibration for head turns", () => {
    // Yaw is already a ratio of face width, so it is scale-free.
    expect(new LivenessTracker("turn_left").calibrating).toBe(false);
  });
});

describe("isAdminPanelRole", () => {
  it("covers exactly the five panel roles", () => {
    for (const role of ["staff", "finance", "marketing", "warehouse", "admin"]) {
      expect(isAdminPanelRole(role)).toBe(true);
    }
  });

  it("excludes plain customers and unknown values", () => {
    // Tom, repeatedly and explicitly: the gate is for /admin users only.
    // A customer must never be asked for a camera.
    expect(isAdminPanelRole("user")).toBe(false);
    expect(isAdminPanelRole(null)).toBe(false);
    expect(isAdminPanelRole(undefined)).toBe(false);
    expect(isAdminPanelRole("")).toBe(false);
    expect(isAdminPanelRole("administrator")).toBe(false);
  });
});
