import type { VetVisitSafe } from "./vetVisitsSourceMock";
import { SecondaryButton } from "../../shared/ui";
import style from "./PetVetVisitsConnected.module.css";
import legacy from "../../brand/LegacyVetVisits.module.css";
import { fields } from "./petVetVisitDomain";

/** Pure presentational details/actions; fetching, owner fencing and mutations stay in parent. */
type VetMedia = (visitId:string,attachmentId:string,
  variant:"preview"|"original"|"download")=>string;
export type InlineVisitCallbacks={
  busy:boolean;unknown:boolean;media:VetMedia;
  onEdit:(visit:VetVisitSafe)=>void;
  onRemove:(visit:VetVisitSafe)=>Promise<void>;
  onRemoveFile:(visit:VetVisitSafe,fileId:string)=>Promise<void>;
  onClose:()=>void;
};
export function VetVisitDetailsContent({visitData,busy,unknown,media,onEdit,onRemove,onRemoveFile,
  onClose}:InlineVisitCallbacks&{visitData:VetVisitSafe}){
  return (
            <div className={legacy.details}>
              <dl>
                {fields
                  .filter(([key]) => key !== "specialty" && visitData[key])
                  .map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{visitData[key]}</dd>
                    </div>
                  ))}
              </dl>
              {visitData.attachments.length > 0 &&
                <section className={legacy.attachments} aria-label="Вложения посещения">
                  <h3>Вложения · {visitData.attachments.length}</h3>
                  <div className={legacy.grid}>
                    {visitData.attachments.map((file) => (
                      <div key={file.id} className={legacy.attachment}>
                        <a href={media(visitData.id, file.id, "original")}
                          target="_blank" rel="noopener noreferrer"
                          aria-label={`Открыть ${file.name}`}>
                          {file.hasPreview ? <img
                            src={media(visitData.id, file.id, "preview")}
                            alt={file.name} loading="lazy"/> :
                            <span className={legacy.pdf} role="status">
                              {file.previewProcessing ? "Обрабатываем…" :
                                file.mimeType === "application/pdf" ? "PDF" : "Фото"}
                            </span>}
                          <span>{file.name}</span>
                        </a>
                        <a href={media(visitData.id, file.id, "download")}>
                          Скачать оригинал</a>
                        <SecondaryButton variant="red" type="button" disabled={busy || unknown}
                          onClick={() => void onRemoveFile(visitData, file.id)}>
                          Удалить вложение
                        </SecondaryButton>
                      </div>
                    ))}
                  </div>
                </section>}
              <div className={style.actions}>
                <button
                  type="button"
                  disabled={busy || unknown}
                  onClick={() => onEdit(visitData)}
                >
                  Изменить
                </button>
                <SecondaryButton variant="red"
                  type="button"
                  disabled={busy || unknown}
                  onClick={() => void onRemove(visitData)}
                >
                  Удалить запись
                </SecondaryButton>
                <button type="button" onClick={onClose}>
                  К истории
                </button>
              </div>
            </div>
  );
}
