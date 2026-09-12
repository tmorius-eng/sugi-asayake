import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, ExternalLink, ImageUp, LoaderCircle, PackagePlus, Pencil, Search, ShieldCheck, Tags, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { downloadCsv } from "@/lib/csv";
import { trpc } from "@/lib/trpc";
import { useAdminTheme } from "@/lib/adminTheme";
import { hairTypeLabels, hairConcernOptions, fragrancePreferenceLabels, wellnessInterestOptions, skinConcernOptions } from "@shared/catalog-filter";
import { suggestTagsForProduct } from "@shared/product-tagging";
import AdminAnalyticsPanel from "./AdminAnalyticsPanel";
import AdminBulkActionBar from "./AdminBulkActionBar";
import AdminDashboardHome from "./AdminDashboardHome";
import AdminGlobalSearch from "./AdminGlobalSearch";
import AdminCommandPalette from "./admin/AdminCommandPalette";
import AdminContentCalendarPanel from "./admin/AdminContentCalendarPanel";
import AdminSidebar, { getVisibleSections, type NavBadges } from "./admin/AdminSidebar";
import AdminSectionTip from "./admin/AdminSectionTip";
import { roleBadgeClass, roleLabel } from "@/lib/adminRoles";
import AdminTopBar from "./admin/AdminTopBar";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { GenericListView, type GenericListColumn } from "./admin/GenericListView";
import AdminHistoryPanel from "./admin/AdminHistoryPanel";
import AdminOperationsPanel from "./AdminOperationsPanel";
import AdminProductImportModal from "./admin/AdminProductImportModal";
import AdminPostsPanel from "./AdminPostsPanel";
import AdminReviewsPanel from "./AdminReviewsPanel";
import AdminBrandsPanel from "./AdminBrandsPanel";
import AdminBranchesPanel from "./AdminBranchesPanel";
import AdminPosPanel from "./AdminPosPanel";
import AdminCampaignsPanel from "./admin/AdminCampaignsPanel";
import AdminStoreSettingsPanel from "./AdminStoreSettingsPanel";
import AdminDocumentsPanel from "./AdminDocumentsPanel";
import AdminLoyaltyTiersPanel from "./AdminLoyaltyTiersPanel";
import AdminDiscountCodesPanel from "./AdminDiscountCodesPanel";
import AdminIntegrationsPanel from "./AdminIntegrationsPanel";
import AdminNotificationsPanel from "./AdminNotificationsPanel";
import AdminReceivingPanel from "./AdminReceivingPanel";
import AdminNotificationBell from "./admin/AdminNotificationBell";
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
  // description / galleryJson deliberately absent (audit 2026-09-09, R4):
  // the list never shows them and they were most of a ~940-row payload.
  // The editor fetches admin.productDetail for the one product it opens.
  sku: string;
  priceMnt: number;
  compareAtPriceMnt: number | null;
  costMnt: number | null;
  imageUrl: string | null;
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
  { id: 1, categoryId: 1, name: "Hada Labo Gokujyun Lotion", slug: "hada-labo-gokujyun-lotion", brand: "Hada Labo", shortDescription: null, sku: "HADA-GL-170", priceMnt: 29800, compareAtPriceMnt: null, costMnt: null, imageUrl: null, stockQuantity: 34, isPublished: true, updatedAt: new Date(), categoryName: "Арьс арчилгаа", skinType: "dry", skinConcerns: "aging", interiorStyle: null, hairType: null, hairConcerns: null, fragrancePreference: null, wellnessInterests: null },
  { id: 2, categoryId: 2, name: "Shiseido Tsubaki Premium Repair", slug: "shiseido-tsubaki-premium-repair", brand: "Shiseido", shortDescription: null, sku: "TSUB-PR-490", priceMnt: 42500, compareAtPriceMnt: null, costMnt: null, imageUrl: null, stockQuantity: 18, isPublished: true, updatedAt: new Date(), categoryName: "Үс ба бие", skinType: null, skinConcerns: null, interiorStyle: null, hairType: null, hairConcerns: null, fragrancePreference: null, wellnessInterests: null },
  { id: 3, categoryId: 1, name: "Rohto Melano CC Essence", slug: "rohto-melano-cc-essence", brand: "Rohto", shortDescription: null, sku: "ROHTO-MCC-20", priceMnt: 35900, compareAtPriceMnt: null, costMnt: null, imageUrl: null, stockQuantity: 0, isPublished: false, updatedAt: new Date(), categoryName: "Арьс арчилгаа", skinType: "oily", skinConcerns: "acne", interiorStyle: null, hairType: null, hairConcerns: null, fragrancePreference: null, wellnessInterests: null },
];

const previewCategories: CategoryRow[] = [
  { id: 1, name: "Арьс арчилгаа", slug: "skin-care", description: null, imageUrl: null, sortOrder: 1, isActive: true, updatedAt: new Date() },
  { id: 2, name: "Үс ба бие", slug: "hair-body", description: null, imageUrl: null, sortOrder: 2, isActive: true, updatedAt: new Date() },
];

const slugify = (value: string) => value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const emptyProduct = (): ProductForm => ({ categoryId: "", name: "", slug: "", brand: "", shortDescription: "", description: "", sku: "", priceMnt: "", compareAtPriceMnt: "", costMnt: "", imageUrl: "", stockQuantity: "0", isPublished: false, skinType: "", skinConcerns: "", interiorStyle: "", hairType: "", hairConcerns: "", fragrancePreference: "", wellnessInterests: "" });
const skinTypeLabels: Record<string, string> = { dry: "Хуурай", oily: "Тослог", combination: "Холимог", sensitive: "Мэдрэмтгий", normal: "Хэвийн" };
const emptyCategory = (): CategoryForm => ({ name: "", slug: "", description: "", imageUrl: "", sortOrder: "0", isActive: true });
// Audit 2026-09-09 (R4): the Users table is paged and searched server-side
// now (admin.users takes { search, page, pageSize }), so this is the page
// the query asks for, not a client-side slice of the whole table.
const USERS_PAGE_SIZE = 25;
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
    <button key={value} type="button" onClick={() => onApply(value)} className="rounded-full border border-dashed border-[#3970a7]/40 bg-[var(--a-card)] px-2.5 py-1 text-[10px] font-bold text-[var(--a-info)]">+ Санал: {labelFor(value)}</button>
  ))}</div>;
}

export type AdminSection = "dashboard" | "analytics" | "products" | "orders" | "posts" | "reviews" | "routines" | "promotions" | "calendar" | "discountCodes" | "brands" | "branches" | "pos" | "campaigns" | "storeSettings" | "users" | "media" | "documents" | "loyalty" | "security" | "integrations" | "notifications" | "receiving";


