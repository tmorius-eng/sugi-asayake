import { useCallback, useState } from "react";

/**
 * Маягтын алдааг ТАЛБАР дээр нь (WCAG 3.3.1, Baymard) — Checkout.tsx-ийн
 * 2026-09-20-ны загварыг нэг hook болгов (2026-09-21, хүртээмж), Login /
 * ForgotPassword / TrackOrder / JobApplicationModal мөн үүнийг хэрэглэнэ.
 *
 * Гэрээ: талбарын `id` = алдааны түлхүүр. `fieldProps(id)` нь `aria-invalid` +
 * `aria-describedby="<id>-error"`-ийг өгнө; `<FieldError field={id} />` тэр id-тай
 * мөрийг зурна; `showErrors({...})` алдаануудыг тавьж, ЭХНИЙ алдаатай талбар руу
 * гүйлгэж фокус өгнө (утсан дээр алдаа дэлгэцийн гадна үлдвэл хэрэглэгч юу буруу
 * болсныг огт харахгүй). Toast нь нэмэлт л байж болно, орлохгүй.
 */
export function useFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorFor = useCallback((field: string) => fieldErrors[field] || undefined, [fieldErrors]);
  const fieldProps = useCallback((field: string) => ({
    id: field,
    "aria-invalid": Boolean(fieldErrors[field]) || undefined,
    "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined,
  }), [fieldErrors]);
  const clearError = useCallback((field: string) => setFieldErrors(previous => (previous[field] ? { ...previous, [field]: "" } : previous)), []);
  /** Алдаануудыг тавьж эхнийх рүү очно; алдаа байвал true. */
  const showErrors = useCallback((errors: Record<string, string>) => {
    setFieldErrors(errors);
    const first = Object.keys(errors).find(key => errors[key]);
    if (!first) return false;
    const element = document.getElementById(first);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    (element as HTMLElement | null)?.focus?.();
    return true;
  }, []);
  return { fieldErrors, errorFor, fieldProps, clearError, showErrors };
}

/** Талбарын доорх алдааны мөр — `fieldProps` өгсөн `aria-describedby`-тай ижил id. */
export function FieldError({ field, message, className = "field-error" }: { field: string; message: string | undefined; className?: string }) {
  if (!message) return null;
  return <span id={`${field}-error`} role="alert" className={className}>{message}</span>;
}
