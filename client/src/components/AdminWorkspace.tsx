import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "wouter";
import { CheckCircle2, ChevronLeft, ChevronRight, ChartColumnIncreasing, Download, ExternalLink, FilePenLine, Home, ImageUp, LayoutDashboard, ListChecks, LoaderCircle, LogOut, Megaphone, PackagePlus, Pencil, Plug, Search, ShieldAlert, ShieldCheck, Star, Tag, Tags, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { downloadCsv } from "@/lib/csv";
import { trpc } from "@/lib/trpc";
import { hairTypeLabels, hairConcernOptions, fragrancePreferenceLabels, wellnessInterestOptions, skinConcernOptions } from "@shared/catalog-filter";
import { suggestTagsForProduct } from "@shared/product-tagging";
import AdminAnalyticsPanel from "./AdminAnalyticsPanel";
import AdminBulkActionBar from "./AdminBulkActionBar";
import AdminDashboardHome from "./AdminDashboardHome";
import AdminGlobalSearch from "./AdminGlobalSearch";
import AdminOperationsPanel from "./AdminOperationsPanel";
import AdminReviewsPanel from "./AdminReviewsPanel";
import AdminBrandsPanel from "./AdminBrandsPanel";
import AdminDiscountCodesPanel from "./AdminDiscountCodesPanel";
import AdminIntegrationsPanel from "./AdminIntegrationsPanel";
import AdminProductVariantsPanel from "./AdminProductVariantsPanel";
import AdminPromotionsPanel from "./AdminPromotionsPanel";
import AdminRoutinesPanel from "./AdminRoutinesPanel";
import AdminSecurityCenter from "./AdminSecurityCenter";
import AdminUserDetailDrawer from "./AdminUserDetailDrawer";
import ContentMediaPanel from "./ContentMediaPanel";
import ContentTextPanel from "./ContentTextPanel";
import { formatMnt } from "@shared/format";

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
  costMnt: number | null;
  imageUrl: string | null;
  galleryJson: string | null;
  stockQuantity: number;
  isPublished: boolean;
  updatedAt: Date;
  categoryName: string | null;
  skinType: "dry" | "oily" | "combination" | "sensitive" | "normal" | null;
  skinConcerns: string | null;
  interiorStyle: string | null;
  hairType: "dry" | "oily" | "normal" | "damaged" | "color_treated" | null;
  hairConcerns: string | null;
  fragrancePreference: "unscented" | "light" | "floral" | "citrus" | null;
  wellnessInterests: string | null;
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
  costMnt: string;
  imageUrl: string;
  stockQuantity: string;
  isPublished: boolean;
  skinType: "" | "dry" | "oily" | "combination" | "sensitive" | "normal";
  skinConcerns: string;
  interiorStyle: string;
  hairType: "" | "dry" | "oily" | "normal" | "damaged" | "color_treated";
  hairConcerns: string;
  fragrancePreference: "" | "unscented" | "light" | "floral" | "citrus";
  wellnessInterests: string;
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

const previewProducts: ProductRow[] = [
  { id: 1, categoryId: 1, name: "Hada Labo Gokujyun Lotion", slug: "hada-labo-gokujyun-lotion", brand: "Hada Labo", shortDescription: null, description: null, sku: "HADA-GL-170", priceMnt: 29800, compareAtPriceMnt: null, costMnt: null, imageUrl: null, galleryJson: null, stockQuantity: 34, isPublished: true, updatedAt: new Date(), categoryName: "Арьс арчилгаа", skinType: "dry", skinConcerns: "aging", interiorStyle: null, hairType: null, hairConcerns: null, fragrancePreference: null, wellnessInterests: null },
  { id: 2, categoryId: 2, name: "Shiseido Tsubaki Premium Repair", slug: "shiseido-tsubaki-premium-repair", brand: "Shiseido", shortDescription: null, description: null, sku: "TSUB-PR-490", priceMnt: 42500, compareAtPriceMnt: null, costMnt: null, imageUrl: null, galleryJson: null, stockQuantity: 18, isPublished: true, updatedAt: new Date(), categoryName: "Үс ба бие", skinType: null, skinConcerns: null, interiorStyle: null, hairType: null, hairConcerns: null, fragrancePreference: null, wellnessInterests: null },
  { id: 3, categoryId: 1, name: "Rohto Melano CC Essence", slug: "rohto-melano-cc-essence", brand: "Rohto", shortDescription: null, description: null, sku: "ROHTO-MCC-20", priceMnt: 35900, compareAtPriceMnt: null, costMnt: null, imageUrl: null, galleryJson: null, stockQuantity: 0, isPublished: false, updatedAt: new Date(), categoryName: "Арьс арчилгаа", skinType: "oily", skinConcerns: "acne", interiorStyle: null, hairType: null, hairConcerns: null, fragrancePreference: null, wellnessInterests: null },
];

const previewCategories: CategoryRow[] = [
  { id: 1, name: "Арьс арчилгаа", slug: "skin-care", description: null, imageUrl: null, sortOrder: 1, isActive: true, updatedAt: new Date() },
  { id: 2, name: "Үс ба бие", slug: "hair-body", description: null, imageUrl: null, sortOrder: 2, isActive: true, updatedAt: new Date() },
];

const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const emptyProduct = (): ProductForm => ({ categoryId: "", name: "", slug: "", brand: "", shortDescription: "", description: "", sku: "", priceMnt: "", compareAtPriceMnt: "", costMnt: "", imageUrl: "", stockQuantity: "0", isPublished: false, skinType: "", skinConcerns: "", interiorStyle: "", hairType: "", hairConcerns: "", fragrancePreference: "", wellnessInterests: "" });
const skinTypeLabels: Record<string, string> = { dry: "Хуурай", oily: "Тослог", combination: "Холимог", sensitive: "Мэдрэмтгий", normal: "Хэвийн" };
const emptyCategory = (): CategoryForm => ({ name: "", slug: "", description: "", imageUrl: "", sortOrder: "0", isActive: true });
const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.";
const skinConcernLabelByValue = new Map(skinConcernOptions.map(option => [option.value, option.label]));
const hairConcernLabelByValue = new Map(hairConcernOptions.map(option => [option.value, option.label]));
const wellnessInterestLabelByValue = new Map(wellnessInterestOptions.map(option => [option.value, option.label]));

// Preference Profile v2 (2026-09-01): dismissible suggestion chips under an
// empty tag field -- "dismissible" in that a chip simply stops rendering
// once its value is applied (it's now in `current`), no separate dismiss
// state needed. Never auto-fills; admin always clicks explicitly.
function TagSuggestionChips({ suggestions, current, labelFor, onApply }: { suggestions: string[]; current: string[]; labelFor: (value: string) => string; onApply: (value: string) => void }) {
  const pending = suggestions.filter(value => !current.includes(value));
  if (!pending.length) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1.5">{pending.map(value => (
    <button key={value} type="button" onClick={() => onApply(value)} className="rounded-full border border-dashed border-[#3970a7]/40 bg-white px-2.5 py-1 text-[10px] font-bold text-[#3970a7]">+ Санал: {labelFor(value)}</button>
  ))}</div>;
}