export default function AdminWorkspace({ preview = false }: { preview?: boolean }) {
  const { user: currentUser, logout } = useAuth();
  // Admin overhaul (2026-09-08, Phase C): the old single isFullAdmin boolean
  // was overloaded for three unrelated meanings (nav-section visibility,
  // financial-figure redaction, audit-trail visibility) -- now that there
  // are 5 non-admin roles instead of 1 ("staff" meant "anyone but admin"),
  // those need to be three distinct signals. `role` mirrors preview mode as
  // "admin" (preview always renders the full admin view, same behavior the
  // old isFullAdmin had).
  const role = preview ? "admin" : (currentUser?.role ?? "user");
  const visibleSections = useMemo(() => new Set(getVisibleSections(role).map(item => item.key)), [role]);
  const canSeeFinancials = role === "admin" || role === "finance";
  const canSeeAuditTrail = role === "admin";
  // Phase J (2026-09-08): also folds in `storeSettings`/`campaigns`/
  // `branches` -- storeSettings and campaigns were added in later work than
  // the URL-state fix below and were never added to this list, so (like
  // every OTHER section before that fix) a direct link or refresh to
  // ?adminSection=storeSettings or campaigns silently fell back to the
  // dashboard -- the exact bug class this array exists to prevent.
  const adminSectionKeys: AdminSection[] = ["dashboard", "products", "orders", "posts", "reviews", "routines", "promotions", "calendar", "discountCodes", "brands", "branches", "pos", "media", "campaigns", "storeSettings", "users", "analytics", "security", "integrations", "documents", "loyalty", "notifications", "receiving"];
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
  // A direct link (e.g. ?adminSection=analytics) to a section this role
  // can't actually use, must not silently render it anyway -- currentUser
  // resolves asynchronously, so this can't be decided at the useState
  // initializer above. Reuses visibleSections (the same source of truth the
  // sidebar/command palette render from) instead of a second, hand-copied
  // "which sections are restricted" list.
  useEffect(() => {
    if (!visibleSections.has(section)) setSection("dashboard");
  }, [role, section, visibleSections]);
  // Content & Media has 2 sub-tabs: images (site_media, existing) and text
  // (site_text, new -- see shared/site-text.ts) -- Tom asked for the text
  // editor to live right next to the image editor, not as its own top-level
  // sidebar section.
  const [mediaTab, setMediaTab] = useState<"images" | "text">("images");
  const [query, setQuery] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  // A new search always starts from page 1 -- otherwise a query that
  // matches 3 users while the pager sits on page 4 shows an empty page.
  useEffect(() => { setUsersPage(1); }, [query]);
  const [composer, setComposer] = useState<"product" | "category" | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  // What's actually live right now for the product being edited -- see
  // openProductComposer's own comment on why this must stay independent
  // from the editable productForm fields.
  const [liveProductRef, setLiveProductRef] = useState<{ slug: string; isPublished: boolean } | null>(null);
  const [liveCategoryRef, setLiveCategoryRef] = useState<{ name: string; isActive: boolean } | null>(null);
  // 2026-09-06: the new Gentelella-style shell's mobile nav drawer -- see
  // AdminSidebar.tsx's own comment on why this is a plain toggle + the
  // generic ui/sheet.tsx primitive, not ui/sidebar.tsx's shadcn Sidebar.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const adminTheme = useAdminTheme();
  // <html>, not this component's own div: every ui/* primitive built on Radix
  // portals its content into <body>, outside the shell, so a shell-scoped
  // attribute would leave dropdowns/dialogs/the command palette rendering in
  // the storefront's cream while the panel behind them is dark. Removed on
  // unmount so leaving /admin never darkens the shop.
  useEffect(() => {
    document.documentElement.dataset.adminTheme = adminTheme;
    return () => { delete document.documentElement.dataset.adminTheme; };
  }, [adminTheme]);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showProductExport, setShowProductExport] = useState(false);
  const [showProductImport, setShowProductImport] = useState(false);
  const [exportCategoryFilter, setExportCategoryFilter] = useState("all");
  const [exportPublishedFilter, setExportPublishedFilter] = useState<"all" | "published" | "draft">("all");
  const utils = trpc.useUtils();
  // Admin overhaul (2026-09-08, Phase C): admin.products/categories are now
  // catalogReadProcedure (admin/warehouse/marketing), narrower than the old
  // "anyone but a plain user" staffProcedure -- gating on visibleSections
  // (not just !preview) avoids the exact class of stray-403-on-load bug
  // usersQuery below already had to be fixed for once before.
  const productsQuery = trpc.admin.products.useQuery(undefined, { enabled: !preview && visibleSections.has("products") });
  const categoriesQuery = trpc.admin.categories.useQuery(undefined, { enabled: !preview && visibleSections.has("products") });
  // 2026-09-06: found while verifying the new dashboard's staff-redaction
  // (a stray 403 console error) -- this was firing for EVERY non-preview
  // session regardless of role, even though admin.users is adminProcedure
  // and the "users" section itself is already hidden from staff. Harmless
  // in effect (staff never saw the data, just a console 403), but a real
  // pre-existing bug, not something this dashboard rebuild introduced.
  const usersQuery = trpc.admin.users.useQuery({ search: query.trim() || undefined, page: usersPage, pageSize: USERS_PAGE_SIZE }, { enabled: !preview && visibleSections.has("users"), placeholderData: previous => previous });

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
  const categories: CategoryRow[] = useMemo(() => preview ? previewCategories : (categoriesQuery.data ?? []), [preview, categoriesQuery.data]);
  const users = preview ? [
    { id: 1, name: "SUGI ASAYAKE Owner", email: "owner@asayake.mn", phone: "99110022", role: "admin", createdAt: new Date(), lastSignedIn: new Date(), suspendedAt: null, suspendedReason: null },
    { id: 2, name: "Store manager", email: null, phone: "88112233", role: "user", createdAt: new Date(), lastSignedIn: new Date(), suspendedAt: null, suspendedReason: null },
  ] : (usersQuery.data?.rows ?? []);
  const usersTotal = preview ? users.length : (usersQuery.data?.total ?? 0);
  type UserRow = (typeof users)[number];
  const userColumns: GenericListColumn<UserRow>[] = [
    {
      id: "user",
      header: "ХЭРЭГЛЭГЧ",
      render: user => (
        <>
          <strong className="block">{user.name ?? "Нэр оруулаагүй"}</strong>
          <small className="mt-1 block text-xs text-[var(--a-muted)]">{user.email ?? "Имэйл байхгүй"}</small>
        </>
      ),
    },
    { id: "phone", header: "УТАС", cellClassName: "border-b border-[var(--a-border)] py-4 text-xs", render: user => user.phone ?? <span className="text-[var(--a-neg)]">Утасгүй</span> },
    {
      id: "role",
      header: "ЭРХ",
      render: user => (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${roleBadgeClass(user.role)}`}>
            {roleLabel(user.role)}
          </span>
      ),
    },
    {
      id: "status",
      header: "ТӨЛӨВ",
      render: user => user.suspendedAt
        ? <span className="rounded-full bg-[var(--a-neg-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-neg)]">Түр хаагдсан</span>
        : <span className="rounded-full bg-[var(--a-pos-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--a-pos)]">Идэвхтэй</span>,
    },
    { id: "lastSignedIn", header: "СҮҮЛД НЭВТЭРСЭН", cellClassName: "border-b border-[var(--a-border)] py-4 text-xs text-[var(--a-muted)]", render: user => user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleDateString("mn-MN") : "—" },
  ];

  // 2026-09-07 (Project "SUGI Desk" Phase 1): search/pagination/selection
  // for the Products table now live inside <GenericListView> (see
  // client/src/components/admin/GenericListView.tsx) instead of being
  // hand-rolled here — filteredProducts/pagedProducts/productPage/
  // selectedProductIds are gone. The catalog is ~940 real products (see
  // PRODUCT-IMPORT.md), which is exactly why GenericListView paginates by
  // default rather than rendering an endless-scroll table.
  const PRODUCTS_PAGE_SIZE = 25;
  // `users` is already the server-filtered page for the current search
  // (see usersQuery above); kept under this name for the ROLE MANAGEMENT
  // block below, which lists the same rows.
  const filteredUsers = users;
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

  const openProductComposer = async (product?: ProductRow) => {
    if (product) {
      // Audit 2026-09-09 (R4): the list no longer carries every product's
      // full description -- load this one product's on open instead.
      let description = "";
      if (!preview) {
        try {
          description = (await utils.admin.productDetail.fetch({ id: product.id })).description ?? "";
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Бүтээгдэхүүний дэлгэрэнгүйг уншиж чадсангүй.");
          return;
        }
      }
      setProductForm({ id: product.id, categoryId: String(product.categoryId), name: product.name, slug: product.slug, brand: product.brand ?? "", shortDescription: product.shortDescription ?? "", description, sku: product.sku, priceMnt: String(product.priceMnt), compareAtPriceMnt: product.compareAtPriceMnt ? String(product.compareAtPriceMnt) : "", costMnt: product.costMnt ? String(product.costMnt) : "", imageUrl: product.imageUrl ?? "", stockQuantity: String(product.stockQuantity), isPublished: product.isPublished, skinType: product.skinType ?? "", skinConcerns: product.skinConcerns ?? "", interiorStyle: product.interiorStyle ?? "", hairType: product.hairType ?? "", hairConcerns: product.hairConcerns ?? "", fragrancePreference: product.fragrancePreference ?? "", wellnessInterests: product.wellnessInterests ?? "" });
      // Tracked separately from productForm.slug/.isPublished (which the
      // admin can edit before saving) -- the "view live" link must always
      // point at what's ACTUALLY live right now, never a not-yet-saved
      // candidate slug that would just 404.
      setLiveProductRef({ slug: product.slug, isPublished: product.isPublished });
    } else {
      setProductForm({ ...emptyProduct(), categoryId: categories[0] ? String(categories[0].id) : "" });
      setLiveProductRef(null);
    }
    setComposer("product");
  };

  const openCategoryComposer = (category?: CategoryRow) => {
    setCategoryForm(category ? { id: category.id, name: category.name, slug: category.slug, description: category.description ?? "", imageUrl: category.imageUrl ?? "", sortOrder: String(category.sortOrder), isActive: category.isActive } : emptyCategory());
    // Shop.tsx's category filter matches by NAME, not slug (shared/
    // catalog-filter.ts's filterCatalogProducts) -- the URL slug field
    // below isn't actually what /shop?category=... reads, so this is
    // tracked (and linked) by name, same staleness discipline as
    // liveProductRef/liveRoutineRef above.
    setLiveCategoryRef(category ? { name: category.name, isActive: category.isActive } : null);
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

  // 2026-09-07: selection now lives inside <GenericListView>, so this takes
  // the selected ids + a clear-selection callback from its bulkActions
  // render prop instead of reading/resetting its own state.
  const applyBulkPublish = async (isPublished: boolean, ids: number[], clearSelection: () => void) => {
    if (preview) {
      toast.message("Preview горим", { description: "Багц үйлдэл зөвхөн хамгаалагдсан /admin хэсэгт ажиллана." });
      return;
    }
    try {
      const result = await bulkUpdateProductPublishStatus.mutateAsync({ ids, isPublished });
      if (result.failed.length > 0) toast.error(`${result.succeeded.length} шинэчлэгдлээ, ${result.failed.length} амжилтгүй.`);
      else toast.success(`${result.succeeded.length} бүтээгдэхүүний төлөв шинэчлэгдлээ.`);
      clearSelection();
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const productColumns: GenericListColumn<ProductRow>[] = [
    {
      id: "name",
      header: "БҮТЭЭГДЭХҮҮН",
      render: product => (
        <>
          <strong className="block">{product.name}</strong>
          <small className="mt-1 block text-[10px] font-bold tracking-[.08em] text-[var(--a-faint)]">{product.sku}</small>
        </>
      ),
    },
    {
      id: "category",
      header: "АНГИЛАЛ",
      cellClassName: "border-b border-[var(--a-border)] py-4 text-xs text-[var(--a-muted)]",
      render: product => product.categoryName ?? "Ангилалгүй",
    },
    {
      id: "price",
      header: "ҮНЭ",
      cellClassName: "border-b border-[var(--a-border)] py-4 font-bold",
      render: product => formatMnt(product.priceMnt),
    },
    {
      id: "stock",
      header: "ҮЛДЭГДЭЛ",
      render: product => <span className={product.stockQuantity === 0 ? "font-bold text-[#df1f3d]" : "font-bold"}>{product.stockQuantity} ш</span>,
    },
    {
      id: "status",
      header: "ТӨЛӨВ",
      render: product => (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${product.isPublished ? "bg-[var(--a-pos-soft)] text-[var(--a-pos)]" : "bg-[var(--a-warn-soft)] text-[var(--a-warn)]"}`}>
          {product.isPublished ? "Нийтлэгдсэн" : "Ноорог"}
        </span>
      ),
    },
  ];

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

  const changeUserRole = async (userId: number, role: "user" | "staff" | "finance" | "marketing" | "warehouse" | "admin") => {
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

  const sectionLabel = section === "dashboard" ? "Хянах самбар" : section === "products" ? "Бүтээгдэхүүн" : section === "orders" ? "Захиалга" : section === "posts" ? "Шинэ мэдээ" : section === "reviews" ? "Сэтгэгдэл" : section === "routines" ? "Routine" : section === "promotions" ? "Урамшуулал" : section === "calendar" ? "Хуанли" : section === "discountCodes" ? "Хямдралын код" : section === "brands" ? "Топ брэндүүд" : section === "branches" ? "Салбарууд" : section === "pos" ? "Дэлгүүрийн худалдаа" : section === "media" ? "Content & Media" : section === "documents" ? "Баримт бичиг" : section === "loyalty" ? "Гишүүнчлэлийн зэрэглэл" : section === "campaigns" ? "Кампанит ажил" : section === "storeSettings" ? "Дэлгүүрийн тохиргоо" : section === "analytics" ? "Аналитик" : section === "security" ? "Аюулгүй байдал" : section === "integrations" ? "Интеграцууд" : section === "notifications" ? "Утасны мэдэгдэл" : section === "receiving" ? "Бараа хүлээн авах" : "Хэрэглэгч";
  // The tab used to read as the storefront ("SUGI ASAYAKE Mongolia — ...") for
  // every admin screen, so two admin tabs could not be told apart.
  useDocumentMeta(`${sectionLabel} · Админ — SUGI ASAYAKE`, null);
  // Same query AdminDashboardHome makes (undefined input) -- React Query
  // dedupes identical query keys, so this is a free cache read whenever
  // the dashboard section already fetched it, and a real (still cheap)
  // fetch otherwise. The bell needs a real count regardless of which
  // section is currently open, not just while looking at the dashboard.
  const notificationSummaryQuery = trpc.admin.dashboardSummary.useQuery(undefined, { enabled: !preview });
  const lowStockCount = notificationSummaryQuery.data?.lowStockProducts.length ?? 0;
  const failedPaymentCount = notificationSummaryQuery.data?.failedPayments.length ?? 0;
  const notificationCount = preview ? 0 : lowStockCount + failedPaymentCount;
  // Sidebar count pills (the reference's green "02" on Review). Real,
  // actionable numbers only -- see NavBadges' own comment in AdminSidebar.
  const navBadges: NavBadges = preview ? {} : { products: lowStockCount, orders: failedPaymentCount };

  return (
    // .admin-shell owns every color token the admin renders (see the ADMIN
    // DESIGN SYSTEM block in index.css); data-admin-theme is what flips them.
    <div className="admin-shell flex min-h-screen" data-admin-theme={adminTheme}>
      <AdminCommandPalette
        preview={preview}
        role={role}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={target => { setSection(target); setQuery(""); setComposer(null); }}
        onSelectProduct={sku => { setSection("products"); setQuery(sku); setComposer(null); }}
        onSelectOrder={orderNumber => { setSection("orders"); setQuery(orderNumber); setComposer(null); }}
        onSelectUser={emailOrName => { setSection("users"); setQuery(emailOrName); setComposer(null); }}
      />
      <AdminSidebar
        section={section}
        role={role}
        badges={navBadges}
        onSelect={target => { setSection(target); setQuery(""); setComposer(null); }}
        onLogout={logout}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          sectionLabel={sectionLabel}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          searchSlot={<AdminGlobalSearch
            preview={preview}
            onNavigate={target => { setSection(target); setQuery(""); setComposer(null); }}
            onSelectProduct={sku => { setSection("products"); setQuery(sku); setComposer(null); }}
            onSelectOrder={orderNumber => { setSection("orders"); setQuery(orderNumber); setComposer(null); }}
            onSelectUser={emailOrName => { setSection("users"); setQuery(emailOrName); setComposer(null); }}
          />}
          notificationSlot={<AdminNotificationBell
            preview={preview}
            attentionCount={notificationCount}
            attentionLabel={[lowStockCount > 0 ? `Нөөц дуусч буй ${lowStockCount} бараа` : "", failedPaymentCount > 0 ? `${failedPaymentCount} амжилтгүй төлбөр` : ""].filter(Boolean).join(" · ")}
            visibleSections={visibleSections}
            onNavigate={target => { setSection(target); setQuery(""); setComposer(null); }}
          />}
          onOpenCommandPalette={() => setPaletteOpen(true)}
          userName={currentUser?.name ?? currentUser?.email ?? "Админ"}
          userRoleLabel={roleLabel(role)}
          userAvatarUrl={currentUser?.avatarUrl ?? null}
          onLogout={logout}
        />
        <div className="mx-auto w-full max-w-[1520px] flex-1 p-4 sm:p-6 lg:p-7">
          {preview && <div className="mb-6 flex gap-3 rounded-2xl border border-[var(--a-warn)] bg-[var(--a-warn-soft)] p-4 text-xs leading-5 text-[var(--a-warn)]"><ShieldCheck className="mt-0.5 shrink-0" size={17} /><p><strong>Preview only.</strong> Энэ дэлгэц нь удирдлагын интерфэйсийн загвар юм. Бодит <code>/admin</code> зам нь нэвтэрсэн, <code>admin</code> эрхтэй хэрэглэгчдэд хамгаалагдсан.</p></div>}
          {/* The dashboard renders straight onto the canvas (the reference
              has no outer panel there -- its cards ARE the layout); every
              other section keeps a single card shell around its header +
              content. */}
          <section className={section === "dashboard" ? "min-w-0" : "admin-card min-w-0 p-5 sm:p-7"}>
            <div className={`mb-6 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${section === "dashboard" ? "hidden" : "flex"}`}>
              <div><h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-.06em]">{section === "dashboard" ? "Хянах самбар" : section === "products" ? "Бүтээгдэхүүний сан" : section === "orders" ? "Захиалгын гүйцэтгэл" : section === "posts" ? "Шинэ бүтээгдэхүүний пост" : section === "reviews" ? "Сэтгэгдэл ба үнэлгээ" : section === "routines" ? "Routine (арчилгааны дараалал)" : section === "promotions" ? "Урамшуулал (попап/banner)" : section === "calendar" ? "Контентийн хуанли" : section === "discountCodes" ? "Хямдралын код" : section === "brands" ? "Топ брэндүүд" : section === "branches" ? "Салбарууд" : section === "pos" ? "Дэлгүүрийн худалдаа" : section === "media" ? "Content & Media" : section === "documents" ? "Баримт бичиг" : section === "loyalty" ? "Гишүүнчлэлийн зэрэглэл" : section === "campaigns" ? "Кампанит ажил" : section === "storeSettings" ? "Дэлгүүрийн тохиргоо" : section === "analytics" ? "Аналитик ба тайлан" : section === "security" ? "Аюулгүй байдал" : section === "integrations" ? "Интеграцууд" : section === "notifications" ? "Утасны мэдэгдэл" : section === "receiving" ? "Бараа хүлээн авах ба тооллого" : "Хэрэглэгч ба эрх"}</h1><p className="mt-1 text-xs text-[var(--a-muted)]">{section === "dashboard" ? "Дэлгүүрийн ерөнхий байдал нэг дэлгэцэд" : section === "products" ? "SKU, үнэ, үлдэгдэл, нийтлэх төлөв" : section === "orders" ? "Төлбөрийн төлөв, хүргэлтийн явц, захиалгын мэдээлэл" : section === "posts" ? "Бодитоор хадгалагдах шинэ бүтээгдэхүүний мэдээ" : section === "reviews" ? "Баталгаажсан худалдан авалтын сэтгэгдэл, жижиг moderation" : section === "routines" ? "Алхам дараалалтай бүтээгдэхүүний багц, идэвхтэй хямдралтай" : section === "promotions" ? "Шинэ бүтээгдэхүүн, хямдрал зарлах попап/banner мессеж" : section === "calendar" ? "Товлогдсон пост, урамшууллын хугацааг нэг дэлгэцэд" : section === "discountCodes" ? "Захиалгын үед оруулах хямдралын код (жишээ нь SALE10)" : section === "brands" ? "Нүүр хуудасны 'Топ брэндүүд' хэсэгт харагдах бодит брэндүүд" : section === "branches" ? "Дэлгүүрийн бодит салбарууд — хаяг, утас, зураг, захиалгын дэлгэрэнгүй" : section === "pos" ? "Дэлгүүрт биечлэн ирж худалдан авсан борлуулалтыг бүртгэх" : section === "documents" ? "Нууцлал, үйлчилгээний нөхцөл, буцаалтын хуудсыг засварлах" : section === "loyalty" ? "Нийт худалдан авалтаар олгох хөнгөлөлтийн зэрэглэлүүд" : section === "media" ? "Нүүр хуудасны зураг болон текстийг кодгүйгээр солих" : section === "campaigns" ? "Сегмент болон гишүүнчлэлийн зэрэглэлээр имэйл/SMS илгээх" : section === "storeSettings" ? "Хүргэлтийн үнэ, хямдралын доод дүн, захиалгын имэйл мессежийг кодгүйгээр удирдах" : section === "analytics" ? "Борлуулалт, ашиг, харилцагчийн бодит дата нэг дэлгэцэд" : section === "security" ? "Admin аудит лог, нэвтрэлтийн түүх, Honeybadger алдааны хяналт" : section === "integrations" ? "Утасны мэдэгдэл (ntfy), QPay, И-баримт, Smart Software болон бусад үйлчилгээний тохиргоо" : section === "notifications" ? "Захиалга, төлбөр, нөөцийн мэдэгдлийг утсан дээрээ авах" : section === "receiving" ? "Ирсэн барааг сканнероор уншуулж нөөцөд нэмэх, тавиурын тооллого хийх" : "Шинэ хэрэглэгчийг урих болон staff/admin эрх удирдах"}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                {section === "products" && <>
                  <button type="button" onClick={() => setShowProductExport(current => !current)} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 py-3 text-xs font-bold text-[var(--a-text-soft)] transition hover:-translate-y-0.5 hover:border-[#df1f3d] hover:text-[#df1f3d] active:scale-[.97]"><Download size={15} />Экспорт</button>
                  <button type="button" onClick={() => setShowProductImport(true)} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4 py-3 text-xs font-bold text-[var(--a-text-soft)] transition hover:-translate-y-0.5 hover:border-[#df1f3d] hover:text-[#df1f3d] active:scale-[.97]"><Upload size={15} />Импорт (CSV)</button>
                  <button type="button" onClick={() => openCategoryComposer()} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#df1f3d]/25 bg-[var(--a-card)] px-4 py-3 text-xs font-bold text-[var(--a-neg)] transition hover:-translate-y-0.5 hover:border-[#df1f3d] active:scale-[.97]"><Tags size={15} />Ангилал</button>
                  <button type="button" onClick={() => openProductComposer()} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#bc1732] active:scale-[.97]"><PackagePlus size={16} />Бүтээгдэхүүн нэмэх</button>
                  <AdminProductImportModal open={showProductImport} onOpenChange={setShowProductImport} />
                </>}
                {section !== "dashboard" && section !== "posts" && section !== "reviews" && section !== "routines" && section !== "promotions" && section !== "calendar" && section !== "discountCodes" && section !== "brands" && section !== "branches" && section !== "pos" && section !== "media" && section !== "campaigns" && section !== "storeSettings" && section !== "security" && section !== "integrations" && section !== "notifications" && section !== "receiving" && section !== "documents" && section !== "loyalty" && <label className="flex h-10 items-center gap-2 rounded-full border border-[var(--a-border)] bg-[var(--a-card)] px-4"><Search size={15} className="text-[var(--a-faint)]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={section === "users" ? "Нэр эсвэл имэйл хайх" : section === "orders" ? "Дугаар, хэрэглэгч, утас хайх" : "Нэр, SKU хайх"} className="w-full bg-transparent text-xs outline-none" /></label>}
              </div>
            </div>
            {/* One "what is this screen for" panel per section (2026-09-12).
                Rendered once here rather than inside each panel so a new
                section cannot ship without help, and so the on/off toggle has
                a single place to take effect. */}
            <AdminSectionTip section={section} />
            {section === "dashboard" && <AdminDashboardHome
              preview={preview}
              canSeeFinancials={canSeeFinancials}
              canSeeAuditTrail={canSeeAuditTrail}
              userName={currentUser?.name ?? currentUser?.phone ?? "админ"}
              onNavigate={target => { setSection(target); setQuery(""); }}
              onSearchIn={(target, searchQuery) => { setSection(target); setQuery(searchQuery); setComposer(null); }}
            />}
            {section === "security" && !preview && <AdminSecurityCenter />}
            {section === "security" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд аудит лог харагдахгүй.</div>}
            {section === "reviews" && !preview && <AdminReviewsPanel />}
            {section === "reviews" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд сэтгэгдэл харагдахгүй.</div>}
            {section === "routines" && !preview && <AdminRoutinesPanel />}
            {section === "routines" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд Routine удирдлага харагдахгүй.</div>}
            {section === "promotions" && !preview && <AdminPromotionsPanel />}
            {section === "promotions" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд урамшуулал удирдлага харагдахгүй.</div>}
            {section === "calendar" && !preview && <AdminContentCalendarPanel onNavigate={target => { setSection(target); setQuery(""); setComposer(null); }} />}
            {section === "calendar" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд хуанли харагдахгүй.</div>}
            {section === "discountCodes" && !preview && <AdminDiscountCodesPanel />}
            {section === "discountCodes" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд хямдралын код удирдлага харагдахгүй.</div>}
            {section === "brands" && !preview && <AdminBrandsPanel />}
            {section === "brands" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд Топ брэнд удирдлага харагдахгүй.</div>}
            {section === "branches" && !preview && <AdminBranchesPanel />}
            {section === "branches" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд салбарын удирдлага харагдахгүй.</div>}
            {section === "pos" && !preview && <AdminPosPanel />}
            {section === "pos" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд дэлгүүрийн худалдаа харагдахгүй.</div>}
            {section === "campaigns" && !preview && <AdminCampaignsPanel />}
            {section === "campaigns" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд кампанит ажил харагдахгүй.</div>}
            {section === "storeSettings" && <AdminStoreSettingsPanel preview={preview} />}
            {section === "documents" && <AdminDocumentsPanel preview={preview} />}
            {section === "loyalty" && <AdminLoyaltyTiersPanel preview={preview} />}
            {section === "integrations" && !preview && <AdminIntegrationsPanel />}
            {section === "integrations" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд интеграцийн тохиргоо харагдахгүй.</div>}
            {section === "notifications" && !preview && <AdminNotificationsPanel />}
            {section === "receiving" && !preview && <AdminReceivingPanel />}
            {section === "receiving" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд бараа хүлээн авах хэсэг харагдахгүй.</div>}
            {section === "notifications" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд утасны мэдэгдлийн тохиргоо харагдахгүй.</div>}
            {section === "analytics" && !preview && <AdminAnalyticsPanel />}
            {section === "analytics" && preview && <div className="rounded-3xl bg-[var(--a-soft)] p-8 text-center text-sm text-[var(--a-muted)]">Preview горимд аналитик харагдахгүй.</div>}
            {section === "products" && <>
              {!preview && (productsQuery.isLoading || categoriesQuery.isLoading) && <div className="mb-5 flex items-center gap-2 text-xs text-[var(--a-muted)]"><LoaderCircle className="animate-spin" size={15} />Каталогийн мэдээллийг уншиж байна…</div>}
              {!preview && (productsQuery.error || categoriesQuery.error) && <div className="mb-5 rounded-2xl bg-[var(--a-neg-soft)] p-4 text-xs text-[var(--a-neg)]">{messageFrom(productsQuery.error ?? categoriesQuery.error)}</div>}
              {showProductExport && <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--a-soft)] p-4"><label className="grid gap-1.5 text-xs font-bold">Ангилал<select value={exportCategoryFilter} onChange={event => setExportCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold">Төлөв<select value={exportPublishedFilter} onChange={event => setExportPublishedFilter(event.target.value as typeof exportPublishedFilter)} className="h-10 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-normal outline-none focus:border-[#df1f3d]"><option value="all">Бүгд</option><option value="published">Нийтлэгдсэн</option><option value="draft">Ноорог</option></select></label><button type="button" onClick={exportProductsCsv} className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><Download size={14} />CSV татах</button></div>}
              <div className="mb-5 flex flex-wrap gap-2">{categories.map(category => <button key={category.id} type="button" onClick={() => openCategoryComposer(category)} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--a-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--a-text-soft)] transition hover:bg-[var(--a-neg-soft)] hover:text-[var(--a-neg)]"><Tags size={12} />{category.name}<Pencil size={11} /></button>)}{categories.length === 0 && <button type="button" onClick={() => openCategoryComposer()} className="rounded-full border border-dashed border-[#df1f3d]/40 px-3 py-1.5 text-[11px] font-bold text-[var(--a-neg)]">Эхний ангиллаа үүсгэх</button>}</div>
              <GenericListView<ProductRow>
                rows={products}
                getRowId={product => product.id}
                columns={productColumns}
                searchQuery={query}
                getSearchText={product => `${product.name} ${product.sku} ${product.categoryName ?? ""}`}
                selectable
                bulkActions={({ selectedIds, clearSelection }) => (
                  <AdminBulkActionBar count={selectedIds.size} onClear={clearSelection}>
                    <button type="button" disabled={isBulkProductBusy} onClick={() => applyBulkPublish(true, Array.from(selectedIds, id => id as number), clearSelection)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Нийтлэх</button>
                    <button type="button" disabled={isBulkProductBusy} onClick={() => applyBulkPublish(false, Array.from(selectedIds, id => id as number), clearSelection)} className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25 disabled:opacity-50">Ноорог болгох</button>
                  </AdminBulkActionBar>
                )}
                pageSize={PRODUCTS_PAGE_SIZE}
                itemLabel="бүтээгдэхүүн"
                emptyMessage={hasQuery => hasQuery ? "Хайлтад тохирох бүтээгдэхүүн олдсонгүй." : "Одоогоор бүтээгдэхүүн алга. Ангилал үүсгээд эхний бүтээгдэхүүнээ нэмээрэй."}
                rowActions={product => (
                  <div className="flex justify-end gap-1">
                    {product.isPublished && <a href={`/product/${product.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[var(--a-info)]" aria-label={`${product.name} — амьд хуудсыг харах`} title="Амьд хуудсыг харах"><ExternalLink size={15} /></a>}
                    <button type="button" disabled={isCatalogBusy} onClick={() => openProductComposer(product)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-soft)] hover:text-[#df1f3d]" aria-label={`${product.name} засах`} title="Засах"><Pencil size={15} /></button>
                    <button type="button" disabled={isCatalogBusy} onClick={() => removeProduct(product)} className="rounded-full p-2 text-[var(--a-muted)] transition hover:bg-[var(--a-neg-soft)] hover:text-[#df1f3d]" aria-label={`${product.name} устгах`} title="Устгах"><Trash2 size={15} /></button>
                  </div>
                )}
              />
            </>}
            {section === "orders" && <AdminOperationsPanel preview={preview} query={query} role={role} />}
            {section === "posts" && <AdminPostsPanel preview={preview} />}
            {section === "media" && (
              <>
                <div className="mb-5 inline-flex rounded-full border border-[var(--a-border)] bg-[var(--a-card)] p-1">
                  <button type="button" onClick={() => setMediaTab("images")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${mediaTab === "images" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)]"}`}>Зураг</button>
                  <button type="button" onClick={() => setMediaTab("text")} className={`rounded-full px-4 py-2 text-xs font-bold transition ${mediaTab === "text" ? "bg-[var(--a-btn-dark)] text-white" : "text-[var(--a-text-soft)]"}`}>Текст</button>
                </div>
                {mediaTab === "images" && <ContentMediaPanel preview={preview} />}
                {mediaTab === "text" && <ContentTextPanel preview={preview} />}
              </>
            )}
            {section === "users" && (
              <GenericListView<UserRow>
                rows={users}
                getRowId={user => user.id}
                columns={userColumns}
                tableClassName="min-w-[720px] w-full border-separate border-spacing-0 text-left"
                serverPagination={{ page: usersPage, pageSize: USERS_PAGE_SIZE, total: usersTotal, onPageChange: setUsersPage }}
                itemLabel="хэрэглэгч"
                emptyMessage="Хэрэглэгч олдсонгүй."
                rowActions={user => !preview && <button type="button" onClick={() => setSelectedUserId(user.id)} className="rounded-full border border-[var(--a-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--a-text-soft)] transition hover:border-[#df1f3d] hover:text-[#df1f3d]">Дэлгэрэнгүй</button>}
              />
            )}

            {/* 2026-09-05 ("admin invite staff section just change it to manually
                only admin give staff role to default users" -- Tom, explicit):
                the old 2-column "ROLE MANAGEMENT" + "ACTIVE INVITATIONS" layout
                is gone along with the email-invite flow -- this is now the
                only staff-access control, full width. Утас олдохгүй бол
                "Дэлгэрэнгүй" цонхны (AdminUserDetailDrawer) шинэ утас засах
                хэрэгслээр (recovery path) нэмнэ. */}
            {/* "Controls everything" admin overhaul (2026-09-08, Phase H):
                Users is now finance-reachable too (usersReadProcedure), but
                admin.updateUserRole stays adminProcedure-only -- gated here
                so finance never sees an interactive role dropdown that
                would just 403 on click (same class of bug as the Kanban
                board's fulfilment dropdown earlier in this overhaul). */}
            {section === "users" && role === "admin" && <section className="mt-7 rounded-3xl bg-[var(--a-soft)] p-5">
              <p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">ROLE MANAGEMENT</p>
              <p className="mt-2 text-xs leading-5 text-[var(--a-muted)]">Одоо бүртгэлтэй хэрэглэгчийн эрхийг эндээс шууд өөрчилнө — шинэ ажилтныг урих шаардлагагүй, тухайн хүн эхлээд өөрөө утасны дугаараа ашиглан бүртгүүлсэн байх ёстой. Админ эрх нь каталог, захиалга, хэрэглэгчийн эрхийг удирдах боломж олгоно. Өөрийн эрхийг энэ дэлгэцээс бууруулахгүй.</p>
              <div className="mt-4 grid gap-2">{filteredUsers.map(user => <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--a-card)] px-3 py-3"><div className="min-w-0"><strong className="block truncate text-xs">{user.name ?? user.phone ?? user.email ?? "Хэрэглэгч"}</strong><span className="block truncate text-[11px] text-[var(--a-muted)]">{user.phone ?? "Утасгүй"}</span></div>{preview ? <span className="text-xs font-bold">{roleLabel(user.role)}</span> : <select aria-label="Эрх" value={user.role} disabled={isUserBusy} onChange={event => changeUserRole(user.id, event.target.value as "user" | "staff" | "finance" | "marketing" | "warehouse" | "admin")} className="h-9 rounded-lg border border-[var(--a-border)] bg-[var(--a-card)] px-2 text-xs font-bold outline-none focus:border-[#df1f3d]"><option value="user">User</option><option value="staff">Staff</option><option value="finance">Finance</option><option value="marketing">Marketing</option><option value="warehouse">Warehouse</option><option value="admin">Admin</option></select>}</div>)}</div>
            </section>}

            {composer === "product" && <form onSubmit={saveProduct} className="mt-7 rounded-3xl border border-[#df1f3d]/25 bg-[var(--a-neg-soft)] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[#df1f3d]">PRODUCT {productForm.id ? "EDIT" : "CREATION"}</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{productForm.id ? "Бүтээгдэхүүн засах" : "Шинэ бүтээгдэхүүн нэмэх"}</h3></div><div className="flex items-center gap-4">{liveProductRef?.isPublished && <a href={`/product/${liveProductRef.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-info)]"><ExternalLink size={13} />Амьд хуудсыг харах</a>}<button type="button" onClick={() => setComposer(null)} className="text-xs font-bold text-[var(--a-muted)]">Хаах</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={productForm.name} onChange={event => setProductForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">SKU<input required value={productForm.sku} onChange={event => setProductForm(current => ({ ...current, sku: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={productForm.slug} onChange={event => setProductForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /><span className="mt-0.5 block text-[11px] font-normal text-[var(--a-faint)]">Бодит хаяг: /product/{productForm.slug || "…"}</span></label><label className="grid gap-1.5 text-xs font-bold">Ангилал<select required value={productForm.categoryId} onChange={event => setProductForm(current => ({ ...current, categoryId: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]"><option value="" disabled>Сонгох</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-xs font-bold">Брэнд<input value={productForm.brand} onChange={event => setProductForm(current => ({ ...current, brand: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Үнэ (₮)<input required min="0" type="number" value={productForm.priceMnt} onChange={event => setProductForm(current => ({ ...current, priceMnt: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold">Хуучин үнэ (сонголтоор)<input min="0" type="number" value={productForm.compareAtPriceMnt} onChange={event => setProductForm(current => ({ ...current, compareAtPriceMnt: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>{role === "admin"
  ? <label className="grid gap-1.5 text-xs font-bold">Өртөг үнэ, зөвхөн админд (сонголтоор)<input min="0" type="number" value={productForm.costMnt} onChange={event => setProductForm(current => ({ ...current, costMnt: event.target.value }))} placeholder="Ашиг тооцоход л ашиглагдана" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label>
  // Project "SUGI Desk" Phase 2: field-level permission, enforced server-side
  // in server/routers.ts (warehouse never receives the real value, and any
  // value warehouse submits is force-stripped -- see Admin overhaul Phase B:
  // admin.updateProduct moved from staffProcedure to warehouseProcedure, but
  // costMnt stays admin-only regardless of who owns the product record) --
  // this is just the matching client-side affordance so a warehouse session
  // sees a locked field instead of a confusingly-always-blank editable one.
  : <div className="grid gap-1.5 text-xs font-bold text-[var(--a-faint)]">Өртөг үнэ<div className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-[var(--a-border)] bg-[var(--a-soft)] px-3 text-xs font-normal">🔒 Зөвхөн админд харагдана</div></div>}<label className="grid gap-1.5 text-xs font-bold">Үлдэгдэл<input required min="0" type="number" value={productForm.stockQuantity} onChange={event => setProductForm(current => ({ ...current, stockQuantity: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Товч тайлбар<textarea value={productForm.shortDescription} onChange={event => setProductForm(current => ({ ...current, shortDescription: event.target.value }))} className="min-h-20 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Дэлгэрэнгүй тайлбар<textarea value={productForm.description} onChange={event => setProductForm(current => ({ ...current, description: event.target.value }))} className="min-h-28 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm font-normal outline-none focus:border-[#df1f3d]" /></label><div className="sm:col-span-2 rounded-2xl bg-white/60 p-3"><p className="text-[10px] font-extrabold tracking-[.12em] text-[var(--a-info)]">PERSONALIZATION TAGS (сонголтоор)</p><p className="mt-1 text-[11px] text-[var(--a-muted)]">"Танд санал болгох" section-д ашиглагдана — хэрэглэгчийн профайл дээрх тохиргоотой таарвал энэ бараа санал болгогдоно. Зурын доорх зурвасууд бол зөвхөн санал — дарж сонговол л хадгалагдана.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold">Арьсны төрөл (skincare)<select value={productForm.skinType} onChange={event => setProductForm(current => ({ ...current, skinType: event.target.value as ProductForm["skinType"] }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]"><option value="">Бүх төрөлд (сонгоогүй)</option>{Object.entries(skinTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <TagSuggestionChips suggestions={tagSuggestions.skinType ? [tagSuggestions.skinType] : []} current={productForm.skinType ? [productForm.skinType] : []} labelFor={value => skinTypeLabels[value] ?? value} onApply={value => setProductForm(current => ({ ...current, skinType: value as ProductForm["skinType"] }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Арчилгааны зорилго (таслалаар тусгаарлаж)<input value={productForm.skinConcerns} onChange={event => setProductForm(current => ({ ...current, skinConcerns: event.target.value }))} placeholder="жишээ: acne,aging" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
                <TagSuggestionChips suggestions={tagSuggestions.skinConcerns ?? []} current={productForm.skinConcerns.split(",").map(v => v.trim()).filter(Boolean)} labelFor={value => skinConcernLabelByValue.get(value) ?? value} onApply={value => setProductForm(current => { const list = current.skinConcerns.split(",").map(v => v.trim()).filter(Boolean); return { ...current, skinConcerns: [...list, value].join(",") }; })} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Үсний төрөл (hair &amp; body)<select value={productForm.hairType} onChange={event => setProductForm(current => ({ ...current, hairType: event.target.value as ProductForm["hairType"] }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]"><option value="">Бүх төрөлд (сонгоогүй)</option>{Object.entries(hairTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <TagSuggestionChips suggestions={tagSuggestions.hairType ? [tagSuggestions.hairType] : []} current={productForm.hairType ? [productForm.hairType] : []} labelFor={value => hairTypeLabels[value as keyof typeof hairTypeLabels] ?? value} onApply={value => setProductForm(current => ({ ...current, hairType: value as ProductForm["hairType"] }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Үсний санаа зовдог асуудал (таслалаар тусгаарлаж)<input value={productForm.hairConcerns} onChange={event => setProductForm(current => ({ ...current, hairConcerns: event.target.value }))} placeholder="жишээ: hairloss,dandruff" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
                <TagSuggestionChips suggestions={tagSuggestions.hairConcerns ?? []} current={productForm.hairConcerns.split(",").map(v => v.trim()).filter(Boolean)} labelFor={value => hairConcernLabelByValue.get(value) ?? value} onApply={value => setProductForm(current => { const list = current.hairConcerns.split(",").map(v => v.trim()).filter(Boolean); return { ...current, hairConcerns: [...list, value].join(",") }; })} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Үнэрийн сонголт<select value={productForm.fragrancePreference} onChange={event => setProductForm(current => ({ ...current, fragrancePreference: event.target.value as ProductForm["fragrancePreference"] }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]"><option value="">Бүх төрөлд (сонгоогүй)</option>{Object.entries(fragrancePreferenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <TagSuggestionChips suggestions={tagSuggestions.fragrancePreference ? [tagSuggestions.fragrancePreference] : []} current={productForm.fragrancePreference ? [productForm.fragrancePreference] : []} labelFor={value => fragrancePreferenceLabels[value as keyof typeof fragrancePreferenceLabels] ?? value} onApply={value => setProductForm(current => ({ ...current, fragrancePreference: value as ProductForm["fragrancePreference"] }))} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold">Эрүүл мэндийн сонирхол (таслалаар тусгаарлаж)<input value={productForm.wellnessInterests} onChange={event => setProductForm(current => ({ ...current, wellnessInterests: event.target.value }))} placeholder="жишээ: energy,immune" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" />
                <TagSuggestionChips suggestions={tagSuggestions.wellnessInterests ?? []} current={productForm.wellnessInterests.split(",").map(v => v.trim()).filter(Boolean)} labelFor={value => wellnessInterestLabelByValue.get(value) ?? value} onApply={value => setProductForm(current => { const list = current.wellnessInterests.split(",").map(v => v.trim()).filter(Boolean); return { ...current, wellnessInterests: [...list, value].join(",") }; })} />
              </label>
              <label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Интерьерийн загвар (interior бараанд)<input value={productForm.interiorStyle} onChange={event => setProductForm(current => ({ ...current, interiorStyle: event.target.value }))} placeholder="жишээ: minimalist" className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label>
            </div></div>{productForm.id && <AdminProductVariantsPanel productId={productForm.id} />}{productForm.id && <div className="sm:col-span-2"><AdminHistoryPanel entityType="product" entityId={productForm.id} canSeeAuditTrail={canSeeAuditTrail} /></div>}<div className="sm:col-span-2"><p className="text-xs font-bold">Бүтээгдэхүүний зураг</p><div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-[#df1f3d]/30 bg-[var(--a-card)] p-3 sm:flex-row sm:items-center"><label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--a-btn-dark)] px-4 text-xs font-bold text-white transition hover:bg-[#df1f3d]"><ImageUp size={15} />{uploadProductImage.isPending ? "Байршуулж байна…" : "Зураг сонгох"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onImageSelected} disabled={uploadProductImage.isPending} className="sr-only" /></label>{productForm.imageUrl ? <><img src={productForm.imageUrl} alt="Selected product" className="size-12 rounded-xl object-cover" /><span className="min-w-0 truncate text-xs text-[var(--a-muted)]">{productForm.imageUrl}</span></> : <span className="text-xs text-[var(--a-muted)]">JPG, PNG эсвэл WEBP · 8 MB хүртэл</span>}</div></div><label className="flex items-center gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold sm:col-span-2"><input type="checkbox" checked={productForm.isPublished} onChange={event => setProductForm(current => ({ ...current, isPublished: event.target.checked }))} className="size-4 accent-[#df1f3d]" />Нийтлэхэд бэлэн</label></div><button type="submit" disabled={isCatalogBusy || uploadProductImage.isPending} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#df1f3d] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isCatalogBusy && <LoaderCircle className="animate-spin" size={15} />}{productForm.id ? "Өөрчлөлт хадгалах" : "Бүтээгдэхүүн үүсгэх"}</button></form>}

            {composer === "category" && <form onSubmit={saveCategory} className="mt-7 rounded-3xl border border-[#3970a7]/25 bg-[var(--a-info-soft)] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[.14em] text-[var(--a-info)]">CATALOG CATEGORY</p><h3 className="mt-1 font-[var(--font-display)] text-xl font-semibold tracking-[-.05em]">{categoryForm.id ? "Ангилал засах" : "Шинэ ангилал үүсгэх"}</h3></div><div className="flex items-center gap-4">{liveCategoryRef?.isActive && <a href={`/shop?category=${encodeURIComponent(liveCategoryRef.name)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--a-info)]"><ExternalLink size={13} />Амьд хуудсыг харах</a>}<button type="button" onClick={() => setComposer(null)} className="text-xs font-bold text-[var(--a-muted)]">Хаах</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold">Нэр<input required value={categoryForm.name} onChange={event => setCategoryForm(current => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="grid gap-1.5 text-xs font-bold">URL slug<input required value={categoryForm.slug} onChange={event => setCategoryForm(current => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /><span className="mt-0.5 block text-[11px] font-normal text-[var(--a-faint)]">Тайлбар/дотоод зорилгоор л ашиглагдана — /shop дээрх шүүлтүүр нэрээр (дээрх талбар) тохирдог, энэ slug-оор биш.</span></label><label className="grid gap-1.5 text-xs font-bold">Эрэмбэ<input required min="0" type="number" value={categoryForm.sortOrder} onChange={event => setCategoryForm(current => ({ ...current, sortOrder: event.target.value }))} className="h-11 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] px-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label><label className="flex items-center gap-3 rounded-xl bg-[var(--a-card)] px-3 py-3 text-sm font-bold"><input type="checkbox" checked={categoryForm.isActive} onChange={event => setCategoryForm(current => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-[#3970a7]" />Идэвхтэй ангилал</label><label className="grid gap-1.5 text-xs font-bold sm:col-span-2">Тайлбар<textarea value={categoryForm.description} onChange={event => setCategoryForm(current => ({ ...current, description: event.target.value }))} className="min-h-20 rounded-xl border border-[var(--a-border)] bg-[var(--a-card)] p-3 text-sm font-normal outline-none focus:border-[#3970a7]" /></label></div><button type="submit" disabled={isCatalogBusy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#3970a7] px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{isCatalogBusy && <LoaderCircle className="animate-spin" size={15} />}{categoryForm.id ? "Өөрчлөлт хадгалах" : "Ангилал үүсгэх"}</button></form>}
          </section>
        </div>
      </div>
      {selectedUserId !== null && <AdminUserDetailDrawer userId={selectedUserId} role={role} onClose={() => setSelectedUserId(null)} />}
    </div>
  );
}
