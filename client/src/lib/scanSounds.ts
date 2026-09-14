/**
 * Баркод скан дэлгэцийн дуунууд (2026-09-11). Хайрцаг задалж буй хүн дэлгэц биш
 * хайрцаг руу харж байдаг тул скан бүр дуугаар хариулна: нэг богино өндөр дуу =
 * тоологдлоо, нам давхар дуу = код каталогт байхгүй. Web Audio, файлгүй; аудио
 * боломжгүй эсвэл эхний user gesture хүртэл хаалттай бол чимээгүй юу ч хийхгүй.
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(frequency: number, startOffset: number, durationS: number, volume = 0.08) {
  const ctx = audio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  const start = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + durationS + 0.02);
}

export const scanSounds = {
  ok: () => tone(1320, 0, 0.09),
  unknown: () => { tone(330, 0, 0.14, 0.1); tone(262, 0.17, 0.18, 0.1); },
  warn: () => { tone(880, 0, 0.08); tone(880, 0.12, 0.08); },
};
