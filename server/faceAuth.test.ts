import { describe, expect, it } from "vitest";
import {
  FACE_DESCRIPTOR_LENGTH,
  FACE_MATCH_THRESHOLD,
  averageFaceDescriptors,
  evaluateFlashResponse,
  faceDescriptorDistance,
  isAdminPanelRole,
  isValidFaceDescriptor,
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
