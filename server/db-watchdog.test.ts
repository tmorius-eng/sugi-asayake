import { describe, expect, it } from "vitest";
import { initialWatchdogState, stepWatchdog } from "./_core/dbWatchdog";

const MIN = 60_000;

describe("stepWatchdog", () => {
  it("alerts only after three consecutive failures", () => {
    const s = initialWatchdogState();
    expect(stepWatchdog(s, { ok: false, error: "x" }, 0).kind).toBe("none");
    expect(stepWatchdog(s, { ok: false, error: "x" }, MIN).kind).toBe("none");
    expect(stepWatchdog(s, { ok: false, error: "certificate signature failure" }, 2 * MIN)).toEqual({ kind: "alert", repeat: false });
    expect(s.lastError).toBe("certificate signature failure");
    expect(stepWatchdog(s, { ok: false }, 3 * MIN).kind).toBe("none");
  });

  it("a blip that recovers before the threshold sends nothing", () => {
    const s = initialWatchdogState();
    stepWatchdog(s, { ok: false }, 0);
    stepWatchdog(s, { ok: false }, MIN);
    expect(stepWatchdog(s, { ok: true }, 2 * MIN).kind).toBe("none");
    expect(stepWatchdog(s, { ok: false }, 3 * MIN).kind).toBe("none");
  });

  it("re-alerts every six hours while still down and reports recovery with duration", () => {
    const s = initialWatchdogState();
    for (let i = 0; i < 3; i++) stepWatchdog(s, { ok: false }, i * MIN);
    expect(stepWatchdog(s, { ok: false }, 6 * 60 * MIN).kind).toBe("none");
    expect(stepWatchdog(s, { ok: false }, 2 * MIN + 6 * 60 * MIN)).toEqual({ kind: "alert", repeat: true });
    expect(stepWatchdog(s, { ok: true }, 7 * 60 * MIN)).toEqual({ kind: "recovered", downForMs: 7 * 60 * MIN });
    expect(s).toEqual(initialWatchdogState());
  });
});
