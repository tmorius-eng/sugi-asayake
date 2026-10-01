import { beforeEach, describe, expect, it } from "vitest";
import {
  FACE_REPLAY_NEAR_DISTANCE,
  clearFaceReplayMemoryForTests,
  detailWithDescriptorHash,
  isNearDuplicate,
  quantizedDescriptorHash,
  recentAcceptedDescriptors,
  rememberAcceptedDescriptor,
} from "./faceReplay";

function descriptor(seed: number, length = 128): number[] {
  // Deterministic pseudo-descriptor in the usual face-api range (about -0.3 .. 0.3).
  return Array.from({ length }, (_, i) => Math.sin(seed * 12.9898 + i * 78.233) * 0.3);
}

describe("quantizedDescriptorHash", () => {
  it("is stable for the same descriptor and 16 hex long", () => {
    const d = descriptor(1);
    expect(quantizedDescriptorHash(d)).toBe(quantizedDescriptorHash([...d]));
    expect(quantizedDescriptorHash(d)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores sub-0.01 noise but separates different frames", () => {
    const d = descriptor(1);
    // Nudging every component by far less than the quantisation step keeps the hash only when it
    // does not cross a rounding boundary; use values placed on exact steps to make it deterministic.
    const onGrid = d.map(v => Math.round(v * 100) / 100);
    const jitter = onGrid.map(v => v + 0.0004);
    expect(quantizedDescriptorHash(jitter)).toBe(quantizedDescriptorHash(onGrid));
    expect(quantizedDescriptorHash(descriptor(2))).not.toBe(quantizedDescriptorHash(d));
  });
});

describe("detailWithDescriptorHash", () => {
  it("appends the hash and keeps the existing text readable", () => {
    expect(detailWithDescriptorHash("blink", "0123456789abcdef")).toBe("blink d=0123456789abcdef");
    expect(detailWithDescriptorHash(null, "0123456789abcdef")).toBe(" d=0123456789abcdef");
  });

  it("never exceeds the 160-character column, truncating the old text not the hash", () => {
    const out = detailWithDescriptorHash("x".repeat(400), "0123456789abcdef");
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith(" d=0123456789abcdef")).toBe(true);
  });
});

describe("near-duplicate detection", () => {
  beforeEach(() => clearFaceReplayMemoryForTests());

  it("flags a practically identical descriptor and passes a genuinely different one", () => {
    const base = descriptor(1);
    const nearlyIdentical = base.map((v, i) => (i === 0 ? v + FACE_REPLAY_NEAR_DISTANCE / 4 : v));
    expect(isNearDuplicate(nearlyIdentical, [base])).toBe(true);
    expect(isNearDuplicate(descriptor(2), [base])).toBe(false);
    expect(isNearDuplicate(base, [])).toBe(false);
  });

  it("remembers at most 5 accepted descriptors per user and forgets after 24 hours", () => {
    const now = Date.UTC(2026, 9, 1);
    for (let i = 0; i < 8; i += 1) rememberAcceptedDescriptor(7, descriptor(i), now + i);
    expect(recentAcceptedDescriptors(7, now + 10)).toHaveLength(5);
    expect(recentAcceptedDescriptors(8, now + 10)).toHaveLength(0);
    expect(recentAcceptedDescriptors(7, now + 25 * 60 * 60 * 1000)).toHaveLength(0);
  });
});
