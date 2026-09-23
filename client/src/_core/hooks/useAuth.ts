import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Replaces the old Manus-OAuth-backed useAuth hook. Same shape/contract as
 * before (`user`, `loading`, `isAuthenticated`, `logout`) so every component
 * that already consumes this hook keeps working unchanged — only the
 * underlying mechanism (email+password session cookie instead of OAuth) is
 * different.
 */
export function useAuth() {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = async () => {
    // 2026-09-23: АМЖИЛТТАЙ үед л шилжинэ. Өмнө нь `finally` байсан тул
    // офлайн/429 үед сервер сешнийг хүчингүй болгоогүй атлаа нүүр хуудас
    // дахин ачаалагдаж, хүн "гарсан" мэт харагдаад дараа нь `auth.me`
    // амжилттай болоход дансанд нь эргэн ороод байдаг байв — хуваалцсан
    // төхөөрөмж дээр аюултай.
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Гарч чадсангүй. Дахин оролдоно уу.");
      return;
    }
    await utils.auth.me.invalidate();
    window.location.assign("/");
  };

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    isAuthenticated: Boolean(meQuery.data),
    logout,
  };
}
