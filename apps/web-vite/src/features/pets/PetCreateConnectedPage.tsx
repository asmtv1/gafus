import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { PetCreateS1Form } from "./PetCreateS1Form";
import { submitPetCreateS1ViaCookieApi, refreshPetCreateS1SameOwner } from "./petCreateS1HttpSubmit";
import { getMyPet } from "./petApi";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { navigate } from "../../shared/router/location";

/** Actual Hono cookie POST with existing idempotent JSON clientRequestId.
 * A 201 alone is not the user's final confirmation: read back the own new pet.
 */
export function PetCreateConnectedPage({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const initialPrincipal = useRef(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY));
  const retired = useRef(false);
  const original = initialPrincipal.current;
  const matchesOriginal = useCallback(() => {
    const current = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
    const revision = (value: AuthUser | null | undefined) =>
      (value as AuthUser & { sessionRevision?: unknown } | undefined)?.sessionRevision;
    return !!current?.id && !!original?.id && current.id === userId &&
      current.id === original.id && current.username === original.username &&
      current.role === original.role && revision(current) === revision(original);
  }, [cache, original, userId]);
  useEffect(() => {
    const off = cache.getQueryCache().subscribe(event => {
      if (event.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          event.query.queryKey.every((key: unknown, index: number) =>
            key === CURRENT_USER_QUERY_KEY[index]) &&
          (event.type === "removed" || !matchesOriginal())) retired.current = true;
    });
    return off;
  }, [cache, matchesOriginal]);
  // A genuine actor/session change is irreversible for this form (A→B→A is
  // still revoked). Normal same-owner /me query events never revoke the POST.
  const sameOwner = () => !retired.current && matchesOriginal();
  return <PetCreateS1Form key={userId} actorId={userId} connected
      submitSynthetic={async (proposal) => {
        if (!sameOwner()) throw new Error("PET_CREATE_PRINCIPAL_CHANGED");
        const reply = await submitPetCreateS1ViaCookieApi(proposal);
        if (!sameOwner()) throw new Error("PET_CREATE_PRINCIPAL_CHANGED");
        const envelope = reply.body && typeof reply.body === "object"
          ? reply.body as { success?: unknown; data?: unknown } : null;
        if (reply.status !== 201 || envelope?.success !== true) return reply;
        const raw = envelope.data;
        if (!raw || typeof raw !== "object" ||
          typeof (raw as { id?: unknown }).id !== "string")
          throw new Error("UNCONFIRMED_PET_CREATION");
        const dto = raw as { id: string; ownerId?: string; name?: string; type?: string };
        if (dto.ownerId !== userId) throw new Error("UNCONFIRMED_PET_OWNER");
        const persisted = await getMyPet(dto.id);
        if (!sameOwner()) throw new Error("PET_CREATE_PRINCIPAL_CHANGED");
        const measures = ["heightCm", "neckGirthCm", "muzzleGirthCm", "bellyGirthCm"] as const;
        if (persisted.id !== dto.id || persisted.name !== proposal.name ||
          persisted.type !== proposal.type || persisted.breed !== proposal.breed ||
          persisted.birthDate?.slice(0, 10) !== proposal.birthDate ||
          (proposal.notes !== undefined && persisted.notes !== proposal.notes) ||
          measures.some(field => proposal[field] !== undefined &&
            persisted[field] !== proposal[field]))
          throw new Error("UNCONFIRMED_PET_READBACK");
        await cache.invalidateQueries({ queryKey: ["pets", "mine", userId] });
        if (!sameOwner()) throw new Error("PET_CREATE_PRINCIPAL_CHANGED");
        return reply;
      }}
      refreshForManualRetry={refreshPetCreateS1SameOwner}
      onCancelIntent={() => navigate("/pets")}/>;
}
