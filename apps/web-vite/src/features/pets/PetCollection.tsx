import { Loading } from "../../shared/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useSyncExternalStore } from "react";
import { CURRENT_USER_QUERY_KEY } from "../../shared/auth/useAuth";
import type { AuthUser } from "../../shared/auth/authApi";
import { listMyPets } from "./petApi";
import { petPath, petVetVisitsPath, RouteLink } from "../../shared/router/location";
import { ApiError } from "../../shared/api/client";
import { PetAvatarConnected } from "./PetAvatarConnected";
import { PetPrevention } from "./PetPrevention";
import { PetDocuments } from "./PetDocuments";
import { PetWeightHistorySection } from "./PetDetails";
import { PetProfileVisibilityConnected } from "./PetProfileVisibilityConnected";
import { PetInlinePrivateFacts } from "./PetInlinePrivateFacts";
import { getAgeWithMonths } from "@gafus/core-client/utils/age/getAgeWithMonths";
import { declOfNum } from "@gafus/core-client/utils/pluralize";
import styles from "../../brand/LegacyPetList.module.css";
import pageStyles from "../../brand/LegacyPetsPage.module.css";
import expandedStyles from "./PetExpandedNext.module.css";
import {PrimaryButton,PrimaryButtonLink} from "../../shared/ui";

