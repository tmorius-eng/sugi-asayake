import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import AdminWorkspace from "@/components/AdminWorkspace";

export default function AdminPreview() {
  return <div className="min-h-screen bg-[#f8f5ef]"><header className="sticky top-0 z-30 border-b border-black/8 bg-[#fffdf9]/94 px-4 py-3 backdrop-blur-lg before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-[#df1f3d] sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><Link href="/" className="inline-flex min-w-0 items-center gap-2 text-xs font-bold sm:gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-black/10"><ArrowLeft size={15} /></span><img src="/manus-storage/sugi-logo-transparent-clean_fee66cad.png" alt="SUGI ASAYAKE" className="h-5 w-auto sm:h-6" /><span className="hidden text-[#77787d] sm:inline">Нийтийн сайт руу буцах</span></Link><Link href="/admin" aria-label="Хамгаалагдсан админ руу очих" className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-[#df1f3d]"><span className="hidden sm:inline">Хамгаалагдсан админ руу очих</span><ExternalLink size={14} /></Link></div></header><AdminWorkspace preview /></div>;
}
