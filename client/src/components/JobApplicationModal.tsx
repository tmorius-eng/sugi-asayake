import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { FieldError, useFieldErrors } from "@/hooks/useFieldErrors";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useT } from "@/hooks/useLocale";

/**
 * /careers дээрх анкетын маягт (2026-09-14).
 *
 * "Өргөдөл илгээх" нь mailto: холбоос байхад юу ч бүртгэгддэггүй байв. Одоо
 * нэр, утас, имэйл, захидал, CV файлыг careers.apply руу илгээж, сервер
 * `job_applications`-д хадгалж, админд push очно. CV нь base64-ээр явна
 * (профайлын зурагтай ижил зам), 5 МБ хүртэл PDF/Word.
 *
 * `posting` null = ерөнхий анкет (тодорхой зар сонгоогүй).
 */
export type ApplyTarget = { id: number | null; title: string };

const CV_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
const CV_MAX_BYTES = 5 * 1024 * 1024;

const fieldClass = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-normal outline-none transition focus:border-[var(--primary)]";

export default function JobApplicationModal({ target, onClose }: { target: ApplyTarget | null; onClose: () => void }) {
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const { errorFor, fieldProps, clearError, showErrors } = useFieldErrors();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const apply = trpc.careers.submit.useMutation();

  // Шинэ зар руу нээхэд өмнөх "амжилттай" төлөв үлдэхгүй.
  useEffect(() => { if (target) setDone(false); }, [target]);

  const pickFile = (candidate: File | null) => {
    if (!candidate) { setFile(null); return; }
    if (!(CV_TYPES as readonly string[]).includes(candidate.type)) { toast.error(t("CV нь PDF эсвэл Word файл байх ёстой.")); return; }
    if (candidate.size > CV_MAX_BYTES) { toast.error(t("CV файл 5 МБ-аас том байна.")); return; }
    setFile(candidate);
  };

  const readAsBase64 = (blob: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    const nextErrors: Record<string, string> = {};
    if (fullName.trim().length < 2) nextErrors["job-name"] = t("Нэрээ бичнэ үү.");
    if (phone.replace(/\D/g, "").length < 8) nextErrors["job-phone"] = t("Утасны дугаараа бүтэн бичнэ үү.");
    if (showErrors(nextErrors)) return;
    try {
      const cv = file ? { fileName: file.name, contentType: file.type as (typeof CV_TYPES)[number], dataBase64: await readAsBase64(file) } : null;
      await apply.mutateAsync({ jobPostingId: target.id, fullName: fullName.trim(), phone: phone.trim(), email: email.trim() || null, message: message.trim() || null, cv });
      setDone(true);
      setFullName(""); setPhone(""); setEmail(""); setMessage(""); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Илгээж чадсангүй. Дахин оролдоно уу."));
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{target?.id === null ? t("Ерөнхий анкет") : t("Өргөдөл илгээх")}</DialogTitle>
        <DialogDescription>{target ? target.title : ""}</DialogDescription>
        {done ? (
          <div className="grid place-items-center gap-3 py-6 text-center">
            <CheckCircle2 size={40} className="text-[#1f5c3a]" aria-hidden="true" />
            <p className="max-w-sm text-sm leading-6">{t("Баярлалаа! Анкетыг тань хүлээн авлаа. Бид тантай удахгүй холбогдоно.")}</p>
            <button type="button" onClick={onClose} className="mt-2 rounded-full bg-[var(--primary)] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--primary-strong)]">{t("Хаах")}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-3" noValidate>
            {/* noValidate (2026-09-21, E2E олсон): `required` талбартай үед хөтөч өөрийн
                хөөсөн мессежээр илгээлтийг хаадаг тул useFieldErrors-ийн талбарын алдаа
                хэзээ ч гардаггүй байв. Шалгалтыг submit() өөрөө хийнэ. */}
            <label className="grid gap-1.5 text-xs font-bold">{t("Нэр")}<input value={fullName} onChange={event => { setFullName(event.target.value); clearError("job-name"); }} autoComplete="name" required className={fieldClass} {...fieldProps("job-name")} /><FieldError field="job-name" message={errorFor("job-name")} /></label>
            <label className="grid gap-1.5 text-xs font-bold">{t("Утас")}<input value={phone} onChange={event => { setPhone(event.target.value); clearError("job-phone"); }} inputMode="tel" autoComplete="tel" required className={fieldClass} {...fieldProps("job-phone")} /><FieldError field="job-phone" message={errorFor("job-phone")} /></label>
            <label className="grid gap-1.5 text-xs font-bold">{t("Имэйл (сонголттой)")}<input value={email} onChange={event => setEmail(event.target.value)} inputMode="email" autoComplete="email" className={fieldClass} /></label>
            <label className="grid gap-1.5 text-xs font-bold">{t("Захидал (сонголттой)")}<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} className="min-h-24 w-full rounded-xl border border-border bg-card p-3 text-sm font-normal outline-none transition focus:border-[var(--primary)]" /></label>
            {/* <div>, not <label> (2026-09-21, a11y): a <label> may not contain a
                <button> -- clicking the "Сонгох" button activated the label's
                own control too, and the whole box was announced as one label.
                The file input is named by the heading through aria-labelledby. */}
            <div className="grid gap-1.5 text-xs font-bold">
              <span id="job-cv-label">{t("CV файл (PDF эсвэл Word, 5 МБ хүртэл)")}</span>
              <span className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-2.5 text-xs font-normal text-muted-foreground">
                <Paperclip size={14} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : t("Файл сонгоогүй")}</span>
                <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => pickFile(event.target.files?.[0] ?? null)} className="sr-only" aria-labelledby="job-cv-label" tabIndex={-1} />
                <button type="button" onClick={() => fileInput.current?.click()} aria-describedby="job-cv-label" className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] font-bold text-foreground transition hover:border-foreground">{t("Сонгох")}</button>
              </span>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">{t("Анкетыг зөвхөн ажилд авах зорилгоор ашиглаж, сонгон шалгаруулалт дууссаны дараа устгана.")}</p>
            <div className="mt-1 flex gap-2">
              <button type="submit" disabled={apply.isPending} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60">{apply.isPending && <LoaderCircle className="animate-spin" size={15} />}{t("Илгээх")}</button>
              <button type="button" onClick={onClose} className="rounded-full border border-border px-5 py-3 text-sm font-bold transition hover:border-foreground">{t("Болих")}</button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
