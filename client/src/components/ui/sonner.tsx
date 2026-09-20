import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * 2026-09-20 (PHASE 6 цэвэрлэгээ): энд `next-themes`-ийн `useTheme()` дуудагддаг
 * байсан ч энэ апп-д `next-themes`-ийн ThemeProvider ХЭЗЭЭ Ч mount хийгддэггүй
 * (аппын өөрийн `contexts/ThemeContext.tsx` тусдаа). Provider-гүй үед
 * `useTheme()` нь `theme: undefined` буцаадаг тул `const { theme = "system" }`
 * нь ҮРГЭЛЖ "system" байв — өөрөөр хэлбэл 55 KB-ийн сан нэг тогтмол мөр
 * өгөхийн тулд суусан байжээ. Зан төлөв яг хэвээр: "system" нь хөтчийн
 * `prefers-color-scheme`-ийг дагана.
 *
 * ⚠️ Storefront-ийн гэрэл/харанхуй сонголт нь `html[data-storefront-theme]`
 * (`hooks/useStorefrontTheme.ts`) — toast-ыг түүнтэй уялдуулах нь ЗАН ТӨЛӨВИЙН
 * өөрчлөлт тул энэ цэвэрлэгээнд хийгээгүй (docs/AUDIT-2026-09-20-full-stack.md).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
