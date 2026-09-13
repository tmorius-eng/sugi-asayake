import { describe, expect, it } from "vitest";
import {
  BlinkDetector,
  CENTER_TOLERANCE,
  COVERAGE_SECTORS,
  CoverageTracker,
  ENROLL_HOLD_FRAMES,
  ENROLL_TURN_MIN,
  MP,
  StillnessTracker,
  blendshapeMap,
  checkFraming,
  getHeadPose,
  landmarkBox,
  screenDirection,
  sectorOf,
  type MpLandmark,
} from "../shared/face-pose";

/**
 * A synthetic 478-point face: every point at the centre except the seven the
 * pose code reads, which are placed like a real frontal face of the given
 * width. `nose` offsets move the nose tip, which is how a turn shows up.
 */
function face(opts: { width?: number; cx?: number; cy?: number; noseDx?: number; noseDy?: number; rollDy?: number } = {}): MpLandmark[] {
  const width = opts.width ?? 0.4;
  const cx = opts.cx ?? 0.5;
  const cy = opts.cy ?? 0.5;
  const height = width * 1.35;
  const points: MpLandmark[] = Array.from({ length: 478 }, () => ({ x: cx, y: cy }));
  points[MP.edgeA] = { x: cx - width / 2, y: cy };
  points[MP.edgeB] = { x: cx + width / 2, y: cy };
  points[MP.forehead] = { x: cx, y: cy - height / 2 };
  points[MP.chin] = { x: cx, y: cy + height / 2 };
  points[MP.leftEyeOuter] = { x: cx - width * 0.3, y: cy - height * 0.1 };
  points[MP.rightEyeOuter] = { x: cx + width * 0.3, y: cy - height * 0.1 + (opts.rollDy ?? 0) };
  points[MP.noseTip] = { x: cx + (opts.noseDx ?? 0), y: cy + (opts.noseDy ?? 0) };
  return points;
}

describe("getHeadPose", () => {
  it("reads a frontal face as zero yaw, pitch and roll", () => {
    const pose = getHeadPose(face());
    expect(Math.abs(pose.yaw)).toBeLessThan(1e-9);
    expect(Math.abs(pose.pitch)).toBeLessThan(1e-9);
    expect(Math.abs(pose.roll)).toBeLessThan(1e-9);
  });

  it("nose towards the image's right = positive yaw (the person turned to THEIR left)", () => {
    expect(getHeadPose(face({ noseDx: 0.06 })).yaw).toBeCloseTo(0.15, 5);
    expect(getHeadPose(face({ noseDx: -0.06 })).yaw).toBeCloseTo(-0.15, 5);
  });

  it("nose downwards = positive pitch (looking down)", () => {
    expect(getHeadPose(face({ noseDy: 0.054 })).pitch).toBeCloseTo(0.1, 5);
    expect(getHeadPose(face({ noseDy: -0.054 })).pitch).toBeCloseTo(-0.1, 5);
  });

  it("is a ratio: the same turn reads the same at any distance", () => {
    const near = getHeadPose(face({ width: 0.6, noseDx: 0.09 })).yaw;
    const far = getHeadPose(face({ width: 0.3, noseDx: 0.045 })).yaw;
    expect(near).toBeCloseTo(far, 6);
  });

  it("reports roll from the eye line without inventing yaw", () => {
    const pose = getHeadPose(face({ rollDy: 0.05 }));
    expect(pose.roll).toBeGreaterThan(0.1);
    expect(Math.abs(pose.yaw)).toBeLessThan(1e-9);
  });
});

describe("landmarkBox / checkFraming", () => {
  it("bounds the landmark hull", () => {
    const box = landmarkBox(face({ width: 0.4 }));
    expect(box.width).toBeCloseTo(0.4, 6);
    expect(box.x).toBeCloseTo(0.3, 6);
  });

  it("accepts a well-framed single face", () => {
    expect(checkFraming(1, face({ width: 0.4 }))).toBeNull();
  });

  it("names each framing problem", () => {
    expect(checkFraming(0, null)).toBe("NO_FACE");
    expect(checkFraming(2, face())).toBe("MULTIPLE_FACES");
    expect(checkFraming(1, face({ width: 0.15 }))).toBe("TOO_FAR");
    expect(checkFraming(1, face({ cx: 0.85 }))).toBe("OFF_CENTER");
  });

  it("is more lenient about size for a turned head, whose projection is narrower", () => {
    expect(checkFraming(1, face({ width: 0.22 }), false)).toBe("TOO_FAR");
    expect(checkFraming(1, face({ width: 0.22 }), true)).toBeNull();
  });
});

