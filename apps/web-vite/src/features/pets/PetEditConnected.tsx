import { useState } from "react";
import { PetActionDialog } from "./PetActionDialog";
import { formatIsoBirthDateToDdMmYyyy } from "@gafus/core-client/validation/pet";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import type { PetDetails } from "./petApi";
import { toDraft, validatePetEdit, type PetEditDraft } from "./petEditSourceMock";
import { updateMyPetAndVerify, type PetPatch } from "./petActionsApi";
import {PrimaryButton, SecondaryButton} from "../../shared/ui";
import editStyles from "./PetActionDialog.module.css";

const numericalFields = [
  ["heightCm", "Рост, см"],
  ["neckGirthCm", "Обхват шеи, см"],
  ["muzzleGirthCm", "Обхват морды, см"],
  ["bellyGirthCm", "Обхват живота, см"],
] as const;

export function PetEditConnected({ pet, ownerId, isCurrent, buttonLabel, modal = false }: {
  pet: PetDetails; ownerId: string; isCurrent: () => boolean;
  buttonLabel?: string;
  modal?: boolean;
}) {
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<PetEditDraft>(() => toDraft(pet));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  // Next's SweetAlert creates a fresh draft on every open and discards any
  // uncommitted values when canceled, including Escape. Never replay them.
  const close = () => {
    if (busy) return;
    setExpanded(false);
    setDraft(toDraft(pet));
    setMessage(""); setSaved(false);
  };
  const toggle = () => {
    if (busy) return;
    if (expanded) { close(); return; }
    setDraft({ ...toDraft(pet), ...(modal ? {
      birthDate: formatIsoBirthDateToDdMmYyyy(pet.birthDate),
    } : {}) });
    setMessage(""); setSaved(false);
    setExpanded(true);
  };
  const change = <K extends keyof PetEditDraft>(field: K, value: PetEditDraft[K]) => {
    setDraft(before => ({ ...before, [field]: value })); setMessage(""); setSaved(false);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !isCurrent()) return;
    const check = validatePetEdit(pet, draft);
    if (!check.ok) { setMessage(check.message); return; }
    // The Hono PUT explicitly rejects weightKg. Weight has its own POST entry API.
    if ("weightKg" in check.patch) {
      setMessage("Вес меняется отдельно в разделе «История веса»."); return;
    }
    setBusy(true); setMessage(""); setSaved(false);
    try {
      await updateMyPetAndVerify(pet.id, ownerId, check.patch as PetPatch);
      if (!isCurrent()) return;
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["pets", "detail", ownerId, pet.id] }),
        cache.invalidateQueries({ queryKey: ["pets", "mine", ownerId] }),
      ]);
      if (!isCurrent()) return;
      setSaved(true); setMessage("Изменения сохранены и подтверждены повторным чтением.");
      setExpanded(false);
    } catch (error) {
      if (!isCurrent()) return;
      setMessage(error instanceof ApiError && error.status === 404
        ? "Питомец не найден." : error instanceof ApiError && error.status === 401
          ? "Сессия завершена. Войдите снова."
          : "Результат сохранения не подтверждён. Обновите карточку перед повтором.");
    } finally { if (isCurrent()) setBusy(false); }
  };
  const form = expanded ? (
    <form className={modal ? editStyles.editForm : undefined}
      onSubmit={event => void submit(event)}>
      <label>
        <span>{modal ? "Имя питомца" : "Кличка"} <span className={editStyles.required}>*</span></span>
        <input required maxLength={50} value={draft.name} disabled={busy}
          placeholder={modal ? "Введите имя питомца" : undefined}
          onChange={event => change("name", event.target.value)}/>
      </label>
      <label>
        <span>{modal ? "Тип питомца" : "Вид"} <span className={editStyles.required}>*</span></span>
        <select value={draft.type} required disabled={busy}
          onChange={event => change("type", event.target.value as PetEditDraft["type"])}>
          <option value="DOG">Собака</option><option value="CAT">Кошка</option>
        </select>
      </label>
      <label>
        Порода
        <input maxLength={50} value={draft.breed} disabled={busy}
          placeholder={modal ? "Введите породу" : undefined}
          onChange={event => change("breed", event.target.value)}/>
      </label>
      <label>
        <span>Дата рождения <span className={editStyles.required}>*</span></span>
        <input type={modal ? "text" : "date"} required
          inputMode={modal ? "numeric" : undefined}
          placeholder={modal ? "ДД.ММ.ГГГГ" : undefined}
          autoComplete="bday" value={draft.birthDate} disabled={busy}
          onChange={event => change("birthDate", event.target.value)}/>
        {modal && <small>Формат: ДД.ММ.ГГГГ (можно ГГГГ-ММ-ДД)</small>}
      </label>
      {numericalFields.map(([key, label]) => <label key={key}>
        {modal ? label.replace(", см", " (см)") : label}
        <input type="number" min={1} max={200} step="0.1" value={draft[key]}
          placeholder={modal ? "Укажите значение" : undefined}
          disabled={busy} onChange={event => change(key, event.target.value)}/>
      </label>)}
      <label>
        Заметки
        <textarea rows={3} maxLength={500} disabled={busy} value={draft.notes}
          placeholder={modal ? "Дополнительная информация о питомце" : undefined}
          onChange={event => change("notes", event.target.value)}/>
      </label>
      <label className={modal ? editStyles.editVisibility : undefined}>
        <input type="checkbox" checked={draft.showInProfile} disabled={busy}
          onChange={event => change("showInProfile", event.target.checked)}/>
        Показывать в профиле
      </label>
      <div className={modal ? editStyles.editActions : editStyles.inlineActions}>
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Сохраняем…" : "Сохранить изменения"}
        </PrimaryButton>
        <SecondaryButton variant="red" type="button" disabled={busy}
          onClick={close}>Отмена</SecondaryButton>
      </div>
    </form>
  ) : null;
  return <section aria-label="Редактирование питомца" className="pet-editor-connected">
    {modal ? (expanded ?
      <SecondaryButton variant="red" disabled={busy} onClick={toggle}>Закрыть редактирование</SecondaryButton> :
      <PrimaryButton disabled={busy} onClick={toggle}>{buttonLabel ?? "Редактировать питомца"}</PrimaryButton>
    ) : <SecondaryButton variant={expanded ? "red" : "default"} disabled={busy} onClick={toggle}>
      {expanded ? "Закрыть редактирование" : (buttonLabel ?? "Редактировать питомца")}
    </SecondaryButton>}
    {message && <p role={saved ? "status" : "alert"}>{message}</p>}
    {expanded && (modal ? <PetActionDialog title="Редактировать питомца"
      variant="edit" busy={busy} onClose={close}>{form}</PetActionDialog> : form)}
  </section>;
}
