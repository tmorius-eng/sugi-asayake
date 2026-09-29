import { useEffect } from "react";

// 2026-09-07: this codebase had zero per-page dynamic <title>/meta-description
// precedent before the WordPress-parity post editor added metaTitle/
// metaDescription fields (grepped for `document.title`/react-helmet-style
// usage first -- none exists; `client/index.html`'s <title> is static). Only
// used by PostDetail.tsx today; restores index.html's static defaults on
// unmount so navigating away from a post doesn't leave a stale <title> on
// the next page.
const defaultTitle = document.title;
const defaultDescriptionEl = document.querySelector('meta[name="description"]');
const defaultDescription = defaultDescriptionEl?.getAttribute("content") ?? "";

// 2026-09-27: without this, a page that never calls useDocumentMeta kept
// whatever <title> the PREVIOUS page had set (e.g. leaving /post/some-title
// for /login left the tab reading the post's title) -- rendered as a sibling
// BEFORE <Switch> in App.tsx's Router so its reset effect (child-before-
// parent, sibling-order) fires before the matched route's own useDocumentMeta
// effect on the same navigation, not after it.
export function DocumentTitleRouteReset({ location }: { location: string }) {
  useEffect(() => {
    document.title = defaultTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", defaultDescription);
  }, [location]);
  return null;
}

export function useDocumentMeta(title: string | null | undefined, description: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", description);
    }
    return () => {
      document.title = defaultTitle;
      document.querySelector('meta[name="description"]')?.setAttribute("content", defaultDescription);
    };
  }, [title, description]);
}
