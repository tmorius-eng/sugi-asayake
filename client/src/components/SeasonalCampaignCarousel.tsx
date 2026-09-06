import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Link } from "wouter";
import type { SiteMediaSlotKey } from "@shared/site-media";
import { useSiteText } from "@/hooks/useSiteText";

type Campaign = {
  eyebrow: string;
  title: string;
  emphasis: string;
  description: string;
  tone: string;
  // null: no bundled fallback photo for this slide (real seasonal lifestyle
  // photography, not a generic product shot) -- lets .seasonal-image's CSS
  // gradient show through until an admin uploads one for this slotKey.
  image: string | null;
  note: string;
  slotKey: SiteMediaSlotKey;
};

const campaigns: Campaign[] = [
  {
    eyebrow: "SUMMER CARE / 01",
    title: "Зуны өглөөг",
    emphasis: "зөөлнөөр эхэлье.",
    description: "Дулаан улирлын өдөр тутмын арчилгаанд тохирох цэвэрлэгээ, чийгшил, тайвшруулах хэрэгцээгээ нэг дороос нээгээрэй.",
    tone: "sun",
    image: null,
    note: "MORNING CARE EDIT",
    slotKey: "summer-slide-1",
  },
  {
    eyebrow: "SUMMER CARE / 02",
    title: "Өөрийнхөө хэмнэлийг",
    emphasis: "өнгөөр илэрхийл.",
    description: "Хөнгөн мэдрэмж, өөртөө итгэлтэй жижиг мөчүүд, өдөр бүрийн биеийн арчилгааны сонголтыг судлаарай.",
    tone: "coral",
    image: "/product-placeholder.svg",
    note: "COLORFUL DAILY EDIT",
    slotKey: "summer-slide-2",
  },
  {
    eyebrow: "SUMMER CARE / 03",
    title: "Гэр бүлээрээ",
    emphasis: "илүү тайван зун.",
    description: "Гэр бүл бүрийн өдөр тутмын эрүүл ахуй, арчилгааны сонголтыг SUGI ASAYAKE-ийн салбаруудаас асуугаарай.",
    tone: "sky",
    image: null,
    note: "FAMILY SUMMER EDIT",
    slotKey: "summer-slide-3",
  },
];

export default function SeasonalCampaignCarousel({ imageOverrides = {} }: { imageOverrides?: Partial<Record<SiteMediaSlotKey, string>> }) {
  const textFor = useSiteText();
  const [active, setActive] = useState(0);
  const campaign = campaigns[active];
  const campaignImage = imageOverrides[campaign.slotKey] || campaign.image;
  const campaignImageStyle = campaignImage ? { backgroundImage: `url(${campaignImage})` } : undefined;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;
    const timer = window.setInterval(() => setActive(current => (current + 1) % campaigns.length), 6000);
    return () => window.clearInterval(timer);
  }, []);

  const goTo = (index: number) => setActive((index + campaigns.length) % campaigns.length);

  return (
    <section className={`seasonal-section tone-${campaign.tone}`} aria-labelledby="summer-campaign-title" data-reveal>
      <div className="seasonal-topline"><span>{textFor("home-text-summer-number", "03")}</span><span>{textFor("home-text-summer-label", "ASAYAKE SUMMER / 2026")}</span><i /><span>{textFor("home-text-summer-note", "EDIT YOUR DAY")}</span></div>
      <div className="seasonal-carousel" aria-roledescription="carousel" aria-label="Зуны арчилгааны онцлох сонголтууд">
        <div className="seasonal-copy" key={campaign.eyebrow}>
          <p className="eyebrow"><Sparkles size={13} /> {campaign.eyebrow}</p>
          <h2 id="summer-campaign-title">{campaign.title}<br /><em>{campaign.emphasis}</em></h2>
          <p>{campaign.description}</p>
          <Link className="seasonal-link" href="/shop">Зуны сонголт харах <ArrowUpRight size={16} /></Link>
        </div>
        <div className="seasonal-image" role="img" aria-label={campaign.note} style={campaignImageStyle}>
          <div className="seasonal-image-shade" />
          <span>{campaign.note}</span>
          <strong>0{active + 1}</strong>
        </div>
        <div className="seasonal-controls">
          <button type="button" onClick={() => goTo(active - 1)} aria-label="Өмнөх зуны сонголт"><ChevronLeft size={19} /></button>
          <div role="tablist" aria-label="Зуны сонголтыг сонгох">
            {campaigns.map((item, index) => <button type="button" key={item.eyebrow} role="tab" aria-selected={index === active} aria-label={`${index + 1}-р зуны сонголт`} className={index === active ? "active" : ""} onClick={() => goTo(index)} />)}
          </div>
          <button type="button" onClick={() => goTo(active + 1)} aria-label="Дараагийн зуны сонголт"><ChevronRight size={19} /></button>
        </div>
      </div>
    </section>
  );
}
