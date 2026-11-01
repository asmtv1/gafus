import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoManagement } from "./GalleryManage";
import type { AlbumSummary, AlbumPhoto, GalleryAlbumCommands } from "./galleryApi";
import original from "../../brand/LegacyGallery.module.css";
import styles from "./GalleryPhotoActionsDialog.module.css";
import { SecondaryButton } from "../../shared/ui";

/** Match original Next's one ellipsis per photo and owner-only action dialog.
 * Actual writes remain in PhotoManagement and require an owner-scoped GET.
 */
export function GalleryPhotoActionsDialog({album,photo,commands,onChanged}:{
  album:AlbumSummary;photo:AlbumPhoto;commands?:GalleryAlbumCommands;onChanged:()=>void;
}) {
  const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const dialog=useRef<HTMLDivElement>(null);
  const close=useCallback(()=>{setOpen(false);trigger.current?.focus();},[]);
  useEffect(()=>{
    if(!open)return;
    const controls=()=>[...dialog.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]"
    )??[]];
    // jsdom exposes no element layout; focus the named close control directly.
    dialog.current?.querySelector<HTMLButtonElement>("[data-gallery-close]")?.focus();
    const keys=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();close();return;}
      if(event.key!=="Tab")return;
      const items=controls();
      if(!items.length)return;
      const current=items.indexOf(document.activeElement as HTMLElement);
      const next=current<0?0:(current+(event.shiftKey?items.length-1:1))%items.length;
      event.preventDefault();items[next]?.focus();
    };
    document.addEventListener("keydown",keys);
    return ()=>document.removeEventListener("keydown",keys);
  },[open,close]);
  return <>
    <button ref={trigger} type="button"
      className={`${original.photoManageButton} ${styles.trigger}`}
      aria-label={`Управление фотографией: ${photo.caption||"без подписи"}`}
      title="Управление фото" onClick={()=>setOpen(true)}>•••</button>
    {open && <div className={styles.backdrop}
      onClick={event=>{if(event.target===event.currentTarget)close();}}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Фотография"
        className={`${styles.dialog} gallery-photo-management-dialog`}>
        <h2>Фотография</h2>
        <PhotoManagement album={album} photo={photo} commands={commands} sourceDialog
          onChanged={()=>{onChanged();close();}}/>
        <div className={styles.actions}>
          <SecondaryButton data-gallery-close type="button"
            onClick={close}>Закрыть</SecondaryButton>
        </div>
      </div>
    </div>}
  </>;
}
