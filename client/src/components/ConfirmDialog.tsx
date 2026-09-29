import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * `window.confirm` / `window.prompt`-ын оронд сайтын өөрийн dialog (2026-09-21).
 *
 * Хөтчийн төрөлх confirm нь: утсан дээр (ялангуяа PWA/standalone горимд) хөтчийн
 * chrome-той хамт харагдаж "сайтын гадна" зүйл шиг; загвар/хэл/харанхуй горим
 * дагадаггүй; дэлгэц уншигчид дурын текстээр уншигддаг; Playwright-д `page.once
 * ("dialog")` гэсэн тусгай зам шаарддаг. Энэ нэг dialog нь ui/dialog (Radix) дээр
 * суурилсан тул фокус баригдана, Esc/overlay хаана, `role="dialog"`-той — E2E нь
 * ердийн товч дардаг.
 *
 * Хэрэглээ (async!):
 *   const { confirm, prompt } = useConfirm();
 *   if (!(await confirm({ title: "Устгах уу?", danger: true }))) return;
 *   const note = await prompt({ title: "Тайлбар", input: { multiline: true } }); // null = болих
 *
 * Provider App.tsx-д нэг л удаа; provider-гүй газар (тест, тусгаарласан render)
 * hook нь хөтчийн confirm/prompt руу буцна — зан төлөв алдагдахгүй.
 */
export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Устгах/цуцлах зэрэг буцаагдахгүй үйлдэлд — товч улаан. */
  danger?: boolean;
};
export type PromptOptions = ConfirmOptions & {
  input: {
    label?: string;
    placeholder?: string;
    initial?: string;
    multiline?: boolean;
    /** Хоосон утгыг батлахыг зөвшөөрөхгүй. */
    required?: boolean;
    /** Зөвхөн харуулж хуулуулах (жишээ: хуваалцах холбоос). */
    readOnly?: boolean;
  };
};

type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

type ConfirmApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  // Хоёр dialog зэрэг асвал (давхар товшилт) эхнийх нь "болих" гэж хаагдана.
  const pendingRef = useRef<Pending | null>(null);
  const settle = useCallback((result: boolean | string | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (!current) return;
    if (current.kind === "confirm") current.resolve(Boolean(result));
    else current.resolve(typeof result === "string" ? result : null);
  }, []);
  const open = useCallback((next: Pending) => {
    if (pendingRef.current) settle(null);
    pendingRef.current = next;
    setValue(next.kind === "prompt" ? next.options.input.initial ?? "" : "");
    setPending(next);
  }, [settle]);
  const api = useMemo<ConfirmApi>(() => ({
    confirm: options => new Promise(resolve => open({ kind: "confirm", options, resolve })),
    prompt: options => new Promise(resolve => open({ kind: "prompt", options, resolve })),
  }), [open]);

  const options = pending?.options;
  const input = pending?.kind === "prompt" ? pending.options.input : null;
  const canSubmit = !input || !input.required || value.trim().length > 0;
  const submit = () => settle(pending?.kind === "prompt" ? value : true);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Dialog open={pending !== null} onOpenChange={isOpen => { if (!isOpen) settle(null); }}>
        {options && (
          <DialogContent className="confirm-dialog" data-testid="confirm-dialog">
            <DialogHeader>
              <DialogTitle>{options.title}</DialogTitle>
              {options.body ? <DialogDescription>{options.body}</DialogDescription> : <DialogDescription className="sr-only">{options.title}</DialogDescription>}
            </DialogHeader>
            {input && (
              <label className="confirm-dialog-field">
                {input.label ? <span>{input.label}</span> : null}
                {input.multiline
                  ? <textarea className="confirm-dialog-input" value={value} onChange={event => setValue(event.target.value)} placeholder={input.placeholder} rows={4} maxLength={1000} readOnly={input.readOnly} autoFocus />
                  : <input className="confirm-dialog-input" value={value} onChange={event => setValue(event.target.value)} placeholder={input.placeholder} maxLength={500} readOnly={input.readOnly} autoFocus onFocus={event => { if (input.readOnly) event.currentTarget.select(); }} onKeyDown={event => { if (event.key === "Enter" && canSubmit) { event.preventDefault(); submit(); } }} />}
              </label>
            )}
            <DialogFooter className="confirm-dialog-actions">
              {/* 2026-09-27: устгах мэт буцаагдахгүй үйлдэлд анхны фокус
                  "Тийм" дээр байх ёстойгүй -- санамсаргүй Enter/space дарахад
                  шууд баталчихдаг. Устгах биш үед л батлах товч фокустой эхэлнэ. */}
              <button type="button" className="confirm-dialog-cancel" onClick={() => settle(null)} autoFocus={!input && Boolean(options.danger)}>{options.cancelLabel ?? "Болих"}</button>
              <button type="button" className={`confirm-dialog-ok${options.danger ? " is-danger" : ""}`} disabled={!canSubmit} onClick={submit} autoFocus={!input && !options.danger}>
                {options.confirmLabel ?? (options.danger ? "Тийм, үргэлжлүүлэх" : "Тийм")}
              </button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

const nativeFallback: ConfirmApi = {
  confirm: async options => window.confirm(options.title),
  prompt: async options => window.prompt(options.title, options.input.initial ?? ""),
};

export function useConfirm(): ConfirmApi {
  return useContext(ConfirmContext) ?? nativeFallback;
}
