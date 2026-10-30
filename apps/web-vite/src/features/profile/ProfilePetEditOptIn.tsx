import { Loading } from "../../shared/ui";
import { BackButton, PrimaryButton } from "../../shared/ui";
import {useRef,useState,useSyncExternalStore} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {AuthUser} from "../../shared/auth/authApi";
import {listMyPets} from "../pets/petApi";
import {PetDetails} from "../pets/PetDetails";
import type {PetEditWire} from "../pets/petEditSourceMock";

/** Profile -> owner list -> existing details -> edit, source/mocked only. */
export function ProfilePetEditOptIn({enabled,ownerId,transport}:{
  enabled:boolean;ownerId:string;transport?:PetEditWire;
}){
  if(!enabled||transport?.fixtureKind!=="AG2_PET_EDIT_SYNTHETIC_ONLY")
    return null;
  return <BoundProfilePets key={ownerId} ownerId={ownerId} transport={transport}/>;
}
function BoundProfilePets({ownerId,transport}:{
  ownerId:string;transport:PetEditWire;
}){
  const client=useQueryClient();
  const initial=useRef(client.getQueryData<AuthUser|null>(
    CURRENT_USER_QUERY_KEY)?.id??null);
  const epoch=useRef(0);
  const revision=useSyncExternalStore(callback=>
    client.getQueryCache().subscribe(event=>{
      if(event.query.queryKey.length===CURRENT_USER_QUERY_KEY.length&&
        event.query.queryKey.every((v:unknown,i:number)=>v===CURRENT_USER_QUERY_KEY[i])){
        epoch.current++;callback();
      }
    }),()=>epoch.current,()=>epoch.current);
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const active=initial.current===ownerId&&
    client.getQueryData<AuthUser|null>(CURRENT_USER_QUERY_KEY)?.id===ownerId&&
    revision===0;
  const query=useQuery({
    queryKey:["pets","profile-optin",ownerId],
    queryFn:listMyPets,enabled:active&&open,staleTime:0,gcTime:0,retry:false,
  });
  if(!active)return <p role="alert">
    Сессия изменилась. Откройте профиль заново.
  </p>;
  return <section className="profile-pets-optin" aria-label="Питомцы из профиля">
    {!open?<button type="button" onClick={()=>setOpen(true)}>
      Питомцы: посмотреть и изменить (макет)
    </button>:<>
      <h3>Мои питомцы</h3>
      <p className="note">Редактирование — только синтетический transport.</p>
      <BackButton type="button"
        onClick={()=>{setOpen(false);setSelected(null);}}>Вернуться к профилю</BackButton>
      {query.isPending&&<Loading message="Загружаем питомцев…" />}
      {query.isError&&<div role="alert"><p>Не удалось загрузить питомцев.</p>
        <PrimaryButton type="button" onClick={()=>void query.refetch()}>Повторить</PrimaryButton>
      </div>}
      {query.isSuccess&&<>
        {query.data.length===0&&<p role="status" className="empty-state">
          Питомцы пока не добавлены.
        </p>}
        <ul className="profile-pets-optin-list">{query.data.map(item=><li key={item.id}>
          <span>{item.name} · {item.type==="DOG"?"Собака":"Кошка"}</span>
          <button className="button-secondary" type="button" disabled={selected!==null}
            onClick={()=>setSelected(item.id)}>Открыть</button>
        </li>)}</ul>
        {selected&&<section className="profile-pet-selected">
          <BackButton type="button"
            onClick={()=>setSelected(null)}>К списку питомцев</BackButton>
          <PetDetails key={selected} userId={ownerId} petId={selected}
            showEditOptIn editMockTransport={transport}/>
        </section>}
      </>}
    </>}
  </section>;
}
