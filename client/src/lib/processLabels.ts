import type { ActorKind, TimelineSource } from "@shared/process-timeline";

const ACTOR_CLASS: Record<ActorKind, string> = {
  customer: "a-actor-chip a-actor-chip-customer",
  staff: "a-actor-chip a-actor-chip-staff",
  job: "a-actor-chip a-actor-chip-job",
  webhook: "a-actor-chip a-actor-chip-webhook",
  system: "a-actor-chip a-actor-chip-system",
};
export const actorChipClass = (actorKind: string) => ACTOR_CLASS[actorKind as ActorKind] ?? ACTOR_CLASS.system;

const SOURCE_LABELS: Record<TimelineSource | "job", string> = {
  event: "event",
  stock: "нөөц",
  payment: "төлбөр",
  notification: "мэдэгдэл",
  audit: "аудит",
  job: "ажил",
};
export const sourceLabel = (source: string) => SOURCE_LABELS[source as TimelineSource] ?? source;

export function intervalLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} цаг`;
  return `${Math.round(hours / 24)} өдөр`;
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const future = diff < 0;
  const minutes = Math.floor(Math.abs(diff) / 60_000);
  let text: string;
  if (minutes < 1) text = "дөнгөж сая";
  else if (minutes < 60) text = `${minutes} мин`;
  else if (minutes < 60 * 48) text = `${Math.floor(minutes / 60)} цаг`;
  else text = `${Math.floor(minutes / 1440)} өдөр`;
  if (minutes < 1) return text;
  return future ? `${text}-ийн дараа` : `${text} өмнө`;
}

export const formatDateTime = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleString("mn-MN") : "—";
