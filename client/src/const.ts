export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Navigates to the site's own email+password login page. Kept as a plain
// function (not a hook) so it can be called from non-component contexts
// (e.g. the tRPC error handler in main.tsx), matching how it was used before.
export const startLogin = () => {
  const redirect = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
};
