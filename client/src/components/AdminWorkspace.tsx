import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FilePenLine, ImageUp, LayoutDashboard, ListChecks, LoaderCircle, PackagePlus, Pencil, Search, ShieldAlert, ShieldCheck, Star, Tags, Trash2, UserPlus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { downloadCsv } from "@/lib/csv";
import { trpc } from "@/lib/trpc";
import AdminBulkActionBar from "./AdminBulkActionBar";
import AdminDashboardHome from "./AdminDashboardHome";
import AdminGlobalSearch from "./AdminGlobalSearch";
import AdminOperationsPanel from "./AdminOperationsPanel";
import AdminReviewsPanel from "./AdminReviewsPanel";
import AdminRoutinesPanel from "./AdminRoutinesPanel";
import AdminSecurityCenter from "./AdminSecurityCenter";
import AdminUserDetailDrawer from "./AdminUserDetailDrawer";
import ContentMediaPanel from "./ContentMediaPanel";

type ProductRow = {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  brand: string | null;
  shortDescription: string | null;
  description: string | null;
  sku: string;
  priceMnt: number;
  compareAtPriceMnt: number | null;
  imageUrl: string | null;
  galleryJson: string | null;
  stockQuantity: number;
  isPublished: boolean;
  updatedAt: Date;
  categoryName: string | null;
  skinType: "dry" | "oily" | "combination" | "sensitive" | "normal" | null;
  skinConcerns: string | null;
  interiorStyle: string | null;
};

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: Date;
};

type ProductForm = {
  id?: number;
  categoryId: string;
  name: string;
  slug: string;
  brand: string;
  shortDescription: string;
  description: string;
  sku: string;
  priceMnt: string;
  compareAtPriceMnt: string;
  imageUrl: string;
  stockQuantity: string;
  isPublished: boolean;
  skinType: "" | "dry" | "oily" | "combination" | "sensitive" | "normal";
  skinConcerns: string;
  interiorStyle: string;
};

type CategoryForm = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  sortOrder: string;
  isActive: boolean;
};

