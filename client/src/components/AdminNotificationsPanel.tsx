import { useEffect, useState } from "react";
import { BellRing, Copy, ExternalLink, LoaderCircle, Send, ShieldAlert, Smartphone, TriangleAlert } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * /admin -> Утасны мэдэгдэл (2026-09-11). Where each staff member puts the
 * shop's push notifications on their own phone: install the free ntfy app,
 * scan their group's QR code, press "send a test".
 *
 * Only the caller's OWN groups are listed (notifications.mySubscriptions
 * decides that on the server from their role), so a store consultant cannot
 * subscribe to finance's topic by opening this screen.
 */

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдэл амжилтгүй боллоо.";

const APP_LINKS = [
  { label: "Android (Google Play)", href: "https://play.google.com/store/apps/details?id=io.heckel.ntfy" },
  { label: "iPhone (App Store)", href: "https://apps.apple.com/app/ntfy/id1625396347" },
  { label: "Android (F-Droid)", href: "https://f-droid.org/packages/io.heckel.ntfy/" },
];

function TopicQr({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: 176, errorCorrectionLevel: "M" })
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [value]);
  // White plate in both themes: phone cameras read dark-on-light codes.
  return (
    <div className="grid size-[188px] shrink-0 place-items-center rounded-2xl bg-white p-1.5 shadow-sm">
      {dataUrl ? <img src={dataUrl} alt="Бүртгүүлэх QR код" className="size-full" /> : <LoaderCircle className="animate-spin text-[#8a8f98]" size={18} />}
    </div>
  );
}

export default function AdminNotificationsPanel() {
  const { user } = useAuth();
  const subscriptionsQuery = trpc.notifications.mySubscriptions.useQuery();
  const sendTest = trpc.notifications.sendTestToMyGroup.useMutation();
  const [testingGroup, setTestingGroup] = useState<string | null>(null);

  const data = subscriptionsQuery.data;
  const isAdmin = user?.role === "admin";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Хууллаа.");
    } catch {
      toast.error("Хуулж чадсангүй — гараар сонгож хуулна уу.");
    }
  };

  const test = async (group: "admin" | "warehouse" | "finance" | "store") => {
    setTestingGroup(group);
    try {
      const result = await sendTest.mutateAsync({ group });
      if (result.ok) toast.success("Туршилт илгээлээ — утсаа шалгана уу.");
      else toast.error(result.error ?? "Илгээж чадсангүй.");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setTestingGroup(null);
    }
  };

  if (subscriptionsQuery.isLoading) return <p className="flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Уншиж байна…</p>;
  if (subscriptionsQuery.error) return <p className="rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(subscriptionsQuery.error)}</p>;
  if (!data) return null;

  return (
    <div className="grid gap-5">
      <ol className="grid gap-3 md:grid-cols-3">
        <li className="rounded-2xl bg-[var(--a-soft)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">АЛХАМ 1</p>
          <p className="mt-1 text-sm font-bold">ntfy апп суулгах</p>
          <p className="mt-1 text-xs leading-5 text-[var(--a-muted)]">Үнэгүй. Бүртгэл үүсгэх шаардлагагүй.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {APP_LINKS.map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-2.5 py-1 text-[11px] font-bold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)]">{link.label}<ExternalLink size={11} /></a>)}
          </div>
        </li>
        <li className="rounded-2xl bg-[var(--a-soft)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">АЛХАМ 2</p>
          <p className="mt-1 text-sm font-bold">Өөрийн бүлэгт бүртгүүлэх</p>
          <p className="mt-1 text-xs leading-5 text-[var(--a-muted)]">Доорх QR кодыг утасныхаа камераар уншуулна. Эсвэл апп дотор "+" дараад сэдвийн нэрийг хуулж оруулна (сервер: {data.serverUrl.replace(/^https?:\/\//, "")}).</p>
        </li>
        <li className="rounded-2xl bg-[var(--a-soft)] p-4">
          <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">АЛХАМ 3</p>
          <p className="mt-1 text-sm font-bold">Туршилт илгээх</p>
          <p className="mt-1 text-xs leading-5 text-[var(--a-muted)]">"Туршилт илгээх" дарахад хэдхэн секундэд утсан дээр мэдэгдэл ирнэ. iPhone дээр апп-ын мэдэгдлийг зөвшөөрсөн байх ёстой.</p>
        </li>
      </ol>

      {!data.configured && (
        <div className="flex gap-2.5 rounded-2xl bg-[var(--a-warn-soft)] p-4 text-xs leading-5 text-[var(--a-warn)]">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>Утасны мэдэгдэл хараахан тохируулагдаагүй байна. {isAdmin ? "Интеграцууд → Утасны мэдэгдэл (ntfy) хэсэгт бүлэг бүрт сэдэв үүсгэнэ үү." : "Админд хандана уу."}</p>
        </div>
      )}
      {data.configured && !data.active && (
        <div className="flex gap-2.5 rounded-2xl bg-[var(--a-warn-soft)] p-4 text-xs leading-5 text-[var(--a-warn)]">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>Мэдэгдэл түр унтраалттай байна — туршилт ажиллана, харин бодит захиалгын мэдэгдэл явахгүй. {isAdmin ? "Интеграцууд хэсгээс ntfy-г идэвхжүүлнэ үү." : ""}</p>
        </div>
      )}

      {data.groups.length === 0 && <p className="rounded-2xl bg-[var(--a-soft)] p-6 text-center text-xs text-[var(--a-muted)]">Таны эрхэд мэдэгдлийн бүлэг байхгүй.</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {data.groups.map(group => (
          <section key={group.group} className="rounded-3xl border border-[var(--a-border)] bg-[var(--a-card)] p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-[var(--a-info-soft)] text-[var(--a-info)]"><BellRing size={17} /></span>
              <div>
                <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-muted)]">БҮЛЭГ</p>
                <h3 className="font-bold">{group.label}</h3>
              </div>
            </div>
            {group.topic && group.webUrl ? (
              <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                <TopicQr value={group.webUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-[var(--a-muted)]">Сэдвийн нэр</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--a-soft)] px-2.5 py-2 text-[11px]">{group.topic}</code>
                    <button type="button" onClick={() => copy(group.topic!)} className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--a-border)] text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)]" aria-label="Сэдвийн нэрийг хуулах"><Copy size={13} /></button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.appUrl && <a href={group.appUrl} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--a-border)] px-3 py-2 text-[11px] font-extrabold text-[var(--a-text-soft)] hover:border-[var(--a-info)] hover:text-[var(--a-info)]"><Smartphone size={13} />Апп-д нээх</a>}
                    <button type="button" onClick={() => test(group.group)} disabled={testingGroup !== null} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-info)] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-60">
                      {testingGroup === group.group ? <LoaderCircle className="animate-spin" size={13} /> : <Send size={13} />}Туршилт илгээх
                    </button>
                  </div>
                  <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-[var(--a-muted)]"><ShieldAlert size={12} className="mt-0.5 shrink-0" />Сэдвийн нэрийг мэддэг хүн бүр мэдэгдлийг уншиж чадна — бусадтай хуваалцахгүй. Мэдэгдэлд харилцагчийн нэр, утас, хаяг ордоггүй.</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-[var(--a-soft)] p-4 text-xs text-[var(--a-muted)]">Энэ бүлгийн сэдэв үүсээгүй байна.{isAdmin ? " Интеграцууд → ntfy хэсгээс \"Сэдэв үүсгэх\" дарна уу." : " Админд хандана уу."}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
