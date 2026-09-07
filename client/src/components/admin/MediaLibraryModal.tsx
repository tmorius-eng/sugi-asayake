import { useState, type ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, ImageUp, LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Хүсэлт амжилтгүй боллоо.";
const PAGE_SIZE = 24;

/**
 * 2026-09-07 (WordPress-parity admin editor rebuild): the first real media
 * library this codebase has had -- every prior upload surface (product
 * image, site media slot, post cover) is "pick one new file, fill exactly
 * one URL slot, forget it happened." Dual-purpose exactly like WordPress's
 * own "Add Media" modal: opened either from the Featured Image box (result
 * sets the cover image) or from the editor's own "Add Media" toolbar button
 * (result inserts an <img> at the cursor) -- the caller decides what
 * `onSelect`'s url does, this component only ever picks or uploads one.
 */
export default function MediaLibraryModal({ open, onOpenChange, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();
  const libraryQuery = trpc.admin.mediaLibrary.useQuery({ search: search.trim() || undefined, page }, { enabled: open });
  const uploadMedia = trpc.admin.uploadMedia.useMutation({
    onSuccess: item => {
      utils.admin.mediaLibrary.invalidate();
      toast.success("Зураг байршууллаа.");
      onSelect(item.url);
      onOpenChange(false);
    },
    onError: error => toast.error(messageFrom(error)),
  });

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast.error("JPG, PNG, WEBP форматтай, 8 MB-аас бага зураг сонгоно уу.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      uploadMedia.mutate({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: String(reader.result) });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const items = libraryQuery.data?.items ?? [];
  const total = libraryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Медиа нэмэх</DialogTitle>
        <DialogDescription>Шинэ зураг байршуулах эсвэл өмнө байршуулсан зургаас сонгоно уу.</DialogDescription>
        <Tabs defaultValue="library" className="mt-2">
          <TabsList>
            <TabsTrigger value="upload">Байршуулах</TabsTrigger>
            <TabsTrigger value="library">Медиа сан</TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <label className="mt-3 flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 bg-[#f8f5ef] text-xs font-normal text-[#8b8c90] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">
              {uploadMedia.isPending ? <LoaderCircle className="animate-spin" size={22} /> : <ImageUp size={22} />}
              {uploadMedia.isPending ? "Байршуулж байна…" : "Зураг сонгох (JPG/PNG/WEBP, 8MB хүртэл)"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={uploadMedia.isPending} className="hidden" />
            </label>
          </TabsContent>
          <TabsContent value="library">
            <label className="mt-3 flex h-10 items-center gap-2 rounded-full border border-black/10 bg-[#fffdf9] px-4">
              <Search size={15} className="text-[#85868a]" />
              <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Файлын нэрээр хайх" className="w-full bg-transparent text-xs outline-none" />
            </label>
            {libraryQuery.isLoading && <p className="mt-6 flex items-center justify-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Ачаалж байна…</p>}
            {!libraryQuery.isLoading && items.length === 0 && <p className="mt-8 text-center text-sm text-[#707176]">Медиа сан хоосон байна. "Байршуулах" таб руу шилжиж эхний зургаа нэмээрэй.</p>}
            {items.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelect(item.url); onOpenChange(false); }}
                    className="group aspect-square overflow-hidden rounded-xl border border-black/8 transition hover:border-[#df1f3d]"
                    title={item.fileName}
                  >
                    <img src={item.url} alt={item.fileName} className="h-full w-full object-cover transition group-hover:scale-105" />
                  </button>
                ))}
              </div>
            )}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3 text-xs text-[#77787d]">
                <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1} className="grid size-8 place-items-center rounded-full border border-black/10 disabled:opacity-35"><ChevronLeft size={15} /></button>
                <span>{page} / {totalPages}</span>
                <button type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="grid size-8 place-items-center rounded-full border border-black/10 disabled:opacity-35"><ChevronRight size={15} /></button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
