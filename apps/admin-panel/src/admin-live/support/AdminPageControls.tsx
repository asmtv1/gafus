import type { PageQuery } from "./useBoundedAdminPage";

export function AdminPageControls({page,loading,error,onPage,onSize,onRetry}:{
  page:(PageQuery & {total:number})|null;loading:boolean;error:string|null;
  onPage:(page:number)=>void;onSize:(size:number)=>void;onRetry:()=>void;
}) {
  return <div className="pagination">
    {loading && <span role="status">Загрузка страницы…</span>}
    {error && <span role="alert">{error} <button onClick={onRetry}>Повторить</button></span>}
    {page && <>
      <label>Строк на странице <select value={page.pageSize} disabled={loading} onChange={e=>onSize(Number(e.target.value))}>
        {[25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
      </select></label>
      <span>{page.total?((page.page-1)*page.pageSize+1):0}–{Math.min(page.page*page.pageSize,page.total)} из {page.total}</span>
      <button disabled={loading||page.page<=1} onClick={()=>onPage(page.page-1)}>Назад</button>
      <button disabled={loading||page.page*page.pageSize>=page.total} onClick={()=>onPage(page.page+1)}>Дальше</button>
    </>}
  </div>;
}
