import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Project "SUGI Desk" Phase 1 (2026-09-07) — the shared list-view engine
 * every admin section (Products, Reviews, Users, then Orders/...) retrofits
 * onto, instead of each hand-rolling its own table/filter/pagination/bulk-
 * select code. This is the native answer to "make the admin panel look and
 * function like Frappe's Desk UI" without adopting Frappe itself: Frappe's
 * List View gets every DocType saved filters, bulk actions, and consistent
 * paging for free from one shared engine — this component is that engine,
 * built in TypeScript on top of the existing tRPC data (see the approved
 * plan at .claude/plans/https-frappe-io-framework-deep-anaylyze-gentle-pudding.md).
 *
 * Deliberately renders a plain `<table>` (in table mode) with the exact
 * classes the current Products table already used, rather than adopting the
 * shadcn `ui/table.tsx`/`ui/pagination.tsx` primitives that exist in this
 * repo but are used nowhere yet — swapping to those is a real, separate
 * visual decision that deserves its own screenshot verification, not
 * something to bundle silently into this structural refactor.
 *
 * Filtering/pagination/selection all happen client-side, matching every
 * current admin list (`admin.products`/`admin.orders`/`admin.users` all
 * return their full, unfiltered result set today — see `server/db.ts`).
 * If a section ever needs server-side paging, that's a change to the
 * resource's own data-fetching, not to this component's contract.
 *
 * Two render modes:
 * - **Table mode** (pass `columns`): renders the shared `<table>` engine —
 *   used by Products/Reviews/Users today.
 * - **Card mode** (pass `renderRow` instead): Orders isn't a table at all
 *   (each order is an `<article>` card with inline editable controls) --
 *   `renderRow` gets the same filtering/pagination/selection engine as table
 *   mode without forcing a table structure on content that was never one.
 */

export type GenericListColumn<T> = {
  id: string;
  header: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => ReactNode;
};

export type GenericListViewProps<T> = {
  rows: T[];
  getRowId: (row: T) => number | string;
  /** Table mode. Omit when passing `renderRow` (card mode) instead. */
  columns?: GenericListColumn<T>[];
  /** Card mode: renders each row's own markup instead of a table row. */
  renderRow?: (row: T, ctx: { id: number | string; selected: boolean; toggleSelected: () => void }) => ReactNode;
  /** Card mode only: className for the wrapper around the rendered rows (default matches Orders' `grid gap-4`). */
  cardListClassName?: string;
  /**
   * The actual search `<input>` lives in the parent (several admin sections
   * share one search box today) -- this component just consumes the
   * current query text and a per-row search-text extractor. Omit both to
   * render every row with no filtering (e.g. when the caller, like Orders,
   * already pre-filters `rows` itself before passing them in).
   */
  searchQuery?: string;
  getSearchText?: (row: T) => string;
  /**
   * Selection state lives inside this component by default. "Select all"
   * operates on every row matching the current search, not just the visible
   * page -- mirrors the Products table's existing "bulk-publish everything
   * matching this search" behavior, not just what's on screen.
   *
   * Pass `selectedIds`/`onSelectedIdsChange` to make it controlled instead,
   * for sections (like Orders) whose surrounding UI needs to read/reset
   * selection from outside this component's own bulkActions render prop.
   */
  selectable?: boolean;
  selectedIds?: Set<number | string>;
  onSelectedIdsChange?: (next: Set<number | string>) => void;
  bulkActions?: (ctx: { selectedIds: Set<number | string>; selectedRows: T[]; clearSelection: () => void }) => ReactNode;
  /** Omit to render every row with no pager (e.g. Orders' current card-list has none). */
  pageSize?: number;
  /** Used in the "{a}–{b} / {n} {itemLabel}" pagination summary, e.g. "бүтээгдэхүүн". */
  itemLabel?: string;
  /**
   * Admin overhaul (2026-09-08, Phase M): opt-in server-side pagination, for
   * a section (Login History today) whose backend returns one page at a
   * time instead of every row up front. When set, `rows` is assumed to
   * already BE exactly the current page (no further client-side slicing or
   * search-text filtering happens here -- `searchQuery`/`getSearchText`
   * only make sense when this component owns the full result set). Every
   * other section that omits this keeps today's client-side-pageSize
   * behavior byte-for-byte.
   */
  serverPagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void };
  /** Table mode only: right-aligned, unlabeled actions column. Omit to not render one. */
  rowActions?: (row: T) => ReactNode;
  emptyMessage?: ReactNode | ((hasQuery: boolean) => ReactNode);
  /**
   * Style overrides for sections whose current table isn't pixel-identical
   * to Products' (e.g. Reviews uses `py-3`/`align-top`, not `py-4`) --
   * default to Products' own classes so most callers never need these.
   */
  tableClassName?: string;
  headerRowClassName?: string;
  rowClassName?: string | ((row: T) => string);
  /** The auto-generated unlabeled `rowActions` header/cell aren't per-column, so they get their own override hooks. */
  actionsHeaderClassName?: string;
  actionsCellClassName?: string;
};

