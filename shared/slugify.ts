// 2026-09-07: server-side slug generation didn't exist anywhere before this
// (every existing slugged entity -- products, posts, routines -- always
// receives an already-computed slug from the client, typed or auto-filled
// client-side; see the duplicated inline `slugify` in AdminWorkspace.tsx and
// AdminOperationsPanel.tsx). Post categories/tags are the first entity whose
// slug is generated server-side (an admin only types a name), so this is a
// genuinely new need, not a refactor of the existing client-side copies.
export function slugify(value: string): string {
  return value
    .toLocaleLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
