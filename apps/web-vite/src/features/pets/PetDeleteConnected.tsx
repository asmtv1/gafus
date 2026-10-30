import { useRef, useState } from "react";
import {SecondaryButton} from "../../shared/ui";
import { useQueryClient } from "@tanstack/react-query";
import { deleteMyPetAndVerify } from "./petActionsApi";
import { navigate } from "../../shared/router/location";
import { PetActionDialog } from "./PetActionDialog";

/** Original Next confirmation dialog, with stricter one-shot owner/ACK fences.
 * A lost DELETE response may already mean the pet is gone. Never auto retry.
 */
export function PetDeleteConnected({ petId, petName, ownerId, isCurrent, modal = false }: {
  petId: string; petName: string; ownerId: string; isCurrent: () => boolean;
  modal?: boolean;
}) {
  const cache = useQueryClient();
  const flight = useRef(false);
  const attempted = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancel = () => {
    if (flight.current || busy) return;
    setConfirming(false);
    if (!attempted.current) setError("");
  };
  const confirm = () => {
    if (flight.current || attempted.current || !isCurrent()) return;
    attempted.current = true;
    flight.current = true;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        // Hono DELETE200 alone is not proof of deletion: the exact owner GET
        // must return 404 before the UI considers this a successful action.
        await deleteMyPetAndVerify(petId);
        if (!isCurrent()) return;
        await cache.invalidateQueries({ queryKey: ["pets", "mine", ownerId] });
        if (isCurrent()) navigate("/pets");
      } catch {
        if (isCurrent()) setError(
          "Удаление не подтверждено. Проверьте список питомцев перед повтором. " +
          "Повторная отправка заблокирована до обновления страницы.");
      } finally {
        flight.current = false;
        if (isCurrent()) setBusy(false);
      }
    })();
  };
  const controls = confirming ? <form onSubmit={event => {
    event.preventDefault();
    confirm();
  }}>
    <p>Вы уверены, что хотите удалить питомца «{petName}»? Это действие нельзя отменить.</p>
    {error && <p role="alert">{error}</p>}
    <SecondaryButton type="submit" variant="red" data-destructive="true"
      disabled={busy || attempted.current || !isCurrent()}>
      {busy ? "Удаляем…" : "Да, удалить"}
    </SecondaryButton>
    <SecondaryButton variant="red" type="button"
      disabled={busy} onClick={cancel}>Отмена</SecondaryButton>
  </form> : null;
  return <section aria-label="Удаление питомца" className="pet-delete-connected">
    {!confirming && <SecondaryButton variant="red"
      onClick={() => { if (flight.current || !isCurrent()) return;
        setConfirming(true); if (!attempted.current) setError(""); }}>
      Удалить питомца</SecondaryButton>}
    {confirming && (modal ? <PetActionDialog title="Удалить питомца?"
      busy={busy} onClose={cancel}>{controls}</PetActionDialog> : controls)}
  </section>;
}
