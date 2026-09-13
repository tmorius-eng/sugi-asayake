import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { isChunkLoadError } from "@shared/chunk-error";
import { reloadOnceForStaleChunk } from "@/lib/lazyRetry";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** True while a stale-chunk reload is in flight: render a quiet "updating"
   *  frame, never the error screen, for the moment before the page reloads. */
  reloading: boolean;
}

/**
 * Last line of defence for a render-time crash.
 *
 * Rewritten 2026-09-13 after the shop's counter laptop showed a raw English
 * stack trace ("Failed to fetch dynamically imported module
 * .../ProductDetail-BJW-G6rc.js") when the barcode gun opened a product page
 * on a tab that predated that day's deploys. Two changes:
 *
 *  - A missing-chunk error (see shared/chunk-error.ts) is not shown at all:
 *    the tab reloads itself once and comes back on the new build. This is
 *    the belt to lazyRetry()'s braces -- lazyRetry catches the import
 *    promise, this catches the same failure if it surfaces through render.
 *  - Everything else gets a Mongolian explanation and a reload button; the
 *    stack is kept for whoever is debugging, folded away, not headlined.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, reloading: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, reloading: false };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) && reloadOnceForStaleChunk()) {
      this.setState({ reloading: true });
    }
  }

  render() {
    if (this.state.reloading) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <p className="text-sm text-muted-foreground">Сайт шинэчлэгдсэн тул дахин ачаалж байна…</p>
        </div>
      );
    }

    if (this.state.hasError) {
      const stale = isChunkLoadError(this.state.error);
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8 text-center">
            <AlertTriangle size={48} className="text-destructive mb-6 flex-shrink-0" aria-hidden="true" />

            <h2 className="text-xl mb-2">
              {stale ? "Сайт шинэчлэгдсэн байна" : "Гэнэтийн алдаа гарлаа"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {stale
                ? "Энэ хуудас нээлттэй байх хооронд сайтын шинэ хувилбар гарсан тул дахин ачаалах шаардлагатай."
                : "Уучлаарай. Хуудсыг дахин ачаалбал ихэнхдээ засагдана. Давтагдвал админд мэдэгдээрэй."}
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer",
              )}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Дахин ачаалах
            </button>

            {!stale && this.state.error?.stack && (
              <details className="mt-8 w-full text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer">Техникийн мэдээлэл</summary>
                <div className="mt-2 p-4 w-full rounded bg-muted overflow-auto">
                  <pre className="text-xs text-muted-foreground whitespace-break-spaces">{this.state.error.stack}</pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