export default function AdminWorkspace({ preview = false }: { preview?: boolean }) {
  const { user: currentUser, logout } = useAuth();
  const isFullAdmin = preview || currentUser?.role === "admin";
  type AdminSection = "dashboard" | "analytics" | "products" | "orders" | "posts" | "reviews" | "routines" | "promotions" | "discountCodes" | "brands" | "users" | "media" | "security" | "integrations";
  const adminSectionKeys: AdminSection[] = ["dashboard", "products", "orders", "posts", "reviews", "routines", "promotions", "discountCodes", "brands", "media", "users", "analytics", "security", "integrations"];
  // 2026-09-04 (Tom, "does admin panel really work 100% functional?" audit):
  // section switching only ever lived in React state, never the URL --
  // only ?adminSection=media (the one pre-existing special case) survived a
  // refresh. Every other section silently reset to the dashboard on
  // reload, and browser back/forward jumped straight out of /admin entirely
  // rather than stepping through sections, since no click ever touched
  // history at all. Same URL-state pattern Shop.tsx already uses for its
  // own filters (replaceState, not pushState -- deliberately doesn't spam
  // history per click, same tradeoff Shop.tsx made).
  const [section, setSection] = useState<AdminSection>(() => {
    const requested = new URLSearchParams(window.location.search).get("adminSection");
    return adminSectionKeys.includes(requested as AdminSection) ? (requested as AdminSection) : "dashboard";
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (section === "dashboard") params.delete("adminSection"); else params.set("adminSection", section);
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }, [section]);
  // A direct link to a full-admin-only section (users/analytics/security/
  // integrations), loaded by a staff (non-admin) account, must not silently
  // render a section that role can't actually use -- currentUser resolves
  // asynchronously, so this can't be decided at the useState initializer above.
  useEffect(() => {
    if (!isFullAdmin && ["users", "analytics", "security", "integrations"].includes(section)) setSection("dashboard");
  }, [isFullAdmin, section]);
  // Content & Media has 2 sub-tabs: images (site_media, existing) and text
  // (site_text, new -- see shared/site-text.ts) -- Tom asked for the text
  // editor to live right next to the image editor, not as its own top-level
  // sidebar section.
  const [mediaTab, setMediaTab] = useState<"images" | "text">("images");
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState<"product" | "category" | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  const [showProductExport, setShowProductExport] = useState(false);
  const [exportCategoryFilter, setExportCategoryFilter] = useState("all");
  const [exportPublishedFilter, setExportPublishedFilter] = useState<"all" | "published" | "draft">("all");
  const utils = trpc.useUtils();
  const productsQuery = trpc.admin.products.useQuery(undefined, { enabled: !preview });
  const categoriesQuery = trpc.admin.categories.useQuery(undefined, { enabled: !preview });
  const usersQuery = trpc.admin.users.useQuery(undefined, { enabled: !preview });

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
  const updateUserRole = trpc.admin.updateUserRole.useMutation();

  const products: ProductRow[] = preview ? previewProducts : (productsQuery.data ?? []);
  const categories: CategoryRow[] = preview ? previewCategories : (categoriesQuery.data ?? []);
  const users = preview ? [
    { id: 1, name: "SUGI ASAYAKE Owner", email: "owner@asayake.mn", phone: "99110022", role: "admin", createdAt: new Date(), lastSignedIn: new Date(), suspendedAt: null, suspendedReason: null },
    { id: 2, name: "Store manager", email: null, phone: "88112233", role: "user", createdAt: new Date(), lastSignedIn: new Date(), suspendedAt: null, suspendedReason: null },
  ] : (usersQuery.data ?? []);

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
  const filteredUsers = useMemo(() => users.filter(user => [user.name ?? "", user.email ?? "", user.phone ?? ""].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))), [users, query]);
  // Preference Profile v2 (2026-09-01): same rule-based matcher the bulk
  // auto-tag script uses (shared/product-tagging.ts) -- dismissible
  // suggestion chips below each already-empty tag field, so per-product
  // tagging coverage doesn't regress as Tom adds new products one at a
  // time between bulk-script runs. Admin still explicitly clicks a chip
  // before anything is saved -- this only ever suggests, never auto-fills.
  const tagSuggestions = useMemo(() => suggestTagsForProduct({
    name: productForm.name,
    brand: productForm.brand || null,
    categorySlug: categories.find(category => String(category.id) === productForm.categoryId)?.slug ?? null,
    shortDescription: productForm.shortDescription || null,
    description: productForm.description || null,
  }), [productForm.name, productForm.brand, productForm.categoryId, productForm.shortDescription, productForm.description, categories]);
  const isCatalogBusy = createProduct.isPending || updateProduct.isPending || deleteProduct.isPending || createCategory.isPending || updateCategory.isPending;
  const isBulkProductBusy = bulkUpdateProductPublishStatus.isPending;
  const isUserBusy = updateUserRole.isPending;

  const refreshUsers = async () => {
    await utils.admin.users.invalidate();
  };

  const openProductComposer = (product?: ProductRow) => {
    if (product) {
      setProductForm({ id: product.id, categoryId: String(product.categoryId), name: product.name, slug: product.slug, brand: product.brand ?? "", shortDescription: product.shortDescription ?? "", description: product.description ?? "", sku: product.sku, priceMnt: String(product.priceMnt), compareAtPriceMnt: product.compareAtPriceMnt ? String(product.compareAtPriceMnt) : "", costMnt: product.costMnt ? String(product.costMnt) : "", imageUrl: product.imageUrl ?? "", stockQuantity: String(product.stockQuantity), isPublished: product.isPublished, skinType: product.skinType ?? "", skinConcerns: product.skinConcerns ?? "", interiorStyle: product.interiorStyle ?? "", hairType: product.hairType ?? "", hairConcerns: product.hairConcerns ?? "", fragrancePreference: product.fragrancePreference ?? "", wellnessInterests: product.wellnessInterests ?? "" });
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
      costMnt: productForm.costMnt ? Number(productForm.costMnt) : null,
      imageUrl: productForm.imageUrl || null,
      stockQuantity,
      isPublished: productForm.isPublished,
      skinType: productForm.skinType || null,
      skinConcerns: productForm.skinConcerns.trim() || null,
      interiorStyle: productForm.interiorStyle.trim() || null,
      hairType: productForm.hairType || null,
      hairConcerns: productForm.hairConcerns.trim() || null,
      fragrancePreference: productForm.fragrancePreference || null,
      wellnessInterests: productForm.wellnessInterests.trim() || null,
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
            {section === "products" && <button type="button" onClick={() => openProductComposer()} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><PackagePlus size={16} />Бүтээгдэхүүн нэмэх</button>}
          </div>
        </div>
        {preview && <div className="mb-6 flex gap-3 rounded-2xl border border-[#e9ba62] bg-[#fff5dd] p-4 text-xs leading-5 text-[#6c531f]"><ShieldCheck className="mt-0.5 shrink-0" size={17} /><p><strong>Preview only.</strong> Энэ дэлгэц нь удирдлагын интерфэйсийн загвар юм. Бодит <code>/admin</code> зам нь нэвтэрсэн, <code>admin</code> эрхтэй хэрэглэгчдэд хамгаалагдсан.</p></div>}
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="rounded-3xl bg-[#17181b] p-3 text-white shadow-[0_16px_34px_rgba(20,22,24,.16)]">
            <div className="border-b border-white/12 px-3 py-4"><p className="text-[10px] font-extrabold tracking-[.15em] text-[#f0b52d]">COMMERCE ADMIN</p><p className="mt-1 text-sm text-white/65">Custom backend ready</p></div>
            <nav className="mt-3 grid gap-1">{[{ key: "dashboard", label: "Хянах самбар", Icon: LayoutDashboard }, { key: "products", label: "Бүтээгдэхүүн", Icon: PackagePlus }, { key: "orders", label: "Захиалга", Icon: CheckCircle2 }, { key: "posts", label: "Шинэ мэдээ", Icon: FilePenLine }, { key: "reviews", label: "Сэтгэгдэл", Icon: Star }, { key: "routines", label: "Routine", Icon: ListChecks }, { key: "promotions", label: "Урамшуулал", Icon: Megaphone }, { key: "discountCodes", label: "Хямдралын код", Icon: Tag }, { key: "brands", label: "Брэндүүд", Icon: Tags }, { key: "media", label: "Content & Media", Icon: ImageUp }, ...(isFullAdmin ? [{ key: "users", label: "Хэрэглэгч", Icon: UsersRound }, { key: "analytics", label: "Аналитик", Icon: ChartColumnIncreasing }, { key: "security", label: "Аюулгүй байдал", Icon: ShieldAlert }, { key: "integrations", label: "Интеграцууд", Icon: Plug }] : [])].map(({ key, label, Icon }) => <button type="button" key={key} onClick={() => { setSection(key as typeof section); setQuery(""); setComposer(null); }} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${section === key ? "bg-white text-[#17181b]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon size={17} />{label}</button>)}</nav>
            <div className="mt-7 rounded-2xl bg-white/8 p-4"><span className="text-[10px] font-extrabold tracking-[.14em] text-[#f0b52d]">ACCESS</span><p className="mt-2 text-xs leading-5 text-white/66">Нэвтэрсэн админ л каталог, зураг, хэрэглэгчийн эрхийг өөрчилж чадна.</p></div>
            {/* Tom, 2026-09-05: this was the ONLY place these 2 controls
                existed -- a now-removed outer "SUGI CONTROL" shell
                (DashboardLayout, a generic unused scaffold wrapping this
                real admin panel) had its own separate sidebar footer with a
                "Нүүр хуудас" link and Гарах/logout menu. Merging the 2
                sidebars into this one meant those 2 controls needed a new
                home, not just deletion. */}
            <div className="mt-3 grid gap-1 border-t border-white/12 pt-3">
              <Link href="/" className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"><Home size={17} />Нүүр хуудас</Link>
              <button type="button" onClick={logout} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"><LogOut size={17} />Гарах</button>
            </div>
          </aside>
          <section className="min-w-0 rounded-3xl bg-white p-5 shadow-[0_16px_34px_rgba(20,22,24,.05)] sm:p-7">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.06em]">{section === "dashboard" ? "Хянах самбар" : section === "products" ? "Бүтээгдэхүүний сан" : section === "orders" ? "Захиалгын гүйцэтгэл" : section === "posts" ? "Шинэ бүтээгдэхүүний пост" : section === "reviews" ? "Сэтгэгдэл ба үнэлгээ" : section === "routines" ? "Routine (арчилгааны дараалал)" : section === "promotions" ? "Урамшуулал (попап/banner)" : section === "discountCodes" ? "Хямдралын код" : section === "brands" ? "Топ брэндүүд" : section === "media" ? "Content & Media" : section === "analytics" ? "Аналитик ба тайлан" : section === "security" ? "Аюулгүй байдал" : section === "integrations" ? "Интеграцууд" : "Хэрэглэгч ба эрх"}</h2><p className="mt-1 text-xs text-[#77787d]">{section === "dashboard" ? "Дэлгүүрийн ерөнхий байдал нэг дэлгэцэд" : section === "products" ? "SKU, үнэ, үлдэгдэл, нийтлэх төлөв" : section === "orders" ? "Төлбөрийн төлөв, хүргэлтийн явц, захиалгын мэдээлэл" : section === "posts" ? "Бодитоор хадгалагдах шинэ бүтээгдэхүүний мэдээ" : section === "reviews" ? "Баталгаажсан худалдан авалтын сэтгэгдэл, жижиг moderation" : section === "routines" ? "Алхам дараалалтай бүтээгдэхүүний багц, идэвхтэй хямдралтай" : section === "promotions" ? "Шинэ бүтээгдэхүүн, хямдрал зарлах попап/banner мессеж" : section === "discountCodes" ? "Захиалгын үед оруулах хямдралын код (жишээ нь SALE10)" : section === "brands" ? "Нүүр хуудасны 'Топ брэндүүд' хэсэгт харагдах бодит брэндүүд" : section === "media" ? "Нүүр хуудасны зураг болон текстийг кодгүйгээр солих" : section === "analytics" ? "Борлуулалт, ашиг, харилцагчийн бодит дата нэг дэлгэцэд" : section === "security" ? "Admin аудит лог болон нэвтрэлтийн түүх" : section === "integrations" ? "QPay, И-баримт, StorePay, карт, хүргэлтийн үйлчилгээ тохируулах" : "Шинэ хэрэглэгчийг урих болон staff/admin эрх удирдах"}</p></div>
              {section !== "dashboard" && section !== "posts" && section !== "reviews" && section !== "routines" && section !== "promotions" && section !== "discountCodes" && section !== "brands" && section !== "media" && section !== "security" && section !== "integrations" && <label className="flex h-10 items-center gap-2 rounded-full border border-black/10 bg-[#fffdf9] px-4"><Search size={15} className="text-[#85868a]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={section === "users" ? "Нэр эсвэл имэйл хайх" : section === "orders" ? "Дугаар, хэрэглэгч, утас хайх" : "Нэр, SKU хайх"} className="w-full bg-transparent text-xs outline-none" /></label>}
            </div>
            {section === "dashboard" && <AdminDashboardHome preview={preview} onNavigate={target => { setSection(target); setQuery(""); }} />}
            {section === "security" && !preview && <AdminSecurityCenter />}
            {section === "security" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд аудит лог харагдахгүй.</div>}
            {section === "reviews" && !preview && <AdminReviewsPanel />}
            {section === "reviews" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд сэтгэгдэл харагдахгүй.</div>}
            {section === "routines" && !preview && <AdminRoutinesPanel />}
            {section === "routines" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд Routine удирдлага харагдахгүй.</div>}
            {section === "promotions" && !preview && <AdminPromotionsPanel />}
            {section === "promotions" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд урамшуулал удирдлага харагдахгүй.</div>}
            {section === "discountCodes" && !preview && <AdminDiscountCodesPanel />}
            {section === "discountCodes" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд хямдралын код удирдлага харагдахгүй.</div>}
            {section === "brands" && !preview && <AdminBrandsPanel />}
            {section === "brands" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд Топ брэнд удирдлага харагдахгүй.</div>}
            {section === "integrations" && !preview && <AdminIntegrationsPanel />}
            {section === "integrations" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд интеграцийн тохиргоо харагдахгүй.</div>}
            {section === "analytics" && !preview && <AdminAnalyticsPanel />}
            {section === "analytics" && preview && <div className="rounded-3xl bg-[#f8f5ef] p-8 text-center text-sm text-[#707176]">Preview горимд аналитик харагдахгүй.</div>}
            {section === "products" && <>
              {!preview && (productsQuery.isLoading || categoriesQuery.isLoading) && <div className="mb-5 flex items-center gap-2 text-xs text-[#77787d]"><LoaderCircle className="animate-spin" size={15} />Каталогийн мэдээллийг уншиж байна…</div>}
              {!preview && (productsQuery.error || categoriesQuery.error) && <div className="mb-5 rounded-2xl bg-[#fff0f2] p-4 text-xs text-[#a51630]">{messageFrom(productsQuery.error ?? categoriesQuery.error)}</div>}
              {showProductExport && <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f8f5ef] p-4"><label className="grid gap-1.5 text-xs font-bold">Ангилал<select value={exportCategoryFilter} onChange={event => setExportCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold">Төлөв<select value={exportPublishedFilter} onChange={event => setExportPublishedFilter(event.target.value as typeof exportPublishedFilter)} className="h-10 rounded-lg border border-black/10 bg-white px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option><option value="published">Нийтлэгдсэн</option><option value="draft">Ноорог</option></select></label><button type="button" onClick={exportProductsCsv} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#17181b] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Download size={14} />CSV татах</button></div>}
              <div className="mb-5 flex flex-wrap gap-2">{categories.map(category => <button key={category.id} type="button" onClick={() => openCategoryComposer(category)} className="inline-flex items-center gap-1.5 rounded-full bg-[#f8f5ef] px-3 py-1.5 text-[11px] font-bold text-[#57585e] transition hover:bg-[#fff0f2] hover:text-[#a51630]"><Tags size={12} />{category.name}<Pencil size={11} /></button>)}{categories.length === 0 && <button type="button" onClick={() => openCategoryComposer()} className="rounded-full border border-dashed border-[#df1f3d]/40 px-3 py-1.5 text-[11px] font-bold text-[#a51630]">Эхний ангиллаа үүсгэх</button>}</div>
              <AdminBulkActionBar count={selectedProductIds.size} onClear={() => setSelectedProductIds(new Set())}>
                <button type="button" disabled={isBulkProductBusy} onClick={() => applyBulkPublish(true)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Нийтлэх</button>
                <button type="button" disabled={isBulkProductBusy} onClick={() => applyBulkPublish(false)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Ноорог болгох</button>
              </AdminBulkActionBar>
              <div className="overflow-x-auto"><table className="min-w-[740px] w-full border-separate border-spacing-0 text-left"><thead><tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]"><th className="w-8 border-b border-black/8 pb-3"><input type="checkbox" checked={selectedProductIds.size > 0 && selectedProductIds.size === filteredProducts.length} onChange={toggleSelectAllProducts} aria-label="Бүгдийг сонгох" className="size-4 accent-[#df1f3d]" /></th><th className="border-b border-black/8 pb-3">БҮТЭЭГДЭХҮҮН</th><th className="border-b border-black/8 pb-3">АНГИЛАЛ</th><th className="border-b border-black/8 pb-3">ҮНЭ</th><th className="border-b border-black/8 pb-3">ҮЛДЭГДЭЛ</th><th className="border-b border-black/8 pb-3">ТӨЛӨВ</th><th className="border-b border-black/8 pb-3" /></tr></thead><tbody>{pagedProducts.map(product => <tr key={product.id} className="group text-sm"><td className="border-b border-black/6 py-4"><input type="checkbox" checked={selectedProductIds.has(product.id)} onChange={() => toggleProductSelection(product.id)} aria-label={`${product.name} сонгох`} className="size-4 accent-[#df1f3d]" /></td><td className="border-b border-black/6 py-4"><strong className="block">{product.name}</strong><small className="mt-1 block text-[10px] font-bold tracking-[.08em] text-[#85868a]">{product.sku}</small></td><td className="border-b border-black/6 py-4 text-xs text-[#6f7075]">{product.categoryName ?? "Ангилалгүй"}</td><td className="border-b border-black/6 py-4 font-bold">{formatMnt(product.priceMnt)}</td><td className="border-b border-black/6 py-4"><span className={product.stockQuantity === 0 ? "font-bold text-[#df1f3d]" : "font-bold"}>{product.stockQuantity} ш</span></td><td className="border-b border-black/6 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${product.isPublished ? "bg-[#e7f2ec] text-[#2c7650]" : "bg-[#fff0d2] text-[#9b6417]"}`}>{product.isPublished ? "Нийтлэгдсэн" : "Ноорог"}</span></td><td className="border-b border-black/6 py-4 text-right"><div className="flex justify-end gap-1">{product.isPublished && <a href={`/product/${product.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#3970a7]" aria-label={`${product.name} — амьд хуудсыг харах`} title="Амьд хуудсыг харах"><ExternalLink size={15} /></a>}<button type="button" disabled={isCatalogBusy} onClick={() => openProductComposer(product)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#f8f5ef] hover:text-[#df1f3d]" aria-label={`${product.name} засах`} title="Засах"><Pencil size={15} /></button><button type="button" disabled={isCatalogBusy} onClick={() => removeProduct(product)} className="rounded-full p-2 text-[#707176] transition hover:bg-[#fff0f2] hover:text-[#df1f3d]" aria-label={`${product.name} устгах`} title="Устгах"><Trash2 size={15} /></button></div></td></tr>)}{filteredProducts.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-[#77787d]">{query ? "Хайлтад тохирох бүтээгдэхүүн олдсонгүй." : "Одоогоор бүтээгдэхүүн алга. Ангилал үүсгээд эхний бүтээгдэхүүнээ нэмээрэй."}</td></tr>}</tbody></table></div>
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
            {section === "media" && (
              <>
                <div className="mb-5 inline-flex rounded-full border border-black/10 bg-white p-1">
                  <button type="button" onClick={() => setMediaTab("images")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${mediaTab === "images" ? "bg-[#17181b] text-white" : "text-[#57585e]"}`}>Зураг</button>
                  <button type="button" onClick={() => setMediaTab("text")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${mediaTab === "text" ? "bg-[#17181b] text-white" : "text-[#57585e]"}`}>Текст</button>
                </div>
                {mediaTab === "images" && <ContentMediaPanel preview={preview} />}
                {mediaTab === "text" && <ContentTextPanel preview={preview} />}
              </>
            )}
            {section === "users" && <div className="overflow-x-auto"><table className="min-w-[720px] w-full border-separate border-spacing-0 text-left"><thead><tr className="text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]"><th className="border-b border-black/8 pb-3">ХЭРЭГЛЭГЧ</th><th className="border-b border-black/8 pb-3">УТАС</th><th className="border-b border-black/8 pb-3">ЭРХ</th><th className="border-b border-black/8 pb-3">ТӨЛӨВ</th><th className="border-b border-black/8 pb-3">СҮҮЛД НЭВТЭРСЭН</th><th className="border-b border-black/8 pb-3" /></tr></thead><tbody>{filteredUsers.map(user => <tr key={user.id} className="text-sm"><td className="border-b border-black/6 py-4"><strong className="block">{user.name ?? "Нэр оруулаагүй"}</strong><small className="mt-1 block text-xs text-[#77787d]">{user.email ?? "Имэйл байхгүй"}</small></td><td className="border-b border-black/6 py-4 text-xs">{user.phone ?? <span className="text-[#a51630]">Утасгүй</span>}</td><td className="border-b border-black/6 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${user.role === "admin" ? "bg-[#fff0d2] text-[#9b6417]" : user.role === "staff" ? "bg-[#e6f0fb] text-[#2c5a91]" : "bg-[#edf0f5] text-[#505d70]"}`}>{user.role === "admin" ? "Admin" : user.role === "staff" ? "Staff" : "User"}</span></td><td className="border-b border-black/6 py-4">{user.suspendedAt ? <span className="rounded-full bg-[#fff0f2] px-2.5 py-1 text-[10px] font-extrabold text-[#a51630]">Түр хаагдсан</span> : <span className="rounded-full bg-[#e7f2ec] px-2.5 py-1 text-[10px] font-extrabold text-[#2c7650]">Идэвхтэй</span>}</td><td className="border-b border-black/6 py-4 text-xs text-[#6f7075]">{user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleDateString("mn-MN") : "—"}</td><td className="border-b border-black/6 py-4 text-right">{!preview && <button type="button" onClick={() => setSelectedUserId(user.id)} className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-bold text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">Дэлгэрэнгүй</button>}</td></tr>)}{filteredUsers.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-[#77787d]">Хэрэглэгч олдсонгүй.</td></tr>}</tbody></table></div>}

            {/* 2026-09-05 ("admin invite staff section just change it to manually
                only admin give staff role to default users" -- Tom, explicit):
                the old 2-column "ROLE MANAGEMENT" + "ACTIVE INVITATIONS" layout
                is gone along with the email-invite flow -- this is now the
                only staff-access control, full width. Утас олдохгүй бол
                "Дэлгэрэнгүй" цонхны (AdminUserDetailDrawer) шинэ утас засах
                хэрэгслээр (recovery path) нэмнэ. */}
            {section === "users" && <section className="mt-7 rounded-3xl bg-[#f8f5ef] p-5">
              <p className="text-[10px] font-extrabold tracking-[.14em] text-[#3970a7]">ROLE MANAGEMENT</p>
              <p className="mt-2 text-xs leading-5 text-[#707176]">Одоо бүртгэлтэй хэрэглэгчийн эрхийг эндээс шууд өөрчилнө — шинэ ажилтныг урих шаардлагагүй, тухайн хүн эхлээд өөрөө утасны дугаараа ашиглан бүртгүүлсэн байх ёстой. Админ эрх нь каталог, захиалга, хэрэглэгчийн эрхийг удирдах боломж олгоно. Өөрийн эрхийг энэ дэлгэцээс бууруулахгүй.</p>
              <div className="mt-4 grid gap-2">{filteredUsers.map(user => <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3"><div className="min-w-0"><strong className="block truncate text-xs">{user.name ?? user.phone ?? user.email ?? "Хэрэглэгч"}</strong><span className="block truncate text-[11px] text-[#77787d]">{user.phone ?? "Утасгүй"}</span></div>{preview ? <span className="text-xs font-bold">{user.role}</span> : <select value={user.role} disabled={isUserBusy} onChange={event => changeUserRole(user.id, event.target.value as "user" | "staff" | "admin")} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs font-bold outline-none focus:border-[#df1f3d]"><option value="user">User</option><option value="staff">Staff</option><option value="admin">Admin</option></select>}</div>)}</div>
            </section>}

            {composer === "product" && <form onSubmit={saveProduct} className="mt-7 rounded-3xl border border-[#df1f3d]/25 bg-[#fff5f6] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">PRODUCT {productForm.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{productForm.id ? "Бүтээгдэхүүн засах" : "Шинэ бүтээгдэхүүн нэмэх"}</h3></div><div className="flex items-center gap-4">{productForm.id && productForm.isPublished && productForm.slug && <a href={`/product/${productForm.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3970a7]"><ExternalLink size={13} />Амьд хуудсыг харах</a>}<button type="button" onClick={() => setComposer(null)} className="text-xs font-bold text-[#707176]">Хаах</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={productForm.name} onChange={event => setProductForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">SKU<input required value={productForm.sku} onChange={event => setProductForm(current => ({ ...current, sku: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={productForm.slug} onChange={event => setProductForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Ангилал<select required value={productForm.categoryId} onChange={event => setProductForm(current => ({ ...current, categoryId: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]"><option value="" disabled>Сонгох</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold">Брэнд<input value={productForm.brand} onChange={event => setProductForm(current => ({ ...current, brand: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Үнэ (₮)<input required min="0" type="number" value={productForm.priceMnt} onChange={event => setProductForm(current => ({ ...current, priceMnt: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Хуучин үнэ (сонголтоор)<input min="0" type="number" value={productForm.compareAtPriceMnt} onChange={event => setProductForm(current => ({ ...current, compareAtPriceMnt: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Өртөг үнэ, зөвхөн админд (сонголтоор)<input min="0" type="number" value={productForm.costMnt} onChange={event => setProductForm(current => ({ ...current, costMnt: event.target.value }))} placeholder="Ашиг тооцоход л ашиглагдана" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Үлдэгдэл<input required min="0" type="number" value={productForm.stockQuantity} onChange={event => setProductForm(current => ({ ...current, stockQuantity: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Товч тайлбар<textarea value={productForm.shortDescription} onChange={event => setProductForm(current => ({ ...current, shortDescription: event.target.value }))} className="min-h-20 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Дэлгэрэнгүй тайлбар<textarea value={productForm.description} onChange={event => setProductForm(current => ({ ...current, description: event.target.value }))} className="min-h-28 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><div className="sm:col-span-2 rounded-2xl bg-white/60 p-3"><p className="text-[10px] font-extrabold tracking-[.12em] text-[#3970a7]">PERSONALIZATION TAGS (сонголтоор)</p><p className="mt-1 text-[11px] text-[#77787d]">"Танд санал болгох" section-д ашиглагдана — хэрэглэгчийн профайл дээрх тохиргоотой таарвал энэ бараа санал болгогдоно. Зурын доорх зурвасууд бол зөвхөн санал — дарж сонговол л хадгалагдана.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold">Арьсны төрөл (skincare)<select value={productForm.skinType} onChange={event => setProductForm(current => ({ ...current, skinType: event.target.value as ProductForm["skinType"] }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]"><option value="">Бүх төрөлд (сонгоогүй)</option>{Object.entries(skinTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <TagSuggestionChips suggestions={tagSuggestions.skinType ? [tagSuggestions.skinType] : []} current={productForm.skinType ? [productForm.skinType] : []} labelFor={value => skinTypeLabels[value] ?? value} onApply={value => setProductForm(current => ({ ...current, skinType: value as ProductForm["skinType"] }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Арчилгааны зорилго (таслалаар тусгаарлаж)<input value={productForm.skinConcerns} onChange={event => setProductForm(current => ({ ...current, skinConcerns: event.target.value }))} placeholder="жишээ: acne,aging" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
                <TagSuggestionChips suggestions={tagSuggestions.skinConcerns ?? []} current={productForm.skinConcerns.split(",").map(v => v.trim()).filter(Boolean)} labelFor={value => skinConcernLabelByValue.get(value) ?? value} onApply={value => setProductForm(current => { const list = current.skinConcerns.split(",").map(v => v.trim()).filter(Boolean); return { ...current, skinConcerns: [...list, value].join(",") }; })} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Үсний төрөл (hair &amp; body)<select value={productForm.hairType} onChange={event => setProductForm(current => ({ ...current, hairType: event.target.value as ProductForm["hairType"] }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]"><option value="">Бүх төрөлд (сонгоогүй)</option>{Object.entries(hairTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <TagSuggestionChips suggestions={tagSuggestions.hairType ? [tagSuggestions.hairType] : []} current={productForm.hairType ? [productForm.hairType] : []} labelFor={value => hairTypeLabels[value as keyof typeof hairTypeLabels] ?? value} onApply={value => setProductForm(current => ({ ...current, hairType: value as ProductForm["hairType"] }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Үсний санаа зовдог асуудал (таслалаар тусгаарлаж)<input value={productForm.hairConcerns} onChange={event => setProductForm(current => ({ ...current, hairConcerns: event.target.value }))} placeholder="жишээ: hairloss,dandruff" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
                <TagSuggestionChips suggestions={tagSuggestions.hairConcerns ?? []} current={productForm.hairConcerns.split(",").map(v => v.trim()).filter(Boolean)} labelFor={value => hairConcernLabelByValue.get(value) ?? value} onApply={value => setProductForm(current => { const list = current.hairConcerns.split(",").map(v => v.trim()).filter(Boolean); return { ...current, hairConcerns: [...list, value].join(",") }; })} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Үнэрийн сонголт<select value={productForm.fragrancePreference} onChange={event => setProductForm(current => ({ ...current, fragrancePreference: event.target.value as ProductForm["fragrancePreference"] }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]"><option value="">Бүх төрөлд (сонгоогүй)</option>{Object.entries(fragrancePreferenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <TagSuggestionChips suggestions={tagSuggestions.fragrancePreference ? [tagSuggestions.fragrancePreference] : []} current={productForm.fragrancePreference ? [productForm.fragrancePreference] : []} labelFor={value => fragrancePreferenceLabels[value as keyof typeof fragrancePreferenceLabels] ?? value} onApply={value => setProductForm(current => ({ ...current, fragrancePreference: value as ProductForm["fragrancePreference"] }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Эрүүл мэндийн сонирхол (таслалаар тусгаарлаж)<input value={productForm.wellnessInterests} onChange={event => setProductForm(current => ({ ...current, wellnessInterests: event.target.value }))} placeholder="жишээ: energy,immune" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
                <TagSuggestionChips suggestions={tagSuggestions.wellnessInterests ?? []} current={productForm.wellnessInterests.split(",").map(v => v.trim()).filter(Boolean)} labelFor={value => wellnessInterestLabelByValue.get(value) ?? value} onApply={value => setProductForm(current => { const list = current.wellnessInterests.split(",").map(v => v.trim()).filter(Boolean); return { ...current, wellnessInterests: [...list, value].join(",") }; })} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Интерьерийн загвар (interior бараанд)<input value={productForm.interiorStyle} onChange={event => setProductForm(current => ({ ...current, interiorStyle: event.target.value }))} placeholder="жишээ: minimalist" className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label>
            </div></div>{productForm.id && <AdminProductVariantsPanel productId={productForm.id} />}<div className="sm:col-span-2"><p className="text-xs font-bold">Бүтээгдэхүүний зураг</p><div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-[#df1f3d]/30 bg-white p-3 sm:flex-row sm:items-center"><label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#17181b] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><ImageUp size={15} />{uploadProductImage.isPending ? "Байршуулж байна…" : "Зураг сонгох"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onImageSelected} disabled={uploadProductImage.isPending} className="sr-only" /></label>{productForm.imageUrl ? <><img src={productForm.imageUrl} alt="Selected product" className="size-12 rounded-xl object-cover" /><span className="min-w-0 truncate text-xs text-[#77787d]">{productForm.imageUrl}</span></> : <span className="text-xs text-[#77787d]">JPG, PNG эсвэл WEBP · 8 MB хүртэл</span>}</div></div><label className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold sm:col-span-2"><input type="checkbox" checked={productForm.isPublished} onChange={event => setProductForm(current => ({ ...current, isPublished: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Нийтлэхэд бэлэн</label></div><button type="submit" disabled={isCatalogBusy || uploadProductImage.isPending} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isCatalogBusy && <LoaderCircle className="animate-spin" size={15} />}{productForm.id ? "Өөрчлөлт хадгалах" : "Бүтээгдэхүүн үүсгэх"}</button></form>}

            {composer === "category" && <form onSubmit={saveCategory} className="mt-7 rounded-3xl border border-[#3970a7]/25 bg-[#f1f6fb] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#3970a7]">CATALOG CATEGORY</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{categoryForm.id ? "Ангилал засах" : "Шинэ ангилал үүсгэх"}</h3></div><button type="button" onClick={() => setComposer(null)} className="text-xs font-bold text-[#707176]">Хаах</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={categoryForm.name} onChange={event => setCategoryForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={categoryForm.slug} onChange={event => setCategoryForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="grid gap-1.5 text-xs font-bold">Эрэмбэ<input required min="0" type="number" value={categoryForm.sortOrder} onChange={event => setCategoryForm(current => ({ ...current, sortOrder: event.target.value }))} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold"><input type="checkbox" checked={categoryForm.isActive} onChange={event => setCategoryForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#3970a7]" />Идэвхтэй ангилал</label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар<textarea value={categoryForm.description} onChange={event => setCategoryForm(current => ({ ...current, description: event.target.value }))} className="min-h-20 rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label></div><button type="submit" disabled={isCatalogBusy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#3970a7] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isCatalogBusy && <LoaderCircle className="animate-spin" size={15} />}{categoryForm.id ? "Өөрчлөлт хадгалах" : "Ангилал үүсгэх"}</button></form>}
          </section>
        </div>
      </div>
      {selectedUserId !== null && <AdminUserDetailDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
    </div>
  );
}
