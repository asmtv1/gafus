import { Loading } from "../../shared/ui";
import { BackButtonLink, PrimaryButton, CaramelButton, SecondaryButton } from "../../shared/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { getMyPet, getMyPetWeightHistory } from "./petApi";
import { RouteLink } from "../../shared/router/location";
import { PetEditOptIn } from "./PetEditOptIn";
import { PetDocuments } from "./PetDocuments";
import { PetPrevention } from "./PetPrevention";
import { PetAvatarConnected } from "./PetAvatarConnected";
import { PetEditConnected } from "./PetEditConnected";
import { PetDeleteConnected } from "./PetDeleteConnected";
import {
  addMyPetWeightAndVerify, deleteMyPetWeightAndVerify, setMyPetWeightTargetAndVerify,
} from "./petActionsApi";
import type { PetEditWire } from "./petEditSourceMock";
import { ApiError } from "../../shared/api/client";
import {PetWeightChart} from "./PetWeightChart";
import cardStyles from "./PetExpandedNext.module.css";
import pageStyles from "./PetDetailPage.module.css";
import { PetTrashIcon } from "./PetCardActionIcons";

export function PetWeightHistorySection({
  userId, petId, currentOwner, inCard = false,
}: {
  userId: string;
  petId: string;
  currentOwner: () => boolean;
  inCard?: boolean;
}) {
  const queryClient = useQueryClient();
  // A /pets/X → /pets/Y switch can retain the same authenticated principal.
  // Fence the old X's held HTTP result on actual child unmount as well.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const stillCurrent = () => alive.current && currentOwner();
  const [open, setOpen] = useState(inCard);
  // Source Next PetWeight keeps weight/goal forms closed until the user
  // chooses their corresponding action. This applies to expanded /pets only.
  const [cardForm, setCardForm] = useState<"weight" | "goal" | null>(null);
  const [weightDraft, setWeightDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [measurementDate, setMeasurementDate] = useState(() =>
    new Date().toISOString().slice(0, 10));
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationMessage, setMutationMessage] = useState("");
  const [mutationConfirmed, setMutationConfirmed] = useState(false);
  // Exact one-shot destructive measurement IDs, scoped to this owner+pet
  // component. A lost DELETE ACK cannot be safely replayed.
  const attemptedDeletes = useRef(new Set<string>());
  const mutationFlight = useRef(false);
  const history = useQuery({
    queryKey: ["pets", "weight-history", userId, petId],
    queryFn: async () => {
      if (!stillCurrent()) throw new Error("SESSION_CHANGED");
      const result = await getMyPetWeightHistory(petId);
      if (!stillCurrent()) throw new Error("SESSION_CHANGED");
      return result;
    },
    enabled: open,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const mutateWeight = async (kind: "entry" | "target") => {
    if (!stillCurrent() || mutationFlight.current) return;
    const text = (kind === "entry" ? weightDraft : targetDraft).trim().replace(",", ".");
    const weight = text ? Number(text) : null;
    if ((kind === "entry" && weight === null) ||
      (weight !== null && (!Number.isFinite(weight) || weight < 0.1 || weight > 200))) {
      setMutationMessage("Укажите вес от 0,1 до 200 кг."); setMutationConfirmed(false); return;
    }
    // A measurement from today is allowed even before UTC noon. Noon in the
    // future incorrectly rejected an entirely valid current-date entry.
    const rawDate = new Date(measurementDate + "T00:00:00.000Z");
    if (kind === "entry" && (!/^\d{4}-\d{2}-\d{2}$/.test(measurementDate) ||
      !Number.isFinite(rawDate.getTime()) ||
      rawDate.toISOString().slice(0, 10) !== measurementDate ||
      rawDate.getTime() > Date.now())) {
      setMutationMessage("Укажите прошедшую дату измерения."); setMutationConfirmed(false); return;
    }
    mutationFlight.current = true;
    setMutationBusy(true); setMutationMessage(""); setMutationConfirmed(false);
    try {
      const confirmed = kind === "entry"
        ? await addMyPetWeightAndVerify(petId, weight!, rawDate.toISOString())
        : await setMyPetWeightTargetAndVerify(petId, weight);
      if (!stillCurrent()) return;
      const result = await history.refetch();
      if (!stillCurrent()) return;
      if (!confirmed || result.isError) {
        setMutationMessage("Сохранение не подтверждено. Проверьте историю перед повтором.");
      } else {
        setMutationMessage(kind === "entry" ? "Измерение сохранено." : "Цель обновлена.");
        setMutationConfirmed(true);
        if (kind === "entry") setWeightDraft("");
        if (inCard) setCardForm(null);
      }
    } catch (error) {
      if (!stillCurrent()) return;
      setMutationMessage(error instanceof ApiError && error.status === 401
        ? "Сессия завершена. Войдите снова."
        : "Не удалось подтвердить запись. Проверьте историю перед повтором.");
      void history.refetch();
    } finally {
      mutationFlight.current = false;
      if (stillCurrent()) setMutationBusy(false);
    }
  };
  const deleteEntry = async (entryId: string) => {
    if (!stillCurrent() || mutationFlight.current || attemptedDeletes.current.has(entryId)) return;
    const exists = history.data?.entries.some(entry => entry.id === entryId);
    if (!open || !history.isSuccess || history.isFetching || !exists) return;
    if (!window.confirm("Удалить это измерение?")) return;
    if (!stillCurrent() || mutationFlight.current || attemptedDeletes.current.has(entryId)) return;
    attemptedDeletes.current.add(entryId); // Mark BEFORE any network await.
    mutationFlight.current = true;
    setMutationBusy(true); setMutationConfirmed(false); setMutationMessage("");
    try {
      const confirmed = await deleteMyPetWeightAndVerify(petId, entryId, stillCurrent);
      if (!stillCurrent()) return;
      const refreshed = await history.refetch();
      if (!stillCurrent()) return;
      if (!confirmed || refreshed.isError ||
        refreshed.data?.entries.some(entry => entry.id === entryId)) {
        setMutationMessage("Результат удаления не подтверждён. Проверьте историю. Повтор заблокирован.");
      } else {
        // The current weight in pet details may change after deleting the
        // most recent measurement. Read the real owner pet again (not stale
        // optimistic data); never write it into another actor/pet cache.
        const petAfterDelete = await getMyPet(petId);
        if (!stillCurrent()) return;
        queryClient.setQueryData(["pets", "detail", userId, petId], petAfterDelete);
        await queryClient.invalidateQueries({
          queryKey: ["pets", "mine", userId], exact: true, refetchType: "none",
        });
        if (!stillCurrent()) return;
        setMutationMessage("Измерение удалено."); setMutationConfirmed(true);
      }
    } catch {
      if (!stillCurrent()) return;
      setMutationMessage("Результат удаления неизвестен. Проверьте историю. Повтор заблокирован.");
      void history.refetch(); // read-only reconciliation, never a second DELETE.
    } finally {
      mutationFlight.current = false;
      if (stillCurrent()) setMutationBusy(false);
    }
  };
  return (
    <section aria-label="История веса питомца">
      {!inCard && <button type="button" onClick={() => setOpen(value => !value)}>
        {open ? "Скрыть историю веса" : "История веса"}
      </button>}
      {open && (
        <>
          {history.isPending && <Loading message="Загружаем историю веса…" />}
          {history.isError && (
            <div role="alert">
              <p>{history.error instanceof ApiError && history.error.status === 401
                ? "Сессия завершена. Войдите снова."
                : history.error instanceof ApiError && history.error.status === 403
                  ? "Нет доступа к истории веса."
                  : history.error instanceof ApiError && history.error.status === 404
                    ? "Питомец не найден или недоступен."
                    : "Не удалось загрузить историю веса."}</p>
            </div>
          )}
          {history.isSuccess && !history.isFetching && (
            <>
              {inCard ? (
                (history.data.entries.at(-1)?.weightKg ?? history.data.currentWeightKg) !== null &&
                <strong className={cardStyles.weightCurrent}>
                  {history.data.entries.at(-1)?.weightKg ?? history.data.currentWeightKg} кг
                </strong>
              ) : <>
                <p>Текущий вес: {history.data.currentWeightKg === null
                  ? "Не указан" : history.data.currentWeightKg + " кг"}</p>
                <p>Цель: {history.data.targetWeightKg === null
                  ? "Не задана" : history.data.targetWeightKg + " кг"}</p>
              </>}
              <PetWeightChart data={history.data}/>
              {history.data.entries.length === 0 ? (
                <p>Измерений пока нет.</p>
              ) : (
                <ul className={inCard ? cardStyles.measurementHistory : undefined}>
                  {inCard && <li className={cardStyles.measurementHistoryTitle}>
                    <h5>Измерения</h5>
                  </li>}
                  {[...history.data.entries].reverse().map(entry => (
                    <li key={entry.id}>
                      <span>{new Date(entry.measuredAt).toLocaleDateString("ru-RU", {
                        timeZone: "UTC",
                      })}</span>
                      {inCard ? <strong>{entry.weightKg} кг</strong> : `: ${entry.weightKg} кг`}
                      <SecondaryButton variant="red" title="Удалить измерение"
                        className={inCard ? [cardStyles.measurementDelete, "gafus-inline-red-icon"].join(" ") : undefined}
                        aria-label={`Удалить измерение от ${new Date(entry.measuredAt)
                          .toLocaleDateString("ru-RU", { timeZone: "UTC" })}`}
                        disabled={mutationBusy || attemptedDeletes.current.has(entry.id)}
                        onClick={() => void deleteEntry(entry.id)}>
                        {inCard ? <PetTrashIcon/> : "Удалить измерение"}
                      </SecondaryButton>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {mutationMessage && <p role={mutationConfirmed ? "status" : "alert"}>
            {mutationMessage}
          </p>}
          {inCard && <div className={cardStyles.weightActionRow}>
            <PrimaryButton aria-expanded={cardForm === "weight"}
              disabled={mutationBusy}
              onClick={() => setCardForm(value => value === "weight" ? null : "weight")}
              className={cardStyles.weightRecordButton}>Записать вес</PrimaryButton>
            <CaramelButton aria-expanded={cardForm === "goal"}
              disabled={mutationBusy}
              onClick={() => setCardForm(value => value === "goal" ? null : "goal")}
              className={cardStyles.weightGoalButton}>Цель</CaramelButton>
          </div>}
          {(!inCard || cardForm === "weight") &&
          <form className={inCard ? cardStyles.weightForm : undefined}
            onSubmit={event => { event.preventDefault(); void mutateWeight("entry"); }}>
            <label>Добавить измерение, кг
              <input type="number" min="0.1" max="200" step="0.1" value={weightDraft}
                onChange={event => setWeightDraft(event.target.value)}
                disabled={mutationBusy} required/>
            </label>
            <label>Дата измерения
              <input type="date" value={measurementDate} disabled={mutationBusy}
                onChange={event => setMeasurementDate(event.target.value)} required/>
            </label>
            {inCard ? <PrimaryButton type="submit" disabled={mutationBusy}>Сохранить</PrimaryButton> : <PrimaryButton type="submit" disabled={mutationBusy}>Сохранить вес</PrimaryButton>}
          </form>}
          {(!inCard || cardForm === "goal") &&
          <form className={inCard ? cardStyles.weightForm : undefined}
            onSubmit={event => { event.preventDefault(); void mutateWeight("target"); }}>
            <label>Целевой вес, кг (пусто — сбросить цель)
              <input type="number" min="0.1" max="200" step="0.1" value={targetDraft}
                onChange={event => setTargetDraft(event.target.value)} disabled={mutationBusy}/>
            </label>
            {inCard ? <PrimaryButton type="submit" disabled={mutationBusy}>Сохранить цель</PrimaryButton> : <PrimaryButton type="submit" disabled={mutationBusy}>Сохранить цель</PrimaryButton>}
          </form>}
        </>
      )}
    </section>
  );
}

export function PetDetails({
  userId,
  petId,
  showEditOptIn = false,
  editMockTransport,
  galleryOptIn = false,
}: {
  userId: string;
  petId: string;
  showEditOptIn?: boolean;
  editMockTransport?: PetEditWire;
  galleryOptIn?: boolean;
}) {
  const auth = useQueryClient();
  const initial = useRef(auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY) ?? null);
  const epoch = useRef(0);
  const previous = useRef(initial.current?.id ?? null);
  const revision = useSyncExternalStore(
    (callback) =>
      auth.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          event.query.queryKey.every(
            (part: unknown, index: number) => part === CURRENT_USER_QUERY_KEY[index],
          )
        ) {
          const next = auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null;
          if (
            next !== previous.current &&
            (next !== null || event.type === "removed" || event.query.state.data === null)
          ) {
            previous.current = next;
            epoch.current++;
            callback();
          }
        }
      }),
    () => epoch.current,
    () => epoch.current,
  );
  const actor = auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY);
  // Private notes/measurements on ordinary pet routes must close when the
  // already-confirmed auth principal switches, including A->B->A.
  const ownerCheckRequired = showEditOptIn || galleryOptIn || initial.current !== null;
  const sessionOk =
    !ownerCheckRequired ||
    Boolean(initial.current?.id === userId && actor?.id === userId && revision === 0);
  const query = useQuery({
    queryKey: ["pets", "detail", userId, petId],
    queryFn: () => getMyPet(petId),
    enabled: sessionOk,
    retry: false,
    staleTime: 0,
    // Private notes and health measurements leave Query cache on unmount.
    gcTime: 0,
  });
  // Medical notes and measurements require a settled, current owner GET.
  const ready = query.isSuccess && !query.isFetching;
  const expired = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  if (!sessionOk)
    return (
      <section className="collection-section" role="alert">
        <p>Сессия изменилась. Вернитесь к списку питомцев.</p>
        <BackButtonLink to="/pets">Мои питомцы</BackButtonLink>
      </section>
    );
  return (
    <section className={`collection-section ${pageStyles.page}`} aria-label="Карточка питомца">
      <nav className={pageStyles.breadcrumbs} aria-label="Навигация по питомцам">
        <BackButtonLink to="/pets">Мои питомцы</BackButtonLink>
        {galleryOptIn && <RouteLink to="/profile/albums">Фотоальбомы</RouteLink>}
      </nav>
      {query.isPending && <Loading message="Загружаем данные питомца…" />}
      {query.isFetching && query.data && <Loading variant="compact" message="Перепроверяем карточку питомца…" />}
      {query.isError && (
        <div role="alert">
          <p>
            {expired
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к питомцу."
                : notFound
                  ? "Питомец не найден или недоступен."
                  : "Не удалось загрузить данные питомца."}
          </p>
          {expired ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && !notFound && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {ready && (
        <article className={`compact-card pet-detail-card ${pageStyles.hero}`}>
          <div className={pageStyles.heroHead}>
            <div className={pageStyles.photoFrame}>
              {sessionOk&&initial.current?.id===userId&&actor?.id===userId&&revision===0 ?
                <PetAvatarConnected key={`avatar:${userId}:${petId}`} petId={petId} ownerId={userId}
                  petType={query.data.type==="CAT"?"CAT":"DOG"}
                  petName={query.data.name} photoUrl={query.data.photoUrl}
                  isCurrent={() => epoch.current===0 &&
                    auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id===userId}/> :
                <span className={pageStyles.photoPlaceholder} aria-hidden="true">🐾</span>}
            </div>
            <div className={pageStyles.heroIdentity}>
              <span className={pageStyles.eyebrow}>Профиль питомца</span>
              <h2>{query.data.name}</h2>
              <p className={pageStyles.subtitle}>
                {query.data.type === "CAT" ? "Кошка" : "Собака"}
                {query.data.breed ? ` · ${query.data.breed}` : ""}
              </p>
              {sessionOk&&initial.current?.id===userId&&actor?.id===userId&&revision===0&&
                <RouteLink to={`/pets/${petId}/vet-visits`}>
                  <span className={pageStyles.vetLink}>Ветеринарные посещения <span aria-hidden="true">↗</span></span>
                </RouteLink>}
            </div>
          </div>
          <div className={pageStyles.factsHeader}>
            <h3>О питомце</h3>
            <span>Основная информация</span>
          </div>
          <dl className={`pet-details ${pageStyles.facts}`}>
            <div>
              <dt>Вид</dt>
              <dd>{query.data.type === "CAT" ? "Кошка" : "Собака"}</dd>
            </div>
            <div>
              <dt>Порода</dt>
              <dd>{query.data.breed || "Не указана"}</dd>
            </div>
            <div>
              <dt>Дата рождения</dt>
              <dd>
                {query.data.birthDate
                  ? new Date(query.data.birthDate).toLocaleDateString("ru-RU", { timeZone: "UTC" })
                  : "Не указана"}
              </dd>
            </div>
            <div>
              <dt>Вес</dt>
              <dd>{query.data.weightKg === null ? "Не указан" : query.data.weightKg + " кг"}</dd>
            </div>
            <div>
              <dt>Рост</dt>
              <dd>{query.data.heightCm === null ? "Не указан" : query.data.heightCm + " см"}</dd>
            </div>
            <div>
              <dt>Заметки</dt>
              <dd>{query.data.notes || "Нет"}</dd>
            </div>
          </dl>
        </article>
      )}
      {ready && sessionOk && initial.current?.id === userId &&
        actor?.id === userId && revision === 0 && (
        <div className={`${pageStyles.panel} ${pageStyles.weightPanel}`}>
          <div className={pageStyles.panelHeading}>
            <div className={pageStyles.panelIcon} aria-hidden="true">⚖</div>
            <div><h3>Вес и динамика</h3><p>История измерений и изменения веса.</p></div>
          </div>
          <PetWeightHistorySection
            key={`${userId}:${petId}`}
            userId={userId}
            petId={petId}
            currentOwner={() => epoch.current === 0 &&
              auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId}
          />
        </div>
      )}
      {ready && showEditOptIn && (
        <div className={pageStyles.actionPanel}><PetEditOptIn
          enabled={showEditOptIn}
          userId={userId}
          pet={query.data}
          transport={editMockTransport}
        /></div>
      )}
      {ready && !showEditOptIn && sessionOk && initial.current?.id === userId &&
        actor?.id === userId && revision === 0 && (
        <div className={`${pageStyles.panel} ${pageStyles.actionPanel}`}>
          <div className={pageStyles.panelHeading}>
            <div className={pageStyles.panelIcon} aria-hidden="true">✎</div>
            <div><h3>Управление питомцем</h3><p>Редактируйте данные или удалите карточку.</p></div>
          </div>
          <div className={pageStyles.actionRow}>
            <PetEditConnected ownerId={userId} pet={query.data}
              isCurrent={() => epoch.current === 0 &&
                auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId}/>
            <PetDeleteConnected ownerId={userId} petId={petId} petName={query.data.name}
              isCurrent={() => epoch.current === 0 &&
                auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId}/>
          </div>
        </div>
      )}
      {ready && sessionOk && initial.current?.id === userId &&
        actor?.id === userId && revision === 0 && (
        <div className={pageStyles.panel}>
          <div className={pageStyles.panelHeading}>
            <div className={pageStyles.panelIcon} aria-hidden="true">✚</div>
            <div><h3>Здоровье и профилактика</h3><p>Прививки и регулярные обработки.</p></div>
          </div>
          <PetPrevention key={`prevention:${userId}:${petId}`} ownerId={userId} petId={petId}
            isCurrent={() => epoch.current === 0 &&
              auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId} />
        </div>
      )}
      {ready && sessionOk && initial.current?.id === userId &&
        actor?.id === userId && revision === 0 && (
        <div className={pageStyles.panel}>
          <div className={pageStyles.panelHeading}>
            <div className={pageStyles.panelIcon} aria-hidden="true">▤</div>
            <div><h3>Документы питомца</h3><p>Храните нужные документы в одном месте.</p></div>
          </div>
          <PetDocuments ownerId={userId} petId={petId}
            isCurrent={() => epoch.current === 0 &&
              auth.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId} />
        </div>
      )}
    </section>
  );
}