export function GenericListView<T>({
  rows,
  getRowId,
  columns,
  renderRow,
  cardListClassName = "grid gap-4",
  searchQuery = "",
  getSearchText,
  selectable = false,
  selectedIds: controlledSelectedIds,
  onSelectedIdsChange,
  bulkActions,
  pageSize,
  itemLabel = "мөр",
  serverPagination,
  rowActions,
  emptyMessage,
  tableClassName = "min-w-[740px] w-full border-separate border-spacing-0 text-left",
  headerRowClassName = "text-[10px] font-extrabold tracking-[.13em] text-[#8a8b8f]",
  rowClassName = "group text-sm",
  actionsHeaderClassName = "border-b border-black/8 pb-3",
  actionsCellClassName = "border-b border-black/6 py-4 text-right",
}: GenericListViewProps<T>) {
  const [page, setPage] = useState(1);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<number | string>>(new Set());
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectedIdsChange ?? setInternalSelectedIds;

  // Server-paginated mode: rows already ARE the current page, so client-side
  // search-text filtering (which only sees this one page) would be
  // misleading -- skip it entirely rather than silently filtering a page at
  // a time.
  const filtered = useMemo(() => {
    if (serverPagination || !searchQuery || !getSearchText) return rows;
    const needle = searchQuery.toLowerCase();
    return rows.filter(row => getSearchText(row).toLowerCase().includes(needle));
  }, [rows, searchQuery, getSearchText, serverPagination]);

  // Reset to page 1 whenever the search narrows/widens the result set --
  // matches every current admin list's identical useEffect. Not applicable
  // when the parent owns the current page (serverPagination.page).
  useEffect(() => {
    if (!serverPagination) setPage(1);
  }, [searchQuery, serverPagination]);

  const totalPages = serverPagination
    ? Math.max(1, Math.ceil(serverPagination.total / serverPagination.pageSize))
    : pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;

  // Clamp down if the underlying data shrank (e.g. after a delete) past the
  // current page. Not applicable server-side -- the parent owns that page.
  useEffect(() => {
    if (!serverPagination) setPage(current => Math.min(current, totalPages));
  }, [totalPages, serverPagination]);

  const paged = serverPagination ? filtered : pageSize ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;

  // Computed directly off the current (possibly externally-owned) selectedIds
  // rather than via a `useState` updater callback, so this works identically
  // whether selection is internal or controlled by a parent's own useState.
  const toggleRow = (id: number | string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size > 0 && selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(getRowId)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedRows = useMemo(
    () => rows.filter(row => selectedIds.has(getRowId(row))),
    [rows, selectedIds, getRowId]
  );

  const resolvedEmptyMessage = typeof emptyMessage === "function" ? emptyMessage(Boolean(searchQuery)) : emptyMessage;

  if (renderRow) {
    return (
      <>
        {selectable && bulkActions && bulkActions({ selectedIds, selectedRows, clearSelection })}
        {filtered.length === 0 ? (
          resolvedEmptyMessage
        ) : (
          <div className={cardListClassName}>
            {paged.map(row => {
              const id = getRowId(row);
              return <div key={id}>{renderRow(row, { id, selected: selectedIds.has(id), toggleSelected: () => toggleRow(id) })}</div>;
            })}
          </div>
        )}
        {(Boolean(serverPagination) || Boolean(pageSize)) && filtered.length > 0 && (
          serverPagination
            ? <PaginationFooter page={serverPagination.page} setPage={updater => serverPagination.onPageChange(updater(serverPagination.page))} totalPages={totalPages} pageSize={serverPagination.pageSize} total={serverPagination.total} itemLabel={itemLabel} />
            : <PaginationFooter page={page} setPage={setPage} totalPages={totalPages} pageSize={pageSize as number} total={filtered.length} itemLabel={itemLabel} />
        )}
      </>
    );
  }

  const tableColumns = columns ?? [];
  const colSpan = tableColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <>
      {selectable && bulkActions && bulkActions({ selectedIds, selectedRows, clearSelection })}
      <div className="overflow-x-auto">
        <table className={tableClassName}>
          <thead>
            <tr className={headerRowClassName}>
              {selectable && (
                <th className="w-8 border-b border-black/8 pb-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    aria-label="Бүгдийг сонгох"
                    className="size-4 accent-[#df1f3d]"
                  />
                </th>
              )}
              {tableColumns.map(column => (
                <th key={column.id} className={column.headerClassName ?? "border-b border-black/8 pb-3"}>
                  {column.header}
                </th>
              ))}
              {rowActions && <th className={actionsHeaderClassName} />}
            </tr>
          </thead>
          <tbody>
            {paged.map(row => {
              const id = getRowId(row);
              return (
                <tr key={id} className={typeof rowClassName === "function" ? rowClassName(row) : rowClassName}>
                  {selectable && (
                    <td className="border-b border-black/6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(id)}
                        onChange={() => toggleRow(id)}
                        aria-label="Сонгох"
                        className="size-4 accent-[#df1f3d]"
                      />
                    </td>
                  )}
                  {tableColumns.map(column => (
                    <td key={column.id} className={column.cellClassName ?? "border-b border-black/6 py-4"}>
                      {column.render(row)}
                    </td>
                  ))}
                  {rowActions && <td className={actionsCellClassName}>{rowActions(row)}</td>}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-sm text-[#77787d]">
                  {resolvedEmptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(Boolean(serverPagination) || Boolean(pageSize)) && filtered.length > 0 && (
        serverPagination
          ? <PaginationFooter page={serverPagination.page} setPage={updater => serverPagination.onPageChange(updater(serverPagination.page))} totalPages={totalPages} pageSize={serverPagination.pageSize} total={serverPagination.total} itemLabel={itemLabel} />
          : <PaginationFooter page={page} setPage={setPage} totalPages={totalPages} pageSize={pageSize as number} total={filtered.length} itemLabel={itemLabel} />
      )}
    </>
  );
}

function PaginationFooter({
  page, setPage, totalPages, pageSize, total, itemLabel,
}: {
  page: number; setPage: (updater: (current: number) => number) => void; totalPages: number; pageSize: number; total: number; itemLabel: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#77787d]">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} {itemLabel}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPage(current => Math.max(1, current - 1))}
          disabled={page === 1}
          className="grid size-8 place-items-center rounded-full border border-black/10 text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Өмнөх хуудас"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="min-w-16 text-center font-bold text-[#17181b]">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage(current => Math.min(totalPages, current + 1))}
          disabled={page === totalPages}
          className="grid size-8 place-items-center rounded-full border border-black/10 text-[#57585e] transition hover:border-[#df1f3d] hover:text-[#df1f3d] disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Дараагийн хуудас"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
