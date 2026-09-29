import { Fragment, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { INGREDIENT_GLOSSARY } from "@/lib/ingredient-glossary";

// PREMIUM-FEATURES.md TIER 3: highlights known ingredient terms inside a
// block of product-description text and attaches a definition popover to
// each — opens on hover (desktop) *and* tap (mobile/touch), since a
// hover-only Radix Tooltip is unusable on a touchscreen. A controlled
// Popover with both onMouseEnter/Leave and onClick covers both.
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sortedTerms = [...INGREDIENT_GLOSSARY].sort((a, b) => b.term.length - a.term.length);
const glossaryPattern = sortedTerms.length ? new RegExp(`(${sortedTerms.map(entry => escapeRegExp(entry.term)).join("|")})`, "gi") : null;
const definitionFor = (matched: string) => sortedTerms.find(entry => entry.term.toLowerCase() === matched.toLowerCase())?.definition;

// 2026-09-27: a fine (mouse) pointer already opens/closes on hover; a click
// on top of that used to TOGGLE, so clicking a term a hover had already
// opened instantly closed it again. Coarse (touch) pointers get no hover at
// all, so click there has to do the opening -- and toggling is the only way
// to close it again without a hover-leave event.
const isCoarsePointer = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

function GlossaryTerm({ text, definition }: { text: string; definition: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => { if (!isCoarsePointer()) setOpen(true); }}
          onMouseLeave={() => { if (!isCoarsePointer()) setOpen(false); }}
          onClick={() => { if (isCoarsePointer()) setOpen(current => !current); else setOpen(true); }}
          className="inline cursor-help border-0 border-b border-dotted border-[#df1f3d] bg-transparent p-0 text-inherit align-baseline"
          style={{ font: "inherit" }}
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={event => event.preventDefault()} className="w-64 text-xs leading-5 text-[#3b3c40]">{definition}</PopoverContent>
    </Popover>
  );
}

export default function GlossaryText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  if (!glossaryPattern) return <>{text}</>;
  const parts = text.split(glossaryPattern);
  return <>{parts.map((part, index) => {
    const definition = definitionFor(part);
    return definition ? <GlossaryTerm key={index} text={part} definition={definition} /> : <Fragment key={index}>{part}</Fragment>;
  })}</>;
}