export function PetCollection({
  userId,
  galleryOptIn = false,
  addPetOptIn = false,
}: {
  userId: string;
  galleryOptIn?: boolean;
  addPetOptIn?: boolean;
}) {
  const cache = useQueryClient();
  // Source Next PetCard keeps one expansion flag PER CARD, not one global ID.
  const [expandedPetIds,setExpandedPetIds]=useState<ReadonlySet<string>>(()=>new Set());
  const expand=(id:string)=>setExpandedPetIds(current=>new Set([...current,id]));
  const toggle=(id:string)=>setExpandedPetIds(current=>{
    const next=new Set(current);
    if(next.has(id))next.delete(id);else next.add(id);
    return next;
  });
  const initial = useRef(cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null);
  const epoch = useRef(0);
  const previous = useRef(initial.current);
  const revision = useSyncExternalStore(
    (cb) =>
      cache.getQueryCache().subscribe((event) => {
        if (
          event.query.queryKey.length === CURRENT_USER_QUERY_KEY.length &&
          event.query.queryKey.every((v: unknown, i: number) => v === CURRENT_USER_QUERY_KEY[i])
        ) {
          const next = cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id ?? null;
          if (
            next !== previous.current &&
            (next !== null || event.type === "removed" || event.query.state.data === null)
          ) {
            previous.current = next;
            epoch.current++;
            cb();
          }
        }
      }),
    () => epoch.current,
    () => epoch.current,
  );
  // Fail closed even on first render. An absent verified /auth/me is not
  // permission to fetch or expose previously cached private owner cards.
  const sessionOk = initial.current === userId &&
    revision === 0 &&
    cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id === userId;
  const query = useQuery({
    queryKey: ["pets", "mine", userId],
    queryFn: listMyPets,
    enabled: sessionOk,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });

  // Cached owner cards are not a current response while access is rechecked.
  const ready = query.isSuccess && !query.isFetching;
  const expired = query.error instanceof ApiError && query.error.status === 401;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  if (!sessionOk)
    return (
      <section className="collection-section" role="alert">
        <p>Сессия изменилась. Откройте список питомцев заново.</p>
        <RouteLink to="/profile">Мой профиль</RouteLink>
      </section>
    );
  return (
    <section className={`${pageStyles.page} gafus-legacy-pets-page`} aria-label="Мои питомцы">
      <div className={pageStyles.wrapper}>
      <h1 className={pageStyles.title}>Питомцы</h1>

      {galleryOptIn && (
        <p>
          <RouteLink to="/profile/albums">Фотоальбомы</RouteLink>
        </p>
      )}
      {query.isPending && <Loading message="Загружаем питомцев…" />}
      {query.isFetching && query.data && <Loading variant="compact" message="Перепроверяем список питомцев…" />}
      {query.isError && (
        <div role="alert">
          <p>
            {expired
              ? "Сессия завершена. Войдите снова."
              : forbidden
                ? "Нет доступа к питомцам."
                : "Не удалось загрузить питомцев."}
          </p>
          {expired ? (
            <RouteLink to="/login">Войти</RouteLink>
          ) : (
            !forbidden && (
              <PrimaryButton type="button" onClick={() => void query.refetch()}>
                Повторить
              </PrimaryButton>
            )
          )}
        </div>
      )}
      {ready && query.data.length === 0 && (
        <div className="empty-state gafus-pets-empty">
          <img src="/images/pets-empty.webp" alt="" width="300" height="220" loading="lazy" />
          <p>Питомцы пока не добавлены.</p>
        </div>
      )}
      {ready && query.data.length > 0 && (
        <div className={pageStyles.petList}>
          <ul className={`${styles.petGrid} pet-collection-grid ${expandedPetIds.size > 0 ? expandedStyles.expandedGrid : ""}`}>
            {query.data.map(pet => (
              <li key={pet.id} data-expanded={expandedPetIds.has(pet.id) ? "true" : undefined} className={`${styles.dog_item} pet-collection-card ${pet.type === "CAT" ? styles.catCard : ""} ${expandedPetIds.has(pet.id) ? styles.petExpanded : ""}`}>
                <div className={styles.petHero} data-next-pet-hero>
                  <div className={styles.avatar_container}>
                    <PetAvatarConnected petId={pet.id} ownerId={userId} petType={pet.type==="CAT"?"CAT":"DOG"}
                      petName={pet.name} photoUrl={pet.photoUrl}
                      isCurrent={() => revision===0 &&
                        cache.getQueryData<AuthUser | null>(CURRENT_USER_QUERY_KEY)?.id===userId}/>
                  </div>
                  <div className={styles.dog_info}>
                    <div className={styles.petHeroTop}>
                      <span className={styles.petSpecies}>{pet.type === "CAT" ? "Кошка" : "Собака"}</span>
                      <button type="button" className={`${styles.petToggle} ${expandedPetIds.has(pet.id) ? styles.petToggleOpen : ""} gafus-pet-open`}
                        aria-label={`${expandedPetIds.has(pet.id)?"Свернуть":"Развернуть"} карточку питомца ${pet.name}`}
                        aria-expanded={expandedPetIds.has(pet.id)}
                        aria-controls={`pet-card-details-${pet.id}`}
                        onClick={()=>toggle(pet.id)}>
                        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"
                          fill="currentColor"><path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>
                      </button>
                    </div>
                    <h3><RouteLink to={petPath(pet.id)}>{pet.name}</RouteLink></h3>
                    <p className={styles.petBreed}>{pet.breed || "Порода не указана"}</p>
                    <div className={styles.petFacts}>
                      {pet.birthDate && Date.parse(pet.birthDate) <= Date.now() && (()=>{
                        const age=getAgeWithMonths(pet.birthDate);
                        const text=[age.years>0?`${age.years} ${declOfNum(age.years,
                          ["год","года","лет"])}`:null,
                          age.months>0?`${age.months} ${declOfNum(age.months,
                            ["месяц","месяца","месяцев"])}`:null]
                          .filter(Boolean).join(" ");
                        return text?<span className={styles.petFact}>
                          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"
                            width="16" height="16" fill="currentColor">
                            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14zm-7-9h5v5h-5z"/>
                          </svg>{text}
                        </span>:null;
                      })()}
                      {pet.weightKg != null && <span className={styles.petFact}>
                        <img src="/images/pet-weight-icon.png" alt=""/> {pet.weightKg} кг
                      </span>}
                      {pet.heightCm != null && <span className={styles.petFact}>
                        <span aria-hidden="true">↗</span> {pet.heightCm} см
                      </span>}
                    </div>
                  </div>
                </div>
                {revision===0&&
                  cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId&&
                  <PetProfileVisibilityConnected key={`visible:${userId}:${pet.id}`}
                    ownerId={userId} petId={pet.id} petName={pet.name}
                    showInProfile={pet.showInProfile}
                    isCurrent={()=>revision===0&&
                      cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId}/>}
                {!expandedPetIds.has(pet.id) &&
                  <div className={styles.petCompactFoot} data-next-pet-foot>
                  <span>Процедуры · {pet.preventionCount ?? "—"}</span>
                  <span>Документы · {pet.documentCount ?? "—"}</span>
                  <button type="button" aria-expanded={false}
                    aria-controls={`pet-card-details-${pet.id}`}
                    onClick={()=>expand(pet.id)}>Подробнее</button>
                </div>}
                <div id={`pet-card-details-${pet.id}`}
                  hidden={!expandedPetIds.has(pet.id)}
                  className={`${styles.petDetails} gafus-pet-inline-details`}
                  aria-label={`Данные питомца ${pet.name}`} >
                  {expandedPetIds.has(pet.id)&&revision===0&&
                  cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId&&
                  <>
                  <PetInlinePrivateFacts key={`extra:${userId}:${pet.id}`}
                    ownerId={userId} petId={pet.id}
                    isCurrent={()=>revision===0&&
                      cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId}/>
                  <div className={`${expandedStyles.contentGroup} ${expandedStyles.preventionGroup}`}>
                    <div className={expandedStyles.sectionHeader}>
                      <img src="/images/pet-procedures-icon.png" alt="" />
                      <h4>Записи о процедурах</h4>
                    </div>
                    <PetPrevention inCard key={`procedures:${userId}:${pet.id}`}
                      ownerId={userId} petId={pet.id}
                      isCurrent={()=>revision===0&&
                        cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId}/>
                  </div>
                  <RouteLink to={petVetVisitsPath(pet.id)} className={expandedStyles.vetShortcut}>
                    <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8 3H5v6a4 4 0 0 0 8 0V3h-3M9 13v3a5 5 0 0 0 10 0v-2"/>
                      <circle cx="19" cy="11" r="3"/>
                    </svg>
                    <span><strong>Посещения врача</strong>
                      <small>Приёмы, заключения и медкарты</small></span>
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 5 7 7-7 7"/>
                    </svg>
                  </RouteLink>
                  <div className={`${expandedStyles.contentGroup} ${expandedStyles.weightGroup}`}>
                    <div className={expandedStyles.sectionHeader}>
                      <img src="/images/pet-weight-icon.png" alt="" />
                      <h4>Вес</h4>
                    </div>
                    <PetWeightHistorySection inCard userId={userId} petId={pet.id}
                      currentOwner={()=>revision===0&&
                        cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId}/>
                  </div>
                  <div className={`${expandedStyles.contentGroup} ${expandedStyles.documentsGroup}`}>
                    <div className={expandedStyles.sectionHeader}>
                      <img src="/images/pet-documents-icon.png" alt="" />
                      <h4>Документы</h4>
                    </div>
                    <p className={expandedStyles.sectionHint}>
                      Здесь можно добавить фото ветпаспорта, справки от врача
                      и другие документы питомца.
                    </p>
                    <PetDocuments inCard key={`documents:${userId}:${pet.id}`}
                      ownerId={userId} petId={pet.id}
                      isCurrent={()=>revision===0&&
                        cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===userId}/>
                  </div>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {addPetOptIn ? (
        <PrimaryButtonLink href="/profile/addPet" className={pageStyles.addPetButton}>Добавить питомца</PrimaryButtonLink>
      ) : (
        <PrimaryButton className={pageStyles.addPetButton} disabled title="Добавление питомца пока недоступно в новом Web">
          Добавить питомца
        </PrimaryButton>
      )}
      {!addPetOptIn && <p className="gafus-pets-transfer-note">Добавление питомцев пока недоступно.</p>}
      </div>
    </section>
  );
}
