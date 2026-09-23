/**
 * Амлалтыг хугацаагаар хязгаарлана (2026-09-23).
 *
 * Царайны хаалганы загвар ачаалах алхмууд (MediaPipe-ийн wasm/GPU, TFJS-ийн
 * WebGL backend) iPhone-ий Safari дээр АЛДАА ШИДЭХГҮЙГЭЭР ГАЦАЖ болдог. Тэр
 * үед UI "Загвар ачааллаж байна…" дээр мөнхөд үлдэж, "Дахин оролдох" товч ч
 * гарахгүй байв (Tom-ийн утсан дээр бодитоор гарсан). Хугацаа дуусвал
 * `message`-тай алдаа шиднэ — UI түүнийг таньж тодорхой зөвлөгөө үзүүлнэ.
 *
 * Анхны амлалтыг ЦУЦЛАХГҮЙ (хөтөч wasm compile-ыг цуцлах API өгдөггүй);
 * зөвхөн хүлээхээ болино.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
