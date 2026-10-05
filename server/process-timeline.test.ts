import { describe, expect, it } from "vitest";
import { mergeTimeline, type TimelineEntry } from "../shared/process-timeline";

function entry(partial: Partial<TimelineEntry> & Pick<TimelineEntry, "source" | "id" | "at" | "kind">): TimelineEntry {
  return { key: `${partial.source}:${partial.id}`, actorKind: "system", actorLabel: null, summary: partial.kind, ...partial };
}

describe("mergeTimeline", () => {
  it("цагаар эрэмбэлж, нэг секундын тэнцвэрийг эх сурвалжийн давуу эрхээр таслана", () => {
    const merged = mergeTimeline([
      [entry({ source: "stock", id: 9, at: "2026-10-05T03:00:00.000Z", kind: "sale_online" })],
      [entry({ source: "event", id: 2, at: "2026-10-05T03:00:00.000Z", kind: "order.created" })],
      [entry({ source: "audit", id: 1, at: "2026-10-05T02:59:00.000Z", kind: "order.updated" })],
      [entry({ source: "notification", id: 4, at: "2026-10-05T03:00:00.000Z", kind: "order.placed" })],
    ]);
    expect(merged.map(e => e.key)).toEqual(["audit:1", "event:2", "stock:9", "notification:4"]);
  });

  it("ижил эх сурвалжийн тэнцвэрийг id-аар таслана", () => {
    const merged = mergeTimeline([[
      entry({ source: "event", id: 12, at: "2026-10-05T03:00:00.000Z", kind: "payment.paid" }),
      entry({ source: "event", id: 11, at: "2026-10-05T03:00:00.000Z", kind: "order.created" }),
    ]]);
    expect(merged.map(e => e.id)).toEqual([11, 12]);
  });

  it("webhook event-тэй нэг секундэд ирсэн payment_attempts 'paid' мөрийг давхардуулахгүй", () => {
    const merged = mergeTimeline([
      [entry({ source: "event", id: 5, at: "2026-10-05T03:00:07.000Z", kind: "payment.paid", actorKind: "webhook" })],
      [entry({ source: "payment", id: 3, at: "2026-10-05T03:00:07.000Z", kind: "payment.paid" }),
       entry({ source: "payment", id: 2, at: "2026-10-05T02:58:00.000Z", kind: "payment.pending" })],
    ]);
    expect(merged.map(e => e.key)).toEqual(["payment:2", "event:5"]);
  });

  it("event-гүй төлбөрийн мөрийг (хуучин захиалга) хэвээр үлдээнэ", () => {
    const merged = mergeTimeline([[entry({ source: "payment", id: 3, at: "2026-10-05T03:00:07.000Z", kind: "payment.paid" })]]);
    expect(merged).toHaveLength(1);
  });
});
