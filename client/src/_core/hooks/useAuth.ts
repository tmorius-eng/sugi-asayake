import { trpc } from "@/lib/trpc";

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
    try {
      await logoutMutation.mutateAsync();
    } finally {
      await utils.auth.me.invalidate();
      window.location.assign("/");
    }
  };

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    isAuthenticated: Boolean(meQuery.data),
    logout,
  };
}