describe("screenDirection / sectorOf", () => {
  it("mirrors yaw so the on-screen ring matches what the person sees", () => {
    // Turned to THEIR left (positive yaw) appears on the LEFT of the
    // mirrored preview: negative screen x.
    expect(screenDirection({ yaw: 0.2, pitch: 0, roll: 0 }).x).toBeLessThan(0);
  });

  it("returns null below the minimum turn", () => {
    expect(sectorOf({ x: ENROLL_TURN_MIN * 0.5, y: 0 })).toBeNull();
  });

  it("maps the eight compass directions to sectors 0..7 clockwise from the right", () => {
    const r = 0.2;
    expect(sectorOf({ x: r, y: 0 })).toBe(0);          // right
    expect(sectorOf({ x: r, y: r })).toBe(1);          // down-right
    expect(sectorOf({ x: 0, y: r })).toBe(2);          // down
    expect(sectorOf({ x: -r, y: r })).toBe(3);         // down-left
    expect(sectorOf({ x: -r, y: 0 })).toBe(4);         // left
    expect(sectorOf({ x: -r, y: -r })).toBe(5);        // up-left
    expect(sectorOf({ x: 0, y: -r })).toBe(6);         // up
    expect(sectorOf({ x: r, y: -r })).toBe(7);         // up-right
  });

  it("puts a direction just past a sector boundary in the next sector, not a random one", () => {
    // 22.5 degrees is the boundary between sector 0 and 1.
    const just = (23 * Math.PI) / 180;
    expect(sectorOf({ x: Math.cos(just) * 0.2, y: Math.sin(just) * 0.2 })).toBe(1);
  });
});

describe("CoverageTracker", () => {
  const still = { yaw: 0, pitch: 0, roll: 0 };
  const turned = (sector: number) => {
    const angle = (sector * 2 * Math.PI) / COVERAGE_SECTORS;
    // screen x = -yaw, screen y = pitch
    return { yaw: -Math.cos(angle) * 0.18, pitch: Math.sin(angle) * 0.18, roll: 0 };
  };

  it("covers the centre after enough straight-on frames", () => {
    const t = new CoverageTracker();
    const events = [t.observe(still), t.observe(still), t.observe(still), t.observe(still)];
    expect(events.slice(0, 3)).toEqual([null, null, null]);
    expect(events[3]).toEqual({ type: "center" });
    expect(t.hasCenter).toBe(true);
  });

  it("does not cover a sector the head only sweeps through", () => {
    const t = new CoverageTracker();
    expect(t.observe(turned(0))).toBeNull();
    expect(t.observe(turned(1))).toBeNull();
    expect(t.observe(turned(2))).toBeNull();
    expect(t.coveredSectors.size).toBe(0);
  });

  it("covers a sector once the head is held there, and only reports it once", () => {
    const t = new CoverageTracker();
    let event = null;
    for (let i = 0; i < ENROLL_HOLD_FRAMES; i += 1) event = t.observe(turned(4));
    expect(event).toEqual({ type: "sector", sector: 4 });
    expect(t.observe(turned(4))).toBeNull();
    expect(t.coveredSectors.has(4)).toBe(true);
  });

  it("is complete only after the centre and all eight sectors", () => {
    const t = new CoverageTracker();
    for (let s = 0; s < COVERAGE_SECTORS; s += 1) {
      for (let i = 0; i < ENROLL_HOLD_FRAMES; i += 1) t.observe(turned(s));
    }
    expect(t.complete).toBe(false);
    for (let i = 0; i < 4; i += 1) t.observe(still);
    expect(t.complete).toBe(true);
    expect(t.progress).toBe(1);
  });

  it("suggests the nearest uncovered sector as the next target", () => {
    const t = new CoverageTracker();
    for (let i = 0; i < ENROLL_HOLD_FRAMES; i += 1) t.observe(turned(2));
    expect(t.nextTarget()).toBe(3);
  });

  it("centre tolerance is tighter than the turn threshold, leaving a dead zone between", () => {
    expect(CENTER_TOLERANCE).toBeLessThan(ENROLL_TURN_MIN);
  });
});

describe("BlinkDetector", () => {
  const shapes = (blink: number) => blendshapeMap([
    { categoryName: "eyeBlinkLeft", score: blink },
    { categoryName: "eyeBlinkRight", score: blink },
  ]);

  it("counts open → shut → open as one blink", () => {
    const b = new BlinkDetector();
    b.observe(shapes(0.05));
    b.observe(shapes(0.8));
    b.observe(shapes(0.1));
    expect(b.count).toBe(1);
  });

  it("does not count eyes that stay shut", () => {
    const b = new BlinkDetector();
    for (let i = 0; i < 10; i += 1) b.observe(shapes(0.9));
    expect(b.seen).toBe(false);
  });

  it("needs BOTH eyes to close -- a wink or a landmark glitch on one eye is not a blink", () => {
    const b = new BlinkDetector();
    b.observe(blendshapeMap([{ categoryName: "eyeBlinkLeft", score: 0.9 }, { categoryName: "eyeBlinkRight", score: 0.1 }]));
    b.observe(shapes(0.05));
    expect(b.seen).toBe(false);
  });

  it("ignores half-closures that never cross the shut threshold", () => {
    const b = new BlinkDetector();
    b.observe(shapes(0.1));
    b.observe(shapes(0.4));
    b.observe(shapes(0.1));
    expect(b.seen).toBe(false);
  });
});

describe("StillnessTracker", () => {
  it("reports still only after several near-motionless frames", () => {
    const s = new StillnessTracker();
    const results = [s.observe(face()), s.observe(face()), s.observe(face()), s.observe(face())];
    expect(results).toEqual([false, false, false, true]);
  });

  it("resets the run on movement", () => {
    const s = new StillnessTracker();
    for (let i = 0; i < 4; i += 1) s.observe(face());
    expect(s.observe(face({ noseDx: 0.05 }))).toBe(false);
    expect(s.observe(face({ noseDx: 0.05 }))).toBe(false);
  });
});