type StaffInvitationRow = {
  id: number;
  email: string;
  role: "user" | "staff" | "admin";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

const previewProducts: ProductRow[] = [
  { id: 1, categoryId: 1, name: "Hada Labo Gokujyun Lotion", slug: "hada-labo-gokujyun-lotion", brand: "Hada Labo", shortDescription: null, description: null, sku: "HADA-GL-170", priceMnt: 29800, compareAtPriceMnt: null, imageUrl: null, galleryJson: null, stockQuantity: 34, isPublished: true, updatedAt: new Date(), categoryName: "Арьс арчилгаа", skinType: "dry", skinConcerns: "aging", interiorStyle: null },
  { id: 2, categoryId: 2, name: "Shiseido Tsubaki Premium Repair", slug: "shiseido-tsubaki-premium-repair", brand: "Shiseido", shortDescription: null, description: null, sku: "TSUB-PR-490", priceMnt: 42500, compareAtPriceMnt: null, imageUrl: null, galleryJson: null, stockQuantity: 18, isPublished: true, updatedAt: new Date(), categoryName: "Үс ба бие", skinType: null, skinConcerns: null, interiorStyle: null },
  { id: 3, categoryId: 1, name: "Rohto Melano CC Essence", slug: "rohto-melano-cc-essence", brand: "Rohto", shortDescription: null, description: null, sku: "ROHTO-MCC-20", priceMnt: 35900, compareAtPriceMnt: null, imageUrl: null, galleryJson: null, stockQuantity: 0, isPublished: false, updatedAt: new Date(), categoryName: "Арьс арчилгаа", skinType: "oily", skinConcerns: "acne", interiorStyle: null },
];

const previewCategories: CategoryRow[] = [
  { id: 1, name: "Арьс арчилгаа", slug: "skin-care", description: null, imageUrl: null, sortOrder: 1, isActive: true, updatedAt: new Date() },
  { id: 2, name: "Үс ба бие", slug: "hair-body", description: null, imageUrl: null, sortOrder: 2, isActive: true, updatedAt: new Date() },
];

const formatMnt = (amount: number) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;
const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const emptyProduct = (): ProductForm => ({ categoryId: "", name: "", slug: "", brand: "", shortDescription: "", description: "", sku: "", priceMnt: "", compareAtPriceMnt: "", imageUrl: "", stockQuantity: "0", isPublished: false, skinType: "", skinConcerns: "", interiorStyle: "" });
const skinTypeLabels: Record<string, string> = { dry: "Хуурай", oily: "Тослог", combination: "Холимог", sensitive: "Мэдрэмтгий", normal: "Хэвийн" };
const emptyCategory = (): CategoryForm => ({ name: "", slug: "", description: "", imageUrl: "", sortOrder: "0", isActive: true });
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.";

export default function AdminWorkspace({ preview = false }: { preview?: boolean }) {
  const { user: currentUser } = useAuth();
  const isFullAdmin = preview || currentUser?.role === "admin";
  const [section, setSection] = useState<"dashboard" | "products" | "orders" | "posts" | "reviews" | "routines" | "users" | "media" | "security">(() => new URLSearchParams(window.location.search).get("adminSection") === "media" ? "media" : "dashboard");
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState<"product" | "category" | "user" | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "staff" | "admin">("staff");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  const [showProductExport, setShowProductExport] = useState(false);
  const [exportCategoryFilter, setExportCategoryFilter] = useState("all");
  const [exportPublishedFilter, setExportPublishedFilter] = useState<"all" | "published" | "draft">("all");
  const utils = trpc.useUtils();
  const productsQuery = trpc.admin.products.useQuery(undefined, { enabled: !preview });
  const categoriesQuery = trpc.admin.categories.useQuery(undefined, { enabled: !preview });
  const usersQuery = trpc.admin.users.useQuery(undefined, { enabled: !preview });
  const invitationsQuery = trpc.admin.staffInvitations.useQuery(undefined, { enabled: !preview });

  const refreshCatalog = async () => {
    await Promise.all([utils.admin.products.invalidate(), utils.admin.categories.invalidate(), utils.catalog.list.invalidate()]);
  };

  const createProduct = trpc.admin.createProduct.useMutation({ onSuccess: refreshCatalog });
  const updateProduct = trpc.admin.updateProduct.useMutation({ onSuccess: refreshCatalog });
  const deleteProduct = trpc.admin.deleteProduct.useMutation({ onSuccess: refreshCatalog });
  const bulkUpdateProductPublishStatus = trpc.admin.bulkUpdateProductPublishStatus.useMutation({ onSuccess: refreshCatalog });
  const createCategory = trpc.admin.createCategory.useMutation({ onSuccess: refreshCatalog });
  const updateCategory = trpc.admin.updateCategory.useMutation({ onSuccess: refreshCatalog });
  const uploadProductImage = trpc.admin.uploadProductImage.useMutation();
  const inviteStaff = trpc.admin.inviteStaff.useMutation();
  const revokeStaffInvitation = trpc.admin.revokeStaffInvitation.useMutation();
  const updateUserRole = trpc.admin.updateUserRole.useMutation();

  const products: ProductRow[] = preview ? previewProducts : (productsQuery.data ?? []);
  const categories: CategoryRow[] = preview ? previewCategories : (categoriesQuery.data ?? []);
  const users = preview ? [
    { id: 1, name: "SUGI ASAYAKE Owner", email: "owner@asayake.mn", role: "admin", createdAt: new Date(), lastSignedIn: new Date(), suspendedAt: null, suspendedReason: null },
    { id: 2, name: "Store manager", email: "manager@asayake.mn", role: "user", createdAt: new Date(), lastSignedIn: new Date(), suspendedAt: null, suspendedReason: null },
  ] : (usersQuery.data ?? []);
  const invitations: StaffInvitationRow[] = preview ? [
    { id: 1, email: "manager@asayake.mn", role: "user", status: "pending", expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), acceptedAt: null, createdAt: new Date() },
  ] : (invitationsQuery.data ?? []);

  const filteredProducts = useMemo(() => products.filter(product => [product.name, product.sku, product.categoryName ?? ""].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [products, query]);
  // The catalog is ~940 real products (see PRODUCT-IMPORT.md) — rendering
  // every row unpaginated made the edit table an endless scroll. Paged, not
  // infinite-scrolled: an admin editing catalog data wants a stable, countable
  // list, not rows shifting under them. "Select all" (toggleSelectAllProducts
  // above) deliberately still operates on the full filtered set, not just the
  // visible page — bulk-publishing "everything matching this search" is the
  // whole point of that control.
  const PRODUCTS_PAGE_SIZE = 25;
  const [productPage, setProductPage] = useState(1);
  useEffect(() => { setProductPage(1); }, [query]);
  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PAGE_SIZE));
  useEffect(() => { if (productPage > productTotalPages) setProductPage(productTotalPages); }, [productTotalPages, productPage]);
  const pagedProducts = useMemo(() => filteredProducts.slice((productPage - 1) * PRODUCTS_PAGE_SIZE, productPage * PRODUCTS_PAGE_SIZE), [filteredProducts, productPage]);
  const filteredUsers = useMemo(() => users.filter(user => [user.name ?? "", user.email ?? ""].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [users, query]);
  const isCatalogBusy = createProduct.isPending || updateProduct.isPending || deleteProduct.isPending || createCategory.isPending || updateCategory.isPending;
  const isBulkProductBusy = bulkUpdateProductPublishStatus.isPending;
  const isUserBusy = inviteStaff.isPending || revokeStaffInvitation.isPending || updateUserRole.isPending;

  const refreshUsers = async () => {
    await Promise.all([utils.admin.users.invalidate(), utils.admin.staffInvitations.invalidate()]);
  };

  const openProductComposer = (product?: ProductRow) => {
    if (product) {
      setProductForm({ id: product.id, categoryId: String(product.categoryId), name: product.name, slug: product.slug, brand: product.brand ?? "", shortDescription: product.shortDescription ?? "", description: product.description ?? "", sku: product.sku, priceMnt: String(product.priceMnt), compareAtPriceMnt: product.compareAtPriceMnt ? String(product.compareAtPriceMnt) : "", imageUrl: product.imageUrl ?? "", stockQuantity: String(product.stockQuantity), isPublished: product.isPublished, skinType: product.skinType ?? "", skinConcerns: product.skinConcerns ?? "", interiorStyle: product.interiorStyle ?? "" });
    } else {
      setProductForm({ ...emptyProduct(), categoryId: categories[0] ? String(categories[0].id) : "" });
    }
    setComposer("product");
  };

  const openCategoryComposer = (category?: CategoryRow) => {
    setCategoryForm(category ? { id: category.id, name: category.name, slug: category.slug, description: category.description ?? "", imageUrl: category.imageUrl ?? "", sortOrder: String(category.sortOrder), isActive: category.isActive } : emptyCategory());
    setComposer("category");
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview) {
      toast.message("Preview горим", { description: "Бодит хадгалалт зөвхөн хамгаалагдсан /admin хэсэгт ажиллана." });
      return;
    }
    const categoryId = Number(productForm.categoryId);
    const priceMnt = Number(productForm.priceMnt);
    const stockQuantity = Number(productForm.stockQuantity);
    if (!categoryId || Number.isNaN(priceMnt) || Number.isNaN(stockQuantity)) {
      toast.error("Ангилал, үнэ, үлдэгдлийг зөв оруулна уу.");
      return;
    }
    const payload = {
      categoryId,
      name: productForm.name.trim(),
      slug: productForm.slug.trim(),
      brand: productForm.brand.trim() || null,
      shortDescription: productForm.shortDescription.trim() || null,
      description: productForm.description.trim() || null,
      sku: productForm.sku.trim(),
      priceMnt,
      compareAtPriceMnt: productForm.compareAtPriceMnt ? Number(productForm.compareAtPriceMnt) : null,
      imageUrl: productForm.imageUrl || null,
      stockQuantity,
      isPublished: productForm.isPublished,
      skinType: productForm.skinType || null,
      skinConcerns: productForm.skinConcerns.trim() || null,
      interiorStyle: productForm.interiorStyle.trim() || null,
    };
    try {
      if (productForm.id) {
        await updateProduct.mutateAsync({ id: productForm.id, ...payload });
        toast.success("Бүтээгдэхүүнийг шинэчиллээ.");
      } else {
        await createProduct.mutateAsync(payload);
        toast.success("Шинэ бүтээгдэхүүнийг хадгаллаа.");
      }
      setComposer(null);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview) {
      toast.message("Preview горим", { description: "Ангиллын бодит хадгалалт зөвхөн хамгаалагдсан /admin хэсэгт ажиллана." });
      return;
    }
    const sortOrder = Number(categoryForm.sortOrder);
    if (Number.isNaN(sortOrder)) {
      toast.error("Эрэмбийн утгыг тоогоор оруулна уу.");
      return;
    }
    const payload = { name: categoryForm.name.trim(), slug: categoryForm.slug.trim(), description: categoryForm.description.trim() || null, imageUrl: categoryForm.imageUrl.trim() || null, sortOrder, isActive: categoryForm.isActive };
    try {
      if (categoryForm.id) {
        await updateCategory.mutateAsync({ id: categoryForm.id, ...payload });
        toast.success("Ангиллыг шинэчиллээ.");
      } else {
        await createCategory.mutateAsync(payload);
        toast.success("Шинэ ангиллыг хадгаллаа.");
      }
      setComposer(null);
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const onImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) {
      toast.message("Preview горим", { description: "Зураг байршуулахын тулд admin эрхээр нэвтэрнэ үү." });
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast.error("JPG, PNG, WEBP форматтай, 8 MB-аас бага зураг сонгоно уу.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const stored = await uploadProductImage.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: String(reader.result) });
        setProductForm(current => ({ ...current, imageUrl: stored.url }));
        toast.success("Зураг SUGI сан руу хадгалагдлаа.");
      } catch (error) {
        toast.error(messageFrom(error));
      }
    };
    reader.readAsDataURL(file);
  };

  const removeProduct = async (product: ProductRow) => {
    if (preview) {
      toast.message("Preview горим", { description: "Бодит устгал зөвхөн хамгаалагдсан /admin хэсэгт ажиллана." });
      return;
    }
    if (!window.confirm(`“${product.name}” бүтээгдэхүүнийг устгах уу? Энэ үйлдэл буцаах боломжгүй.`)) return;
    try {
      await deleteProduct.mutateAsync({ id: product.id });
      toast.success("Бүтээгдэхүүнийг устгалаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const toggleProductSelection = (id: number) => setSelectedProductIds(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAllProducts = () => setSelectedProductIds(current =>
    current.size === filteredProducts.length ? new Set() : new Set(filteredProducts.map(product => product.id))
  );

  const applyBulkPublish = async (isPublished: boolean) => {
    if (preview) {
      toast.message("Preview горим", { description: "Багц үйлдэл зөвхөн хамгаалагдсан /admin хэсэгт ажиллана." });
      return;
    }
    try {
      const result = await bulkUpdateProductPublishStatus.mutateAsync({ ids: Array.from(selectedProductIds), isPublished });
      if (result.failed.length > 0) toast.error(`${result.succeeded.length} шинэчлэгдлээ, ${result.failed.length} амжилтгүй.`);
      else toast.success(`${result.succeeded.length} бүтээгдэхүүний төлөв шинэчлэгдлээ.`);
      setSelectedProductIds(new Set());
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const exportProductsCsv = () => {
    const rows = products
      .filter(product => exportCategoryFilter === "all" || String(product.categoryId) === exportCategoryFilter)
      .filter(product => exportPublishedFilter === "all" || (exportPublishedFilter === "published" ? product.isPublished : !product.isPublished))
      .map(product => [product.id, product.name, product.sku, product.categoryName ?? "", product.priceMnt, product.stockQuantity, product.isPublished ? "Нийтлэгдсэн" : "Ноорог"]);
    if (rows.length === 0) {
      toast.error("Шүүлтэд тохирох бүтээгдэхүүн алга.");
      return;
    }
    downloadCsv(`sugi-products-${new Date().toISOString().slice(0, 10)}.csv`, ["ID", "Нэр", "SKU", "Ангилал", "Үнэ (MNT)", "Үлдэгдэл", "Төлөв"], rows);
  };

  const sendStaffInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview) {
      toast.message("Preview горим", { description: "Бодит урилга зөвхөн хамгаалагдсан /admin хэсэгт үүснэ." });
      return;
    }
    try {
      const invitation = await inviteStaff.mutateAsync({ email: inviteEmail.trim(), role: inviteRole, origin: window.location.origin });
      await refreshUsers();
      setLastInviteUrl(invitation.inviteUrl);
      setInviteEmail("");
      toast.success(invitation.ownerAlertSent ? "Урилга үүсгэж, эзэнд мэдэгдэл илгээлээ." : "Урилга үүслээ. Доорх холбоосыг аюулгүйгээр дамжуулна уу.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const changeUserRole = async (userId: number, role: "user" | "staff" | "admin") => {
    if (preview) {
      toast.message("Preview горим", { description: "Эрх солих үйлдэл зөвхөн хамгаалагдсан /admin хэсэгт ажиллана." });
      return;
    }
    try {
      await updateUserRole.mutateAsync({ userId, role });
      await refreshUsers();
      toast.success("Хэрэглэгчийн эрхийг шинэчиллээ.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const revokeInvitation = async (id: number) => {
    if (preview) {
      toast.message("Preview горим", { description: "Урилга цуцлах үйлдэл зөвхөн хамгаалагдсан /admin хэсэгт ажиллана." });
      return;
    }
    try {
      await revokeStaffInvitation.mutateAsync({ id });
      await refreshUsers();
      toast.success("Урилгыг цуцаллаа.");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  return (
    <div className="min-h-full bg-[#f8f5ef] p-4 sm:p-7">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold tracking-[.17em] text-[#df1f3d]">{preview ? "ADMIN UI PROTOTYPE" : "SUGI ASAYAKE OPERATIONS"}</p>
            <h1 className="mt-2 font-[var(--font-display)] text-4xl font-semibold tracking-[-.08em] sm:text-5xl">Дэлгүүрийн удирдлага.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#707176]">Бүтээгдэхүүн, шинэ мэдээ, хэрэглэгч, захиалгын мэдээлэл нэг хяналтын цэгт.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminGlobalSearch
              preview={preview}
              onSelectProduct={sku => { setSection("products"); setQuery(sku); setComposer(null); }}
              onSelectOrder={orderNumber => { setSection("orders"); setQuery(orderNumber); setComposer(null); }}
              onSelectUser={emailOrName => { setSection("users"); setQuery(emailOrName); setComposer(null); }}
            />
            {section === "products" && <button type="button" onClick={() => setShowProductExport(current => !current)} className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-3 text-xs font-bold text-[#57585e] transition hover:-translate-y-0.5 hover:border-[#df1f3d] hover:text-[#df1f3d] active:scale-[.97]"><Download size={15} />Экспорт</button>}
            {section === "products" && <button type="button" onClick={() => openCategoryComposer()} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#df1f3d]/25 bg-white px-4 py-3 text-xs font-bold text-[#b41831] transition hover:-translate-y-0.5 hover:border-[#df1f3d] active:scale-[.97]"><Tags size={15} />Ангилал</button>}
            {(section === "products" || (section === "users" && isFullAdmin)) && <button type="button" onClick={() => section === "products" ? openProductComposer() : setComposer("user")} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]">{section === "products" ? <PackagePlus size={16} /> : <UserPlus size={16} />}{section === "products" ? "Бүтээгдэхүүн нэмэх" : "Ажилтан урих"}</button>}
          </div>
        </div>
        {preview && <div className="mb-6 flex gap-3 rounded-2xl border border-[#e9ba62] bg-[#fff5dd] p-4 text-xs leading-5 text-[#6c531f]"><ShieldCheck className="mt-0.5 shrink-0" size={17} /><p><strong>Preview only.</strong> Энэ дэлгэц нь удирдлагын интерфэйсийн загвар юм. Бодит <code>/admin</code> зам нь нэвтэрсэн, <code>admin</code> эрхтэй хэрэглэгчдэд хамгаалагдсан.</p></div>}
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="rounded-3xl bg-[#17181b] p-3 text-white shadow-[0_16px_34px_rgba(20,22,24,.16)]">
            <div className="border-b border-white/12 px-3 py-4"><p className="text-[10px] font-extrabold tracking-[.15em] text-[#f0b52d]">COMMERCE ADMIN</p><p className="mt-1 text-sm text-white/65">Custom backend ready</p></div>
            <nav className="mt-3 grid gap-1">{[{ key: "dashboard", label: "Хянах самбар", Icon: LayoutDashboard }, { key: "products", label: "Бүтээгдэхүүн", Icon: PackagePlus }, { key: "orders", label: "Захиалга", Icon: CheckCircle2 }, { key: "posts", label: "Шинэ мэдээ", Icon: FilePenLine }, { key: "reviews", label: "Сэтгэгдэл", Icon: Star }, { key: "routines", label: "Routine", Icon: ListChecks }, { key: "media", label: "Content & Media", Icon: ImageUp }, ...(isFullAdmin ? [{ key: "users", label: "Хэрэглэгч", Icon: UsersRound }, { key: "security", label: "Аюулгүй байдал", Icon: ShieldAlert }] : [])].map(({ key, label, Icon }) => <button type="button" key={key} onClick={() => { setSection(key as typeof section); setQuery(""); setComposer(null); }} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${section === key ? "bg-white text-[#17181b]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon size={17} />{label}</button>)}</nav>
            <div className="mt-7 rounded-2xl bg-white/8 p-4"><span className="text-[10px] font-extrabold tracking-[.14em] text-[#f0b52d]">ACCESS</span><p className="mt-2 text-xs leading-5 text-white/66">Нэвтэрсэн админ л каталог, зураг, хэрэглэгчийн эрхийг өөрчилж чадна.</p></div>
          </aside>
          <section className="min-w-0 rounded-3xl bg-white p-5 shadow-[0_16px_34px_rgba(20,22,24,.05)] sm:p-7">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.06em]">{section === "dashboard" ? "Хянах самбар" : section === "products" ? "Бүтээгдэхүүний сан" : section === "orders" ? "Захиалгын гүйцэтгэл" : section === "posts" ? "Шинэ бүтээгдэхүүний пост" : section === "reviews" ? "Сэтгэгдэл ба үнэлгээ" : section === "routines" ? "Routine (арчилгааны дараалал)" : section === "media" ? "Content & Media" : section === "security" ? "Аюулгүй байдал" : "Хэрэглэгч ба эрх"}</h2><p className="mt-1 text-xs text-[#77787d]">{section === "dashboard" ? "Дэлгүүрийн ерөнхий байдал нэг дэлгэцэд" : section === "products" ? "SKU, үнэ, үлдэгдэл, нийтлэх төлөв" : section === "orders" ? "Төлбөрийн төлөв, хүргэлтийн явц, захиалгын мэдээлэл" : section === "posts" ? "Бодитоор хадгалагдах шинэ бүтээгдэхүүний мэдээ" : section === "reviews" ? "Баталгаажсан худалдан авалтын сэтгэгдэл, жижиг moderation" : section === "routines" ? "Алхам дараалалтай бүтээгдэхүүний багц, идэвхтэй хямдралтай" : section === "media" ? "Нүүр хуудас болон campaign зургаа кодгүйгээр солих" : section === "security" ? "Admin аудит лог болон нэвтрэлтийн түүх" : "Шинэ хэрэглэгчийг урих болон staff/admin эрх удирдах"}</p></div>
              {section !== "dashboard" && section !== "posts" && section !== "reviews" && section !== "routines" && section !== "media" && section !== "security" && <label className="flex h-10 items-center gap-2 rounded-full border border-black/10 bg-[#fffdf9] px-4"><Search size={15} className="text-[#85868a]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={section === "users" ? "Нэр эсвэл имэйл хайх" : section === "orders" ? "Дугаар, хэрэглэгч, утас хайх" : "Нэр, SKU хайх"} className="w-full bg-transparent text-xs outline-none" /></label>}
            </div>
            {section === "dashboard" && <AdminDashboardHome preview={preview} onNavigate={target => { setSection(target); setQuery(""); }} />}
            {section === "security" && !preview && <AdminSecurityCenter />}
            {section === "security" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд аудит лог харагдахгүй.</div>}
            {section === "reviews" && !preview && <AdminReviewsPanel />}
            {section === "reviews" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд сэтгэгдэл харагдахгүй.</div>}
            {section === "routines" && !preview && <AdminRoutinesPanel />}
            {section === "routines" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд Routine удирдлага харагдахгүй.</div>}
            {section === "products" && <>
              {!preview && (productsQuery.isLoading || categoriesQuery.isLoading) && <div className="mb-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Каталогийн мэдээллийг уншиж байна…</div>}
              {!preview && (productsQuery.error || categoriesQuery.error) && <div className="mb-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(productsQuery.error ?? categoriesQuery.error)}</div>}
              {showProductExport && <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f8f5ef] p-4"><label className="grid gap-1.5 text-xs font-bold">Ангилал<select value={exportCategoryFilter} onChange={event => setExportCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold">Төлөв<select value={exportPublishedFilter} onChange={event => setExportPublishedFilter(event.target.value as typeof exportPublishedFilter)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option><option value="published">Нийтлэгдсэн</option><option value="draft">Ноорог</option></select></label><button type="button" onClick={exportProductsCsv} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#17181b] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Download size={14} />CSV татах</button></div>}
              <div className="mb-5 flex flex-wrap gap-2">{categories.map(category => <button key={category.id} type="button" onClick={() => openCategoryComposer(category)} className="inline-flex items-center gap-1.5 rounded-full bg-[#f8f5ef] px-3 py-1.5 text-[11px] font-bold text-[#57585e] transition hover:bg-[#fff0f2] hover:text-[#a51630]"><Tags size={12} />{category.name}<Pencil size={11} /></button>)}{categories.length === 0 && <button type="button" onClick={() => openCategoryComposer()} className="rounded-full border border-dashed border-[#df1f3d]/40 px-3 py-1.5 text-[11px] font-bold text-[#a51630]">Эхний ангиллаа үүсгэх</button>}</div>
              <AdminBulkActionBar count={selectedProductIds.size} onClear={() => setSelectedProductIds(new Set())}>
                <button type="button" disabled={isBulkProductBusy} onClick={() => applyBulkPublish(true)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Нийтлэх</button>
                <button type="button" disabled={isBulkProductBusy} onClick={() => applyBulkPublish(false)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Ноорог болгох</button>
              </AdminBulkActionBar>
              <div className="overflow-x-auto"><table className="min-w-[740px] w-full border-separate border-spacing-0 text-left"><thead><tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]"><th className="w-8 border-b border-black/8 pb-3"><input type="checkbox" checked={selectedProductIds.size > 0 && selectedProductIds.size === filteredProducts.length} onChange={toggleSelectAllProducts} aria-label="Бүгдийг сонгох" className="size-4 accent-[#df1f3d]" /></th><th className="border-b border-black/8 pb-3">БҮТЭЭГДЭХҮҮН</th><th className="border-b border-black/8 pb-3">АНГИЛАЛ</th><th className="border-b border-black/8 pb-3">ҮНЭ</th><th className="border-b border-black/8 pb-3">ҮЛДЭГДЭЛ</th><th className="border-b border-black/8 pb-3">ТӨЛӨВ</th><th className="border-b border-black/8 pb-3" /></tr></thead><tbody>{pagedProducts.map(product => <tr key={product.id} className="group text-sm"><td className="border-b border-black/6 py-4"><input type="checkbox" checked={selectedProductIds.has(product.id)} onChange={() => toggleProductSelection(product.id)} aria-label={`${product.name} сонгох`} className="size-4 accent-[#df1f3d]" /></td><td className="border-b border-black/6 py-4"><strong className="block">{product.name}</strong><small className="mt-1 block text-[10px] font-bold tracking-[.08em] text-[#85868a]">{product.sku}</small></td><td className="border-b border-black/6 py-4 text-xs text-[#6f7075]">{product.categoryName ?? "Ангилалгүй"}</td><td className="border-b border-black/6 py-4 font-bold">{formatMnt(product.priceMnt)}</td><td className="border-b border-black/6 py-4"><span className={product.stockQuantity === 0 ? "font-bold text-[#df1f3d]" : "font-bold"}>{product.stockQuantity} ш</span></td><td className="border-b border-black/6 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${product.isPublished ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#fff0d2] text-[#9b6417]"}`}>{product.isPublished ? "Нийтлэгдсэн" : "Ноорог"}</span></td><td className="border-b border-black/6 py-4 text-right"><div className="flex justify-end gap-1"><button type="button" disabled={isCatalogBusy} onClick={() => openProductComposer(product)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#df1f3d]" aria-label={`${product.name} засах`}><Eye size={16} /></button><button type="button" disabled={isCatalogBusy} onClick={() => removeProduct(product)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label={`${product.name} устгах`}><Trash2 size={15} /></button></div></td></tr>)}{filteredProducts.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-[#77787d]">{query ? "Хайлтад тохирох бүтээгдэхүүн олдсонгүй." : "Одоогоор бүтээгдэхүүн алга. Ангилал үүсгээд эхний бүтээгдэхүүнээ нэмээрэй."}</td></tr>}</tbody></table></div>
              {filteredProducts.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#77787d]">
                <span>{(productPage - 1) * PRODUCTS_PAGE_SIZE + 1}–{Math.min(productPage * PRODUCTS_PAGE_SIZE, filteredProducts.length)} / {filteredProducts.length} бүтээгдэхүүн</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setProductPage(current => Math.max(1, current - 1))} disabled={productPage === 1} className="grid size-8 place-items-center rounded-full border border-black/10 text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Өмнөх хуудас"><ChevronLeft size={15} /></button>
                  <span className="min-w-16 text-center font-bold text-[#17181b]">{productPage} / {productTotalPages}</span>
                  <button type="button" onClick={() => setProductPage(current => Math.min(productTotalPages, current + 1))} disabled={productPage === productTotalPages} className="grid size-8 place-items-center rounded-full border border-black/10 text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Дараагийн хуудас"><ChevronRight size={15} /></button>
                </div>
              </div>}
            </>}
            {section === "orders" && <AdminOperationsPanel section="orders" preview={preview} query={query} />}
            {section === "posts" && <AdminOperationsPanel section="posts" preview={preview} />}
            {section === "media" && <ContentMediaPanel preview={preview} />}
            {section === "users" && <div className="overflow-x-auto"><table className="min-w-[720px] w-full border-separate border-spacing-0 text-left"><thead><tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]"><th className="border-b border-black/8 pb-3">ХЭРЭГЛЭГЧ</th><th className="border-b border-black/8 pb-3">ЭРХ</th><th className="border-b border-black/8 pb-3">ТӨЛӨВ</th><th className="border-b border-black/8 pb-3">СҮҮЛД НЭВТЭРСЭН</th><th className="border-b border-black/8 pb-3" /></tr></thead><tbody>{filteredUsers.map(user => <tr key={user.id} className="text-sm"><td className="border-b border-black/6 py-4"><strong className="block">{user.name ?? "Нэр оруулаагүй"}</strong><small className="mt-1 block text-xs text-[#77787d]">{user.email ?? "Имэйл байхгүй"}</small></td><td className="border-b border-black/6 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${user.role === "admin" ? "bg-[#fff0d2] text-[#9b6417]" : user.role === "staff" ? "bg-[#e6f0fb] text-[#2c5a91]" : "bg-[#edf0f5] text-[#505d70]"}`}>{user.role === "admin" ? "Admin" : user.role === "staff" ? "Staff" : "User"}</span></td><td className="border-b border-black/6 py-4">{user.suspendedAt ? <span className="rounded-full bg-[#fff0f2] px-2.5 py-1 text-[10px] font-extrabold text-[#a51630]">Түр хаагдсан</span> : <span className="rounded-full bg-[#e7f2ec] px-2.5 py-1 text-[10px] font-extrabold text-[#2c7650]">Идэвхтэй</span>}</td><td className="border-b border-black/6 py-4 text-xs text-[#6f7075]">{user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleDateString("mn-MN") : "—"}</td><td className="border-b border-black/6 py-4 text-right">{!preview && <button type="button" onClick={() => setSelectedUserId(user.id)} className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-bold text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">Дэлгэрэнгүй</button>}</td></tr>)}{filteredUsers.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-sm text-[#77787d]">Хэрэглэгч олдсонгүй.</td></tr>}</tbody></table></div>}

            {section === "users" && <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_.92fr]">
              <section className="rounded-3xl bg-[#f8f5ef] p-5">
                <p className="text-[10px] font-extrabold tracking-[.14em] text-[#3970a7]">ROLE MANAGEMENT</p>
                <p className="mt-2 text-xs leading-5 text-[#707176]">Админ эрх нь каталог, захиалга, багийн урилгыг удирдах боломж олгоно. Өөрийн эрхийг энэ дэлгэцээс бууруулахгүй.</p>
                <div className="mt-4 grid gap-2">{filteredUsers.map(user => <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3"><div className="min-w-0"><strong className="block truncate text-xs">{user.name ?? user.email ?? "Хэрэглэгч"}</strong><span className="block truncate text-[11px] text-[#77787d]">{user.email ?? "Имэйл байхгүй"}</span></div>{preview ? <span className="text-xs font-bold">{user.role}</span> : <select value={user.role} disabled={isUserBusy} onChange={event => changeUserRole(user.id, event.target.value as "user" | "staff" | "admin")} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs font-bold outline-none focus:border-[#df1f3d]"><option value="user">User</option><option value="staff">Staff</option><option value="admin">Admin</option></select>}</div>)}</div>
              </section>
              <section className="rounded-3xl border border-[#df1f3d]/15 bg-[#fff5f6] p-5">
                <p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">ACTIVE INVITATIONS</p>
                <div className="mt-4 grid gap-2">{invitations.map(invitation => <div key={invitation.id} className="rounded-2xl bg-white px-3 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-xs">{invitation.email}</strong><span className="mt-1 block text-[11px] text-[#77787d]">{invitation.role === "admin" ? "Admin" : invitation.role === "staff" ? "Staff" : "User"} · {invitation.status} · {new Date(invitation.expiresAt).toLocaleDateString("mn-MN")}</span></div>{invitation.status === "pending" && <button type="button" disabled={isUserBusy} onClick={() => revokeInvitation(invitation.id)} className="shrink-0 text-[11px] font-bold text-[#a51630] disabled:opacity-50">Цуцлах</button>}</div></div>)}{invitations.length === 0 && <p className="rounded-2xl bg-white px-3 py-5 text-center text-xs text-[#77787d]">Идэвхтэй урилга алга.</p>}</div>
              </section>
            </div>}

            {composer === "product" && <form onSubmit={saveProduct} className="mt-7 rounded-3xl border border-[#df1f3d]/25 bg-[#fff5f6] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">PRODUCT {productForm.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{productForm.id ? "Бүтээгдэхүүн засах" : "Шинэ бүтээгдэхүүн нэмэх"}</h3></div><button type="button" onClick={() => setComposer(null)} className="text-xs font-bold text-[#707176]">Хаах</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={productForm.name} onChange={event => setProductForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">SKU<input required value={productForm.sku} onChange={event => setProductForm(current => ({ ...current, sku: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={productForm.slug} onChange={event => setProductForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Ангилал<select required value={productForm.categoryId} onChange={event => setProductForm(current => ({ ...current, categoryId: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]"><option value="" disabled>Сонгох</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold">Брэнд<input value={productForm.brand} onChange={event => setProductForm(current => ({ ...current, brand: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Үнэ (₮)<input required min="0" type="number" value={productForm.priceMnt} onChange={event => setProductForm(current => ({ ...current, priceMnt: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Хуучин үнэ (сонголтоор)<input min="0" type="number" value={productForm.compareAtPriceMnt} onChange={event => setProductForm(current => ({ ...current, compareAtPriceMnt: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Үлдэгдэл<input required min="0" type="number" value={productForm.stockQuantity} onChange={event => setProductForm(current => ({ ...current, stockQuantity: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Товч тайлбар<textarea value={productForm.shortDescription} onChange={event => setProductForm(current => ({ ...current, shortDescription: event.target.value }))} className="min-h-20 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Дэлгэрэнгүй тайлбар<textarea value={productForm.description} onChange={event => setProductForm(current => ({ ...current, description: event.target.value }))} className="min-h-28 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><div className="sm:col-span-2 rounded-2xl bg-white/60 p-3"><p className="text-[10px] font-extrabold tracking-[.12em] text-[#3970a7]">PERSONALIZATION TAGS (сонголтоор)</p><p className="mt-1 text-[11px] text-[#77787d]">"Танд санал болгох" section-д ашиглагдана — хэрэглэгчийн профайл дээрх тохиргоотой таарвал энэ бараа санал болгогдоно.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold">Арьсны төрөл (skincare)<select value={productForm.skinType} onChange={event => setProductForm(current => ({ ...current, skinType: event.target.value as ProductForm["skinType"] }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]"><option value="">Бүх төрөлд (сонгоогүй)</option>{Object.entries(skinTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold">Арчилгааны зорилго (таслалаар тусгаарлаж)<input value={productForm.skinConcerns} onChange={event => setProductForm(current => ({ ...current, skinConcerns: event.target.value }))} placeholder="жишээ: acne,aging" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Интерьерийн загвар (interior бараанд)<input value={productForm.interiorStyle} onChange={event => setProductForm(current => ({ ...current, interiorStyle: event.target.value }))} placeholder="жишээ: minimalist" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label></div></div><div className="sm:col-span-2"><p className="text-xs font-bold">Бүтээгдэхүүний зураг</p><div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-[#df1f3d]/30 bg-white p-3 sm:flex-row sm:items-center"><label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#17181b] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><ImageUp size={15} />{uploadProductImage.isPending ? "Байршуулж байна…" : "Зураг сонгох"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onImageSelected} disabled={uploadProductImage.isPending} className="sr-only" /></label>{productForm.imageUrl ? <><img src={productForm.imageUrl} alt="Selected product" className="size-12 rounded-xl object-cover" /><span className="min-w-0 truncate text-xs text-[#77787d]">{productForm.imageUrl}</span></> : <span className="text-xs text-[#77787d]">JPG, PNG эсвэл WEBP · 8 MB хүртэл</span>}</div></div><label className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold sm:col-span-2"><input type="checkbox" checked={productForm.isPublished} onChange={event => setProductForm(current => ({ ...current, isPublished: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Нийтлэхэд бэлэн</label></div><button type="submit" disabled={isCatalogBusy || uploadProductImage.isPending} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isCatalogBusy && <LoaderCircle className="animate-spin" size={15} />}{productForm.id ? "Өөрчлөлт хадгалах" : "Бүтээгдэхүүн үүсгэх"}</button></form>}

            {composer === "category" && <form onSubmit={saveCategory} className="mt-7 rounded-3xl border border-[#3970a7]/25 bg-[#f1f6fb] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#3970a7]">CATALOG CATEGORY</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{categoryForm.id ? "Ангилал засах" : "Шинэ ангилал үүсгэх"}</h3></div><button type="button" onClick={() => setComposer(null)} className="text-xs font-bold text-[#707176]">Хаах</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={categoryForm.name} onChange={event => setCategoryForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={categoryForm.slug} onChange={event => setCategoryForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="grid gap-1.5 text-xs font-bold">Эрэмбэ<input required min="0" type="number" value={categoryForm.sortOrder} onChange={event => setCategoryForm(current => ({ ...current, sortOrder: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold"><input type="checkbox" checked={categoryForm.isActive} onChange={event => setCategoryForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#3970a7]" />Идэвхтэй ангилал</label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар<textarea value={categoryForm.description} onChange={event => setCategoryForm(current => ({ ...current, description: event.target.value }))} className="min-h-20 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label></div><button type="submit" disabled={isCatalogBusy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#3970a7] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isCatalogBusy && <LoaderCircle className="animate-spin" size={15} />}{categoryForm.id ? "Өөрчлөлт хадгалах" : "Ангилал үүсгэх"}</button></form>}

            {composer === "user" && <form onSubmit={sendStaffInvitation} className="mt-7 rounded-3xl border border-[#df1f3d]/25 bg-[#fff5f6] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">STAFF ACCESS</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">Ажилтан урих</h3></div><button type="button" onClick={() => setComposer(null)} className="text-xs font-bold text-[#707176]">Хаах</button></div><p className="mt-3 max-w-2xl text-xs leading-5 text-[#6f7075]">Урилга нь 7 хоног хүчинтэй, нэг удаагийн нууц токентой. Имэйл илгээх суваг одоогоор холбогдоогүй тул холбоос нь энд харагдаж, төслийн эзэнд аюулгүй мэдэгдлээр дамжина.</p><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_160px]"><label className="grid gap-1.5 text-xs font-bold">Ажилтны имэйл<input type="email" required value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="staff@asayake.mn" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Эрх<select value={inviteRole} onChange={event => setInviteRole(event.target.value as "user" | "staff" | "admin")} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]"><option value="user">User</option><option value="staff">Staff</option><option value="admin">Administrator</option></select></label></div><button type="submit" disabled={isUserBusy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{inviteStaff.isPending && <LoaderCircle className="animate-spin" size={15} />}Аюулгүй урилга үүсгэх</button>{lastInviteUrl && <div className="mt-5 rounded-2xl bg-white p-4"><p className="text-[10px] font-extrabold tracking-[.13em] text-[#3970a7]">SECURE INVITE LINK</p><p className="mt-2 break-all text-xs leading-5 text-[#57585e]">{lastInviteUrl}</p><button type="button" onClick={async () => { await navigator.clipboard.writeText(lastInviteUrl); toast.success("Урилгын холбоосыг хууллаа."); }} className="mt-3 rounded-full border border-[#3970a7]/30 px-3 py-2 text-[11px] font-bold text-[#3970a7]">Холбоос хуулах</button></div>}</form>}
          </section>
        </div>
      </div>
      {selectedUserId !== null && <AdminUserDetailDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
    </div>
  );
}
