import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ubDistricts, ubDistrictLabels, type UbDistrict } from "@shared/districts";
import {
  skinTypeOptions, skinConcernOptions, interiorStyleOptions, genderOptions, hairTypeOptions,
  hairConcernOptions, fragrancePreferenceOptions, skinRoutineComplexityOptions, wellnessInterestOptions,
} from "@shared/catalog-filter";

/**
 * Preference Profile v2 (2026-09-01) quiz wizard — Tom's explicit pick over
 * an expanded single-page form, matching Curology/Typology/The Ordinary's
 * multi-step "one idea per screen" pattern (see the research summary in the
 * plan this shipped from). Every question stays fully optional (this app
 * never asks any of this at signup) -- "Алгасах" and "Дараах" both just
 * advance; the only difference is which one a shopper reaches for. Answers
 * are only actually written to the account in one combined
 * profile.updatePreferences call: on "Дуусгах" (the review step) or, if the
 * shopper closes early, a best-effort save of whatever's filled in so far
 * so nothing already answered is lost.
 */

type Draft = {
  gender: string;
  primaryDistrict: string;
  birthYear: string;
  occupation: string;
  skinType: string;
  skinConcerns: string[];
  skinRoutineComplexity: string;
  hairType: string;
  hairConcerns: string[];
  fragrancePreference: string;
  wellnessInterests: string[];
  hasYoungChildren: boolean | null;
  interiorStyle: string;
};

const emptyDraft: Draft = {
  gender: "", primaryDistrict: "", birthYear: "", occupation: "",
  skinType: "", skinConcerns: [], skinRoutineComplexity: "",
  hairType: "", hairConcerns: [],
  fragrancePreference: "",
  wellnessInterests: [], hasYoungChildren: null,
  interiorStyle: "",
};

const STEP_TITLES = ["Хувийн мэдээлэл", "Арьсны профайл", "Үсний профайл", "Үнэр & хэрэглээ", "Эрүүл мэнд & амьдрал", "Интерьер", "Тойм"];

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "9px 14px", border: `1px solid ${active ? "#17181b" : "rgba(23,24,27,.14)"}`,
    background: active ? "#17181b" : "#fff", color: active ? "#fff" : "#55565b",
    fontSize: "11px", fontWeight: 800, borderRadius: "999px", cursor: "pointer",
  };
}

