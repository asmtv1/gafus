import { Loading } from "../../shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { getMyPet } from "./petApi";
import { petVetVisitsPath, RouteLink, useRouteSearch } from "../../shared/router/location";
import { VetVisitsReadOptIn } from "./VetVisitsReadOptIn";
import { PetVetVisitsConnected } from "./PetVetVisitsConnected";
import type { VetVisitsSourceWire } from "./vetVisitsSourceMock";
import type { VetHonoSourceReadWire } from "./vetVisitsHonoReadConsumer";
import legacy from "../../brand/LegacyVetVisits.module.css";
import vetStyle from "./PetVetVisitsConnected.module.css";
import {PrimaryButton} from "../../shared/ui";

/**
 * No vet visit API consumer exists in the gated Vite Web contract.
 * First verify that the authenticated principal can read this pet via Core.
 * Until AG1 freezes visit DTO/auth semantics, DO NOT request or infer visits.
 */
export function PetVetVisits({
  userId,
  petId,
  showVetVisitsOptIn = false,
  vetVisitsSyntheticTransport,
  showVetHonoOptIn = false,
  vetHonoReadTransport,
}: {
  userId: string;
  petId: string;
  showVetVisitsOptIn?: boolean;
  vetVisitsSyntheticTransport?: VetVisitsSourceWire;
  showVetHonoOptIn?: boolean;
  vetHonoReadTransport?: VetHonoSourceReadWire;
}) {
  const cache = useQueryClient();
  // This route must NOT adopt a new principal simply because the App changes
  // its userId prop. The old pet's health record is never part of B's UI.
  const initial = useRef(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY) ?? null);
  const [revoked, setRevoked] = useState(false);
  const sameSession = useCallback(() => {
    const current = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
    const revision = (person: AuthUser | null | undefined) =>
      (person as (AuthUser & { sessionRevision?: unknown }) | null)?.sessionRevision ?? null;
    return !!initial.current?.id && initial.current.id === userId &&
      !!current?.id && current.id === userId &&
      current.username === initial.current.username &&
      current.role === initial.current.role &&
      revision(current) === revision(initial.current);
  }, [cache, userId]);
  useEffect(() => {
    const off = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length !== CURRENT_USER_QUERY_KEY.length ||
          !event.query.queryKey.every((part: unknown, index: number) =>
            part === CURRENT_USER_QUERY_KEY[index])) return;
      if (event.type === "removed" || !sameSession()) setRevoked(true);
    });
    return off;
  }, [cache, sameSession]);
  const verifiedOwner = !revoked && sameSession();
  const search = useRouteSearch();
  const values = new URLSearchParams(search).getAll("visitId");
  const selectedId =
    values.length === 1 && /^[A-Za-z0-9_-]{1,128}$/.test(values[0]) ? values[0] : null;
  const badDeepLink = values.length > 1 || (values.length === 1 && !selectedId);
  const select = (id: string | null) => {
    if (id && !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return;
    const url = petVetVisitsPath(petId) + (id ? "?visitId=" + id : "");
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const pet = useQuery({
    queryKey: ["pets", "vetVisitsOwner", userId, petId],
    queryFn: async () => {
      if (!sameSession()) throw new Error("PET_VET_SESSION_CHANGED");
      const result = await getMyPet(petId);
      if (!sameSession()) throw new Error("PET_VET_SESSION_CHANGED");
      return result;
    },
    enabled: verifiedOwner,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  return (
    <main className={`${legacy.page} gafus-vet-next-page`} aria-label="Посещения врача">
      <RouteLink className={`${legacy.back} ${vetStyle.backLink}`} to="/pets">К питомцам</RouteLink>
      {!verifiedOwner && <p role="alert">Сессия изменилась. Вернитесь к списку питомцев.</p>}
      {verifiedOwner && pet.isPending && <Loading message="Проверяем доступ к питомцу…" />}
      {verifiedOwner && pet.isError && (
        <div role="alert">
          <p>Не удалось подтвердить доступ к питомцу.</p>
          <PrimaryButton type="button" onClick={() => void pet.refetch()}>
            Повторить
          </PrimaryButton>
        </div>
      )}
      {verifiedOwner && pet.isSuccess && !pet.isFetching && (
        <>
          {(showVetHonoOptIn || showVetVisitsOptIn) &&
            <header className={legacy.header}>
              <div><h1>Посещения врача</h1><p>{pet.data.name}</p></div>
            </header>}
          {!showVetHonoOptIn && !showVetVisitsOptIn && (
            <PetVetVisitsConnected
              key={userId + ":" + petId}
              ownerId={userId}
              petId={petId}
              petName={pet.data.name}
              selectedId={selectedId}
              badDeepLink={badDeepLink}
              onSelect={select}
            />
          )}
          {(showVetHonoOptIn || showVetVisitsOptIn) && (
            <VetVisitsReadOptIn
              enabled
              ownerId={userId}
              petId={petId}
              transport={vetVisitsSyntheticTransport}
              honoTransport={showVetHonoOptIn ? vetHonoReadTransport : undefined}
              selectedVisitId={selectedId}
              badDeepLink={badDeepLink}
              onSelectVisit={select}
            />
          )}
        </>
      )}
    </main>
  );
}
