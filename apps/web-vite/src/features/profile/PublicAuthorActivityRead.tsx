import { Loading } from "../../shared/ui";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {useInfiniteQuery,useQuery,useQueryClient} from "@tanstack/react-query";
import {ApiError} from "../../shared/api/client";
import {CURRENT_USER_QUERY_KEY,useCurrentUser} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {RouteLink,momentPath,questionPath} from "../../shared/router/location";
import {getMomentsStatus,isSafeMomentUsername,listProfileMoments} from "../moments/momentsApi";
import {listPublicAuthorQuestions} from "../questions/questionApi";
import {PrimaryButton} from "../../shared/ui";
import styles from "./WEB1PublicActivityCards.module.css";

/** Author activity is viewer-scoped and read-only. Core actor and per-GET
 * status/visibility remain authoritative. On the public profile, the top tab
 * is the explicit trigger; standalone consumers retain their reveal button.
 * Potentially signed media DTOs remain text-only, with no media rendering. */
export function PublicAuthorActivityRead({username,section="all",startOpened=false}:{
  username:string;section?:"activity"|"questions"|"all";startOpened?:boolean;
}){
  const cache=useQueryClient();
  const session=useCurrentUser();
  const firstActor=useRef(cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null);
  const revision=useRef(0);
  const seen=useRef(firstActor.current);
  const signal=useSyncExternalStore(cb=>cache.getQueryCache().subscribe(event=>{
    if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
      event.query.queryKey.every((value:unknown,i:number)=>value===CURRENT_USER_QUERY_KEY[i])){
      const actor=cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null;
      if(actor!==seen.current){seen.current=actor;revision.current++;cb();}
    }
  }),()=>revision.current,()=>revision.current);
  const [opened,setOpened]=useState(startOpened);
  const actor=session.isSuccess?session.data?.id??null:null;
  const safeName=isSafeMomentUsername(username)&&username.length<=100;
  const allowed=signal===0&&!!actor&&actor===firstActor.current&&safeName&&
    session.isSuccess&&!session.isFetching;
  const ready=opened&&allowed;
  const showPosts=section!=="questions";
  const showQuestions=section!=="activity";
  const status=useQuery({
    queryKey:["profile-activity","moments-status",actor,username],
    queryFn:getMomentsStatus,enabled:ready&&showPosts,staleTime:0,gcTime:0,retry:false,
    refetchOnWindowFocus:false,
  });
  const posts=useInfiniteQuery({
    queryKey:["profile-activity","moments",actor,username],
    queryFn:({pageParam})=>listProfileMoments(username,pageParam),
    initialPageParam:null as string|null,
    getNextPageParam:last=>last.nextCursor??undefined,
    enabled:ready&&showPosts&&status.isSuccess&&!status.isFetching&&status.data.enabled,
    staleTime:0,gcTime:0,retry:false,refetchOnWindowFocus:false,
  });
  const questions=useInfiniteQuery({
    queryKey:["profile-activity","questions",actor,username],
    queryFn:({pageParam})=>listPublicAuthorQuestions(username,pageParam),
    initialPageParam:1,
    getNextPageParam:last=>last.nextPage??undefined,
    enabled:ready&&showQuestions,staleTime:0,gcTime:0,retry:false,refetchOnWindowFocus:false,
  });
  useEffect(()=>{
    if(signal===0)return;
    void cache.cancelQueries({queryKey:["profile-activity"]}).then(()=>
      cache.removeQueries({queryKey:["profile-activity"]}));
  },[cache,signal]);
  const statusReady=ready&&status.isSuccess&&!status.isFetching;
  const postsReady=statusReady&&status.data.enabled&&
    (posts.isSuccess||posts.isFetchNextPageError)&&
    (!posts.isFetching||posts.isFetchingNextPage);
  const questionsReady=ready&&(questions.isSuccess||questions.isFetchNextPageError)&&
    (!questions.isFetching||questions.isFetchingNextPage);
  const unauth=(error:unknown)=>error instanceof ApiError&&error.status===401;
  const forbidden=(error:unknown)=>error instanceof ApiError&&error.status===403;
  const missing=(error:unknown)=>error instanceof ApiError&&error.status===404;
  const postPageUnauthorized=posts.isFetchNextPageError&&unauth(posts.error);
  const questionPageUnauthorized=questions.isFetchNextPageError&&unauth(questions.error);
  const postPageDenied=posts.isFetchNextPageError&&
    (unauth(posts.error)||forbidden(posts.error)||missing(posts.error));
  const questionPageDenied=questions.isFetchNextPageError&&
    (unauth(questions.error)||forbidden(questions.error)||missing(questions.error));
  const postIds=new Set<string>();
  const postItems=postsReady&&!postPageDenied?posts.data!.pages.flatMap(page=>page.items)
    .filter(item=>postIds.has(item.id)?false:(postIds.add(item.id),true)):[];
  const questionIds=new Set<string>();
  const questionItems=questionsReady&&!questionPageDenied?
    questions.data!.pages.flatMap(page=>page.items)
      .filter(item=>questionIds.has(item.id)?false:(questionIds.add(item.id),true)):[];
  // Component-lifetime tokens keep each list independent and survive a
  // same-turn double click before React commits isFetchingNextPage.
  const pageIdentity=JSON.stringify([actor,username]);
  const postFlight=useRef<{key:string}|null>(null);
  const questionFlight=useRef<{key:string}|null>(null);
  const [postBusyKey,setPostBusyKey]=useState<string|null>(null);
  const [questionBusyKey,setQuestionBusyKey]=useState<string|null>(null);
  const postBusy=postBusyKey===pageIdentity||posts.isFetchingNextPage;
  const questionBusy=questionBusyKey===pageIdentity||questions.isFetchingNextPage;
  const currentActor=()=>cache.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id??null;
  const fetchPostPage=()=>{
    if(!postsReady||postPageDenied||postFlight.current?.key===pageIdentity||
      postBusy||currentActor()!==actor)return;
    const flight={key:pageIdentity};
    postFlight.current=flight;
    setPostBusyKey(pageIdentity);
    const release=()=>{
      if(postFlight.current!==flight)return;
      postFlight.current=null;
      setPostBusyKey(current=>current===flight.key?null:current);
    };
    void posts.fetchNextPage({cancelRefetch:false}).then(release,release);
  };
  const fetchQuestionPage=()=>{
    if(!questionsReady||questionPageDenied||questionFlight.current?.key===pageIdentity||
      questionBusy||currentActor()!==actor)return;
    const flight={key:pageIdentity};
    questionFlight.current=flight;
    setQuestionBusyKey(pageIdentity);
    const release=()=>{
      if(questionFlight.current!==flight)return;
      questionFlight.current=null;
      setQuestionBusyKey(current=>current===flight.key?null:current);
    };
    void questions.fetchNextPage({cancelRefetch:false}).then(release,release);
  };
  if(!session.isSuccess||session.isFetching)return <section aria-label="Активность пользователя">
    <Loading message="Проверяем доступ к активности…" />
  </section>;
  if(!actor)return <section aria-label="Активность пользователя">
    <h3>Публикации и вопросы @{username}</h3>
    <p>Войдите в аккаунт, чтобы посмотреть публикации и вопросы.</p>
    <RouteLink to="/login">Войти</RouteLink>
  </section>;
  if(!allowed)return <section role="alert" aria-label="Активность пользователя">
    {signal!==0?"Сессия изменилась. Откройте профиль заново.":
      "Активность этого профиля сейчас недоступна."}
  </section>;
  if(!opened)return <section aria-label="Активность пользователя">
    <h3>Публикации и вопросы @{username}</h3>
    <button type="button" onClick={()=>setOpened(true)}>Показать публикации и вопросы</button>
  </section>;
  return <div className={`public-profile-activity ${styles.collection}`}>
    {showPosts&&<section aria-label={`Публикации @${username}`} className={styles.panel}>
      <div className={styles.headingGroup}>
        <span className={styles.overline}>Моменты автора</span>
        <h3 className={styles.title}>Публикации @{username}</h3>
      </div>
      {(status.isPending||status.isFetching)&&<Loading message="Проверяем «Моменты»…" className={styles.state} />}
      {status.isError&&<p role="alert">{unauth(status.error)?
        "Сессия завершена. Войдите снова.":"Не удалось проверить доступность «Моментов»."}</p>}
      {status.isError&&!unauth(status.error)&&<PrimaryButton type="button"
        onClick={()=>void status.refetch()}>Повторить проверку</PrimaryButton>}
      {statusReady&&!status.data.enabled&&<p role="status" className={styles.state}>Моменты сейчас недоступны.</p>}
      {statusReady&&status.data.enabled&&<>
        {(posts.isPending||posts.isFetching&&!posts.isFetchingNextPage)&&
          <Loading message="Загружаем публикации…" className={styles.state} />}
        {posts.isError&&!posts.isFetchNextPageError&&<p role="alert">{unauth(posts.error)?
          "Сессия завершена. Войдите снова.":"Не удалось загрузить публикации автора."}</p>}
        {posts.isError&&!posts.isFetchNextPageError&&!unauth(posts.error)&&
          <PrimaryButton type="button" onClick={()=>void posts.refetch()}>Повторить публикации</PrimaryButton>}
        {postsReady&&!postPageDenied&&postItems.length===0&&
          <p className={styles.state}>Нет доступных публикаций.</p>}
        {postsReady&&!postPageDenied&&<ul className={styles.list}>
          {postItems.map(post=><li key={post.id} className={styles.card}>
            <span className={styles.typeTag}>Момент</span>
            <RouteLink className={styles.cardLink} to={momentPath(post.id)}>
              {post.text.slice(0,320)||"Опрос или медиа-публикация"}
            </RouteLink>
            <span className={styles.cardMeta}>Комментарии: {post.commentCount}</span>
          </li>)}
        </ul>}
        {postsReady&&posts.isFetchNextPageError&&<div role="alert">
          <p>{postPageUnauthorized?"Сессия завершена. Войдите снова.":
            forbidden(posts.error)?"Нет доступа к публикациям автора.":
            missing(posts.error)?"Публикации автора недоступны.":
            "Не удалось загрузить следующую страницу публикаций автора."}</p>
          {!postPageDenied&&<PrimaryButton type="button" disabled={postBusy}
            onClick={fetchPostPage}>
            {postBusy?"Загружаем…":"Повторить страницу публикаций"}
          </PrimaryButton>}
        </div>}
        {postsReady&&posts.hasNextPage&&!posts.isFetchNextPageError&&<button type="button"
          disabled={postBusy} onClick={fetchPostPage}>
            {postBusy?"Загружаем…":"Показать ещё публикации"}
          </button>}
      </>}
    </section>}
    {showQuestions&&<section aria-label={`Вопросы @${username}`} className={styles.panel}>
      <div className={styles.headingGroup}>
        <span className={styles.overline}>Обсуждения автора</span>
        <h3 className={styles.title}>Вопросы @{username}</h3>
      </div>
      {(questions.isPending||questions.isFetching&&!questions.isFetchingNextPage)&&
        <Loading message="Загружаем вопросы…" className={styles.state} />}
      {questions.isError&&!questions.isFetchNextPageError&&<p role="alert">{unauth(questions.error)?
        "Сессия завершена. Войдите снова.":"Не удалось загрузить вопросы автора."}</p>}
      {questions.isError&&!questions.isFetchNextPageError&&!unauth(questions.error)&&
        <PrimaryButton type="button" onClick={()=>void questions.refetch()}>Повторить вопросы</PrimaryButton>}
      {questionsReady&&!questionPageDenied&&questionItems.length===0&&
        <p className={styles.state}>Вопросов пока нет.</p>}
      {questionsReady&&!questionPageDenied&&<ul className={styles.list}>
        {questionItems.map(item=><li key={item.id} className={styles.card}>
          <span className={styles.typeTag}>Вопрос</span>
          <RouteLink className={styles.cardLink} to={questionPath(item.id)}>{item.title}</RouteLink>
          <span className={styles.cardMeta}>Ответы: {item.answerCount}</span>
        </li>)}
      </ul>}
      {questionsReady&&questions.isFetchNextPageError&&<div role="alert">
        <p>{questionPageUnauthorized?"Сессия завершена. Войдите снова.":
          forbidden(questions.error)?"Нет доступа к вопросам автора.":
          missing(questions.error)?"Вопросы автора недоступны.":
          "Не удалось загрузить следующую страницу вопросов автора."}</p>
        {!questionPageDenied&&<PrimaryButton type="button" disabled={questionBusy}
          onClick={fetchQuestionPage}>
          {questionBusy?"Загружаем…":"Повторить страницу вопросов"}
        </PrimaryButton>}
      </div>}
      {questionsReady&&questions.hasNextPage&&!questions.isFetchNextPageError&&
        <button type="button" disabled={questionBusy} onClick={fetchQuestionPage}>
          {questionBusy?"Загружаем…":"Показать ещё вопросы"}
        </button>}
    </section>}
  </div>;
}