function PillGroup({ options, selected, onToggle, ranked }: { options: Array<{ value: string; label: string }>; selected: string[]; onToggle: (value: string) => void; ranked?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {options.map(option => {
        const rank = selected.indexOf(option.value);
        const active = rank !== -1;
        return (
          <button type="button" key={option.value} onClick={() => onToggle(option.value)} style={pillStyle(active)}>
            {ranked && active ? `${rank + 1}. ` : ""}{option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ProfileQuizWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDraft({
      gender: user?.gender ?? "",
      primaryDistrict: user?.primaryDistrict ?? "",
      birthYear: user?.birthYear ? String(user.birthYear) : "",
      occupation: user?.occupation ?? "",
      skinType: user?.skinType ?? "",
      skinConcerns: user?.skinConcerns ? user.skinConcerns.split(",").filter(Boolean) : [],
      skinRoutineComplexity: user?.skinRoutineComplexity ?? "",
      hairType: user?.hairType ?? "",
      hairConcerns: user?.hairConcerns ? user.hairConcerns.split(",").filter(Boolean) : [],
      fragrancePreference: user?.fragrancePreference ?? "",
      wellnessInterests: user?.wellnessInterests ? user.wellnessInterests.split(",").filter(Boolean) : [],
      hasYoungChildren: user?.hasYoungChildren ?? null,
      interiorStyle: user?.interiorStyle ?? "",
    });
    // Only re-seed when the dialog actually opens -- not on every user
    // refetch while it's already open (would stomp in-progress answers).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updatePreferences = trpc.profile.updatePreferences.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const toPayload = (source: Draft) => ({
    gender: (source.gender || null) as "male" | "female" | "other" | null,
    primaryDistrict: (source.primaryDistrict || null) as UbDistrict | null,
    birthYear: source.birthYear.trim() ? Number(source.birthYear) : null,
    occupation: source.occupation.trim() || null,
    skinType: (source.skinType || null) as "dry" | "oily" | "combination" | "sensitive" | "normal" | null,
    skinConcerns: source.skinConcerns.length ? source.skinConcerns.join(",") : null,
    skinRoutineComplexity: (source.skinRoutineComplexity || null) as "minimal" | "moderate" | "extensive" | null,
    hairType: (source.hairType || null) as "dry" | "oily" | "normal" | "damaged" | "color_treated" | null,
    hairConcerns: source.hairConcerns.length ? source.hairConcerns.join(",") : null,
    fragrancePreference: (source.fragrancePreference || null) as "unscented" | "light" | "floral" | "citrus" | null,
    wellnessInterests: source.wellnessInterests.length ? source.wellnessInterests.join(",") : null,
    hasYoungChildren: source.hasYoungChildren,
    interiorStyle: source.interiorStyle || null,
  });

  const toggleList = (key: "skinConcerns" | "hairConcerns" | "wellnessInterests", value: string) =>
    setDraft(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] }));

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && step < STEP_TITLES.length - 1) {
      // Best-effort partial save so nothing already answered is lost --
      // silent (no toast), since the shopper didn't explicitly ask to save.
      updatePreferences.mutate(toPayload(draft));
    }
    onOpenChange(nextOpen);
  };

  const finish = () => {
    updatePreferences.mutate(toPayload(draft), {
      onSuccess: () => { toast.success("Тохиргоо хадгалагдлаа."); onOpenChange(false); },
      onError: error => toast.error(error instanceof Error ? error.message : "Хадгалж чадсангүй."),
    });
  };

  const isLast = step === STEP_TITLES.length - 1;
  const progressPercent = Math.round(((step + 1) / STEP_TITLES.length) * 100);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] overflow-y-auto border-0 bg-[#fffdf9] p-0 shadow-[0_28px_100px_rgba(23,24,27,.32)] sm:max-w-xl" showCloseButton>
        <div style={{ padding: "28px 28px 0" }}>
          <DialogTitle className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.03em] text-[#17181b]">
            <Sparkles size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "-2px" }} />{STEP_TITLES[step]}
          </DialogTitle>
          <DialogDescription style={{ fontSize: "12px", color: "#77787d", marginTop: 4 }}>
            Алхам {step + 1} / {STEP_TITLES.length} — бүх асуулт заавал биш, хүссэн үедээ хаагаад дараа үргэлжлүүлж болно.
          </DialogDescription>
          <div style={{ height: 4, borderRadius: 999, background: "rgba(23,24,27,.08)", marginTop: 14, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPercent}%`, background: "#17181b", transition: "width .25s ease" }} />
          </div>
        </div>

        <div style={{ padding: "22px 28px", display: "grid", gap: "18px", minHeight: 220 }}>
          {step === 0 && (
            <>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Хүйс</p>
                <PillGroup options={genderOptions} selected={draft.gender ? [draft.gender] : []} onToggle={value => setDraft(current => ({ ...current, gender: current.gender === value ? "" : value }))} />
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Дүүрэг</p>
                <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#77787d" }}>Хүргэлтийн хаяг тусад нь "Хүргэлтийн хаяг" таб дээр хадгалагдана — энэ зөвхөн зөвлөмжид ашиглагдана.</p>
                <select value={draft.primaryDistrict} onChange={event => setDraft(current => ({ ...current, primaryDistrict: event.target.value }))} className="auth-field-shell" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(23,24,27,.14)", fontSize: "13px", width: "100%" }}>
                  <option value="">Сонгоогүй</option>
                  {ubDistricts.map(key => <option key={key} value={key}>{ubDistrictLabels[key]}</option>)}
                </select>
              </div>
              <div className="profile-form-grid">
                <label className="auth-field">
                  Төрсөн он
                  <div className="auth-field-shell"><input value={draft.birthYear} onChange={event => setDraft(current => ({ ...current, birthYear: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="1995" inputMode="numeric" maxLength={4} /></div>
                </label>
                <label className="auth-field">
                  Мэргэжил
                  <div className="auth-field-shell"><input value={draft.occupation} onChange={event => setDraft(current => ({ ...current, occupation: event.target.value }))} placeholder="жишээ: Багш" maxLength={120} /></div>
                </label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Арьсны төрөл</p>
                <PillGroup options={skinTypeOptions} selected={draft.skinType ? [draft.skinType] : []} onToggle={value => setDraft(current => ({ ...current, skinType: current.skinType === value ? "" : value }))} />
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Санаа зовдог асуудал (хамгийн чухал асуудлаа эхэлж сонгоно уу)</p>
                <PillGroup options={skinConcernOptions} selected={draft.skinConcerns} onToggle={value => toggleList("skinConcerns", value)} ranked />
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Арчилгааны зэрэг</p>
                <PillGroup options={skinRoutineComplexityOptions} selected={draft.skinRoutineComplexity ? [draft.skinRoutineComplexity] : []} onToggle={value => setDraft(current => ({ ...current, skinRoutineComplexity: current.skinRoutineComplexity === value ? "" : value }))} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Үсний төрөл</p>
                <PillGroup options={hairTypeOptions} selected={draft.hairType ? [draft.hairType] : []} onToggle={value => setDraft(current => ({ ...current, hairType: current.hairType === value ? "" : value }))} />
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Санаа зовдог асуудал (олноор сонгож болно)</p>
                <PillGroup options={hairConcernOptions} selected={draft.hairConcerns} onToggle={value => toggleList("hairConcerns", value)} />
              </div>
            </>
          )}

          {step === 3 && (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Үнэрийн сонголт</p>
              <PillGroup options={fragrancePreferenceOptions} selected={draft.fragrancePreference ? [draft.fragrancePreference] : []} onToggle={value => setDraft(current => ({ ...current, fragrancePreference: current.fragrancePreference === value ? "" : value }))} />
            </div>
          )}

          {step === 4 && (
            <>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Сонирхдог зүйлс (олноор сонгож болно)</p>
                <PillGroup options={wellnessInterestOptions} selected={draft.wellnessInterests} onToggle={value => toggleList("wellnessInterests", value)} />
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Бага насны хүүхэдтэй юу?</p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" style={pillStyle(draft.hasYoungChildren === true)} onClick={() => setDraft(current => ({ ...current, hasYoungChildren: current.hasYoungChildren === true ? null : true }))}>Тийм</button>
                  <button type="button" style={pillStyle(draft.hasYoungChildren === false)} onClick={() => setDraft(current => ({ ...current, hasYoungChildren: current.hasYoungChildren === false ? null : false }))}>Үгүй</button>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 800 }}>Интерьерийн хэв маяг</p>
              <PillGroup options={interiorStyleOptions} selected={draft.interiorStyle ? [draft.interiorStyle] : []} onToggle={value => setDraft(current => ({ ...current, interiorStyle: current.interiorStyle === value ? "" : value }))} />
            </div>
          )}

          {isLast && (
            <div>
              <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#77787d" }}>Хадгалахаас өмнө хариултаа шалгаарай. Дараа нь энэ профайлыг хүссэн үедээ дахин засаж болно.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {[
                  draft.gender && genderOptions.find(o => o.value === draft.gender)?.label,
                  draft.primaryDistrict && ubDistrictLabels[draft.primaryDistrict as UbDistrict],
                  draft.birthYear && `${draft.birthYear} онд төрсөн`,
                  draft.occupation,
                  draft.skinType && skinTypeOptions.find(o => o.value === draft.skinType)?.label,
                  ...draft.skinConcerns.map(value => skinConcernOptions.find(o => o.value === value)?.label),
                  draft.skinRoutineComplexity && skinRoutineComplexityOptions.find(o => o.value === draft.skinRoutineComplexity)?.label,
                  draft.hairType && hairTypeOptions.find(o => o.value === draft.hairType)?.label,
                  ...draft.hairConcerns.map(value => hairConcernOptions.find(o => o.value === value)?.label),
                  draft.fragrancePreference && fragrancePreferenceOptions.find(o => o.value === draft.fragrancePreference)?.label,
                  ...draft.wellnessInterests.map(value => wellnessInterestOptions.find(o => o.value === value)?.label),
                  draft.hasYoungChildren === true && "Бага насны хүүхэдтэй",
                  draft.interiorStyle && interiorStyleOptions.find(o => o.value === draft.interiorStyle)?.label,
                ].filter((chip): chip is string => Boolean(chip)).map(chip => (
                  <span key={chip} style={{ padding: "8px 12px", border: "1px solid rgba(23,24,27,.14)", background: "#fff", color: "#55565b", fontSize: "11px", fontWeight: 800, borderRadius: "999px" }}>{chip}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "16px 28px 28px", display: "flex", justifyContent: "space-between", gap: "10px", borderTop: "1px solid rgba(23,24,27,.08)" }}>
          <button type="button" disabled={step === 0} onClick={() => setStep(current => Math.max(0, current - 1))} className="button" style={{ opacity: step === 0 ? .4 : 1 }}><ChevronLeft size={15} /> Буцах</button>
          <div style={{ display: "flex", gap: "10px" }}>
            {!isLast && <button type="button" onClick={() => setStep(current => Math.min(STEP_TITLES.length - 1, current + 1))} className="button">Алгасах</button>}
            {isLast
              ? <button type="button" disabled={updatePreferences.isPending} onClick={finish} className="button button-primary">{updatePreferences.isPending && <Loader2 className="animate-spin" size={15} />} Дуусгах</button>
              : <button type="button" onClick={() => setStep(current => Math.min(STEP_TITLES.length - 1, current + 1))} className="button button-primary">Дараах <ChevronRight size={15} /></button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
