// 2026-09-07 (WordPress-parity admin editor rebuild): self-hosted TinyMCE --
// literally the engine WordPress's own classic editor runs, per Tom's
// explicit choice over a look-alike (TipTap). Self-hosted via bundler
// imports (not Tiny Cloud, no API key/account needed) -- `licenseKey="gpl"`
// is TinyMCE's own documented declaration for free/open-source self-hosted
// use, confirmed against TinyMCE 8's official React bundling guide.
import { Editor } from "@tinymce/tinymce-react";

import "tinymce/tinymce";
import "tinymce/themes/silver";
import "tinymce/icons/default";
import "tinymce/models/dom";
import "tinymce/plugins/lists";
import "tinymce/plugins/link";
import "tinymce/plugins/wordcount";
// Both skins are imported as inline strings and injected per theme via
// `content_style` + a <style> tag below -- TinyMCE's `skin: false` mode means
// WE own the chrome CSS, so a plain side-effect import of one skin would pin
// the editor to light forever (it did: the toolbar stayed white on a dark
// admin, found by the dark-mode audit).
import skinCss from "tinymce/skins/ui/oxide/skin.min.css?inline";
import skinDarkCss from "tinymce/skins/ui/oxide-dark/skin.min.css?inline";
// `?inline` (Vite-specific): returns the CSS as a string instead of
// injecting it into the parent document -- these two stylesheets style the
// *editable content area*, not the toolbar chrome around it, so they're
// handed to TinyMCE via `content_style` instead of a normal side-effect
// import (which would leak WYSIWYG typography onto the admin page itself).
import contentUiCss from "tinymce/skins/ui/oxide/content.css?inline";
import contentUiDarkCss from "tinymce/skins/ui/oxide-dark/content.css?inline";
import contentCss from "tinymce/skins/content/default/content.css?inline";
import contentDarkCss from "tinymce/skins/content/dark/content.css?inline";
import { useAdminTheme } from "@/lib/adminTheme";

/**
 * Deliberately uncontrolled (`initialValue`, not `value`): TinyMCE React's
 * controlled mode re-diffs editor content on every parent re-render, which
 * risks the cursor jumping mid-sentence while actively typing. The one place
 * content needs to be pushed in from OUTSIDE -- switching from the Text tab
 * back to Visual, in AdminPostsPanel.tsx -- is handled there by changing
 * this component's `key` to force a clean remount with the freshly-edited
 * HTML as the new `initialValue`, which is a deliberate, infrequent action,
 * not a per-keystroke one.
 */
export default function TinyMceEditor({ initialValue, onChange, onRequestMedia }: {
  initialValue: string;
  onChange: (html: string) => void;
  onRequestMedia: () => Promise<string | null>;
}) {
  const theme = useAdminTheme();
  const isDark = theme === "dark";
  return (
    <>
      {/* The skin stylesheet for the *current* theme only. Keyed so switching
          themes swaps it wholesale rather than layering one over the other. */}
      <style key={theme}>{isDark ? skinDarkCss : skinCss}</style>
    <Editor
      licenseKey="gpl"
      tinymceScriptSrc={[]}
      initialValue={initialValue}
      onEditorChange={onChange}
      init={{
        height: 420,
        menubar: false,
        statusbar: true,
        // Matches the reference screenshot's status bar exactly (word count
        // + element path only) -- `branding: false` is a normal, documented
        // TinyMCE option and unrelated to the GPL self-hosting declaration
        // above; it just removes the "Build with TinyMCE" attribution link.
        branding: false,
        skin: false,
        content_css: false,
        content_style: `${isDark ? contentUiDarkCss : contentUiCss}\n${isDark ? contentDarkCss : contentCss}\nbody{font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;padding:12px;}`,
        plugins: "lists link wordcount",
        // Two fixed rows, mirroring WordPress's classic-editor toolbar +
        // "kitchen sink" row -- rendered always-visible rather than behind a
        // show/hide toggle button, a small deliberate simplification (every
        // button WP's toggle reveals is still here, just not collapsed by
        // default).
        toolbar: [
          "bold italic strikethrough | bullist numlist | blockquote | alignleft aligncenter alignright | link unlink | addmedia",
          "underline forecolor | alignjustify | outdent indent | removeformat",
        ],
        // Every image insert goes through our own Media Library modal + R2
        // upload pipeline (the "addmedia" button below), never TinyMCE's
        // own paste/drop base64 embedding -- an inline base64 data URI in
        // stored HTML would bloat every post row and skip the sharp/WebP
        // optimization every other image on this site gets.
        paste_data_images: false,
        // 2026-09-07 (real bug, found live via Playwright + a DB check, not
        // guessed): TinyMCE's default `convert_urls: true` "helpfully"
        // rewrites every inserted <img src>/<a href> to be relative to its
        // own computed document base, which silently stripped the leading
        // "/" off our app-relative "/cdn/..." R2-proxy URLs (see
        // server/storage.ts) -- "/cdn/media/1/x.webp" became "cdn/media/1/
        // x.webp", a broken image the moment it's rendered anywhere whose
        // page path isn't the site root. Every URL this editor ever inserts
        // comes from our own upload pipeline and is already exactly correct,
        // so URL rewriting is never wanted here.
        convert_urls: false,
        setup: editor => {
          editor.ui.registry.addButton("addmedia", {
            icon: "image",
            tooltip: "Медиа нэмэх",
            onAction: async () => {
              const url = await onRequestMedia();
              if (url) editor.insertContent(`<img src="${url}" alt="" />`);
            },
          });
        },
      }}
    />
    </>
  );
}
