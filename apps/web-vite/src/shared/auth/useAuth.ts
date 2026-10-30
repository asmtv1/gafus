import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, login, logout, type AuthUser } from "./authApi";

export const CURRENT_USER_QUERY_KEY = ["auth", "me"] as const;

/** Ephemeral proof of an explicit successful login mutation in this
 * QueryClient. Contains only public principal identity and an in-memory
 * incrementing epoch; no tokens, credentials, timestamps or persistence.
 * cache.clear() in useLogin/useLogout removes all older private payloads. */
export const EXPLICIT_LOGIN_QUERY_KEY=["auth","explicit-login"] as const;
export type ExplicitLoginReceipt=Pick<AuthUser,"id"|"username"|"role">&{
  epoch:number;
};
let explicitLoginEpoch=0;

/** A server-acknowledged credential login or VK consent completion is the only
 * event allowed to reset the App-lifetime principal fence. */
export function recordExplicitLogin(cache: ReturnType<typeof useQueryClient>, user: AuthUser) {
  cache.clear();
  cache.setQueryData<AuthUser>(CURRENT_USER_QUERY_KEY, user);
  cache.setQueryData<ExplicitLoginReceipt>(EXPLICIT_LOGIN_QUERY_KEY, {
    id: user.id, username: user.username, role: user.role, epoch: ++explicitLoginEpoch,
  });
}

export function useCurrentUser(enabled = true) {
  const cache=useQueryClient();
  const query=useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getCurrentUser,
    enabled,
    // Prevent an immediate /me refetch after successful login mutation.
    // Cookie-based identity is rechecked on revisit/refocus after this window.
    staleTime: 15_000,
    retry: false,
    // A failed /me->refresh must stay UNKNOWN until an explicit recheck.
    // Mounting the login panel must never auto-refetch and resurrect an old
    // principal after an ambiguous refresh 5xx.
    retryOnMount: false,
    refetchOnMount: false,
  });
  // An authoritative expired/unauthenticated /me must not leave private
  // profile, pet, booking or training payloads in the shared Query cache.
  // A transient 5xx/error is NOT proof of logout and preserves retryability.
  useEffect(()=>{
    if(!query.isSuccess||query.data!==null)return;
    void cache.cancelQueries({predicate:q=>q.queryKey[0]!=="auth"}).then(()=>
      cache.removeQueries({predicate:q=>q.queryKey[0]!=="auth"}));
  },[cache,query.data,query.isSuccess]);
  return query;
}

export function useLogin() {
  const cache = useQueryClient();
  return useMutation({
    mutationKey:["auth","login"],
    mutationFn: login,
    onSuccess: ({ user }) => {
      // The previous session may have expired without a logout. Never retain
      // another principal's private queries after a new login succeeds.
      recordExplicitLogin(cache, user);
    },
  });
}

export function useLogout() {
  const cache = useQueryClient();
  return useMutation({
    mutationKey:["auth","logout"],
    mutationFn: logout,
    onSuccess: () => {
      // Do not retain private user data in TanStack Query memory after logout.
      cache.clear();
    },
  });
}
