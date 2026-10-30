import { Loading } from "../../shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import viewerStyles from "./PetDocumentViewer.module.css";
import cardStyles from "./PetExpandedNext.module.css";
import { PrimaryButton, SecondaryButton } from "../../shared/ui";
import { PetDownloadIcon, PetEditIcon, PetFileIcon, PetTrashIcon } from "./PetCardActionIcons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { syncVerifiedPetCount } from "./petListCountSync";
import { ApiError } from "../../shared/api/client";
import {
  deletePetDocument, documentDownloadUrl, listPetDocuments,
  renamePetDocument, uploadPetDocument, type PetDocumentSummary,
} from "./petDocumentsApi";

/** Read-only original Next image thumbnail. Signed URLs stay in this mounted
 * owner-only leaf, never in shared Query cache or list projection. */
function PetDocumentThumbnail({ petId, doc, stillOwner }: {
  petId: string;
  doc: PetDocumentSummary;
  stillOwner: () => boolean;
}) {
  const latestOwner = useRef(stillOwner);
  latestOwner.current = stillOwner;
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  useEffect(() => {
    if (!doc.mimeType.startsWith("image/") || !latestOwner.current()) return;
    let active = true;
    void documentDownloadUrl(petId, doc.id).then(url => {
      if (active && latestOwner.current()) setThumbnail(url);
    }).catch(() => { /* A private thumbnail must fail closed to the file icon. */ });
    return () => { active = false; };
  }, [petId, doc.id, doc.mimeType]);
  return <div className={cardStyles.documentThumbnail} aria-hidden="true">
    {thumbnail ? <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"
      className={cardStyles.documentThumbImage} onError={() => setThumbnail(null)} /> :
      <><PetFileIcon/><small>{doc.mimeType === "application/pdf" ? "PDF" : "Фото"}</small></>}
  </div>;
}

const failureText = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сессия завершена. Войдите снова.";
    if (error.status === 403) return "Нет доступа к документам этого питомца.";
    if (error.status === 404) return "Документ или питомец не найден.";
    if (error.status === 400 || error.status === 413) return error.message;
  }
  return error instanceof Error && /^Выберите|^Размер|^Укажите/.test(error.message)
    ? error.message : "Не удалось выполнить операцию с документом.";
};

export function PetDocuments({ ownerId, petId, isCurrent, inCard = false }: {
  ownerId: string;
  petId: string;
  isCurrent: () => boolean;
  inCard?: boolean;
}) {
  const cache = useQueryClient();
  const mounted = useRef(true);
  const current = useRef(isCurrent);
  current.current = isCurrent;
  const live = () => mounted.current && current.current();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [expanded, setExpanded] = useState(inCard);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [selectedName, setSelectedName] = useState("");
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!selected || !selected.type.startsWith("image/") || !URL.createObjectURL) {
      setSelectedPreview(null);
      return;
    }
    const url = URL.createObjectURL(selected);
    setSelectedPreview(url);
    return () => { URL.revokeObjectURL(url); };
  }, [selected]);
  // Core's legacy multipart POST has no idempotency receipt. Unknown ACKs
  // must never permit another identical upload without an explicit review.
  const [uploadUncertain, setUploadUncertain] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState("");
  const closeViewerButton = useRef<HTMLButtonElement>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const viewerDialog = useRef<HTMLDivElement>(null);
  // A late signed-URL GET must never reopen a closed/renamed/foreign document.
  const requestVersion = useRef(0);
  const linkVersion = useRef(0);
  const shareEpoch = useRef(0);
  const closePreview = useCallback(() => {
    requestVersion.current++;setLink(null);setFullscreen(false);
    shareEpoch.current++;
    setShareOpen(false);setShareCopied(false);setShareError("");
    if (mounted.current) previewTrigger.current?.focus();
  }, []);
  const openPreview = useCallback((documentId: string) => {
    if (!mounted.current || !current.current()) return;
    const version = ++requestVersion.current;
    setError("");setLink(null);setFullscreen(false);
    shareEpoch.current++;
    setShareOpen(false);setShareCopied(false);setShareError("");
    void (async () => {
      try {
        const url = await documentDownloadUrl(petId, documentId);
        if (mounted.current && current.current() && expanded &&
            requestVersion.current === version) {
          linkVersion.current=version;
          setLink({ id: documentId, url });
        }
      } catch (cause) {
        if (mounted.current && current.current() && requestVersion.current === version)
          setError(failureText(cause));
      }
    })();
  }, [petId, expanded]);
  const documents = useQuery({
    queryKey: ["pets", "documents", ownerId, petId],
    queryFn: async () => {
      if (!live()) throw Error("SESSION_CHANGED");
      const values = await listPetDocuments(petId, ownerId);
      if (!live()) throw Error("SESSION_CHANGED");
      return values;
    },
    enabled: expanded && live(),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    if (expanded && link) closeViewerButton.current?.focus();
  }, [expanded, link]);
  useEffect(() => {
    if (!expanded || !link) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closePreview(); return; }
      if (event.key === "Tab") {
        const focusable = Array.from(viewerDialog.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input:not([disabled])",
        ) ?? []);
        if (!focusable.length) return;
        const active = focusable.indexOf(globalThis.document.activeElement as HTMLElement);
        const next = active < 0 ? (event.shiftKey ? focusable.length - 1 : 0) :
          (active + (event.shiftKey ? focusable.length - 1 : 1)) % focusable.length;
        event.preventDefault();
        focusable[next]?.focus();
        return;
      }
      if (!live() || !documents.isSuccess || documents.isFetching) return;
      const index = documents.data.findIndex(doc => doc.id === link.id);
      if (index < 0) return;
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault(); openPreview(documents.data[index - 1]!.id);
      } else if (event.key === "ArrowRight" && index + 1 < documents.data.length) {
        event.preventDefault(); openPreview(documents.data[index + 1]!.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [expanded, link, documents.isSuccess, documents.isFetching, documents.data,
    openPreview, closePreview]);
  const refetch = async () => {
    const result = await documents.refetch();
    if (!live() || result.isError) return null;
    return result.data ?? null;
  };
  const run = async (action: () => Promise<{ verify: (items: PetDocumentSummary[]) => boolean;
    success: string }>) => {
    if (busy || !live()) return false;
    setBusy(true); setError(""); setNotice(""); closePreview();
    try {
      const outcome = await action();
      if (!live()) return false;
      const list = await refetch();
      if (!live()) return false;
      if (list && outcome.verify(list)) {
        syncVerifiedPetCount(cache, ownerId, petId, "documentCount", list.length);
        setNotice(outcome.success); return true;
      }
      setError("Операция отправлена, но результат не подтверждён повторным чтением. Проверьте список перед повтором.");
      return false;
    } catch (cause) {
      if (!live()) return false;
      await refetch();
      if (!live()) return false;
      setError(failureText(cause) + " При неизвестном результате проверьте список перед повтором.");
      return false;
    } finally { if (live()) setBusy(false); }
  };
  return (
    <section aria-label="Документы питомца" className="pet-documents-section">
      {!inCard && <button type="button" className="button-secondary" onClick={() => {
        setExpanded(value => !value); setError(""); setNotice(""); closePreview();
      }}>{expanded ? "Скрыть документы" : "Документы питомца"}</button>}
      {expanded && <>
        {documents.isPending && <Loading message="Загружаем документы…" />}
        {documents.isError && <div role="alert"><p>{failureText(documents.error)}</p>
          <PrimaryButton type="button" onClick={() => void documents.refetch()}>Повторить загрузку</PrimaryButton>
        </div>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {documents.isSuccess && !documents.isFetching && <>
          {documents.data.length === 0 && <p>Документов пока нет.</p>}
          <ul className={`pet-documents-list ${inCard ? cardStyles.documentList : ""}`}>
            {documents.data.map(doc => <li key={doc.id}
              className={inCard ? cardStyles.documentItem : undefined}>
              {inCard && <PetDocumentThumbnail petId={petId} doc={doc} stillOwner={live}/>}
              <div className={inCard ? cardStyles.documentInfo : undefined}>
              <div className={inCard ? cardStyles.documentMeta : undefined}>
                <strong title={doc.name}>{doc.name}</strong>
                <span>{(doc.sizeBytes / 1024).toFixed(1)} КБ</span>
              </div>
              <div className={inCard ? cardStyles.documentActionRow : undefined}>
              <button type="button" disabled={busy}
                className={inCard ? cardStyles.documentOpenIcon : undefined}
                aria-label={inCard ? `Открыть документ ${doc.name}` : undefined}
                title={inCard ? "Открыть или скачать" : undefined}
                onClick={event => {
                previewTrigger.current = event.currentTarget;
                openPreview(doc.id);
              }}>
                {inCard ? <PetDownloadIcon/> : "Открыть или скачать"}</button>
              {link?.id === doc.id && <a href={link.url} target="_blank"
                rel="noopener noreferrer" referrerPolicy="no-referrer">Открыть документ в новой вкладке</a>}
              {inCard ? <PrimaryButton type="button" disabled={busy}
                className={cardStyles.documentCompactIcon}
                title="Переименовать" aria-label={`Переименовать документ ${doc.name}`}
                onClick={() => {
                  setEditing(doc.id); setName(doc.name); setError(""); setNotice(""); closePreview();
                }}><PetEditIcon/></PrimaryButton> :
                <button type="button" disabled={busy} onClick={() => {
                  setEditing(doc.id); setName(doc.name); setError(""); setNotice(""); closePreview();
                }}>Переименовать</button>}
              {editing === doc.id && <form onSubmit={event => {
                event.preventDefault();
                void run(async () => {
                  const ack = await renamePetDocument(petId, doc.id, ownerId, name);
                  return { verify: items => items.some(item =>
                    item.id === doc.id && item.name === ack.name),
                    success: "Документ переименован." };
                }).then(() => { if (live()) setEditing(null); });
              }}>
                <label>Название документа <input required maxLength={250}
                  value={name} disabled={busy}
                  onChange={event => setName(event.target.value)}/></label>
                <PrimaryButton type="submit" disabled={busy || !name.trim()}>Сохранить</PrimaryButton>
                <SecondaryButton variant="red" type="button" disabled={busy} onClick={() => setEditing(null)}>Отмена</SecondaryButton>
              </form>}
              {inCard ? <SecondaryButton variant="red" disabled={busy}
                className={cardStyles.documentCompactIcon}
                title="Удалить" aria-label={`Удалить документ ${doc.name}`}
                onClick={() => {
                  setError(""); closePreview(); setConfirmDeleteId(doc.id);
                }}><PetTrashIcon/></SecondaryButton> :
                <SecondaryButton variant="red" type="button" disabled={busy} onClick={() => {
                  setError(""); closePreview(); setConfirmDeleteId(doc.id);
                }}>Удалить</SecondaryButton>}
              {confirmDeleteId === doc.id && <div role="group"
                aria-label="Подтверждение удаления документа">
                <p>Удалить документ «{doc.name}»?</p>
                <SecondaryButton variant="red" type="button" disabled={busy} onClick={() => {
                  setConfirmDeleteId(null);
                  void run(async () => {
                    await deletePetDocument(petId, doc.id);
                    return { verify: items => items.every(item => item.id !== doc.id),
                      success: "Документ удалён." };
                  });
                }}>Да, удалить документ</SecondaryButton>
                <SecondaryButton variant="red" type="button" disabled={busy}
                  onClick={() => setConfirmDeleteId(null)}>Не удалять</SecondaryButton>
              </div>}
              </div>
              </div>
            </li>)}
          </ul>
        </>}
        <form onSubmit={event => {
          event.preventDefault();
          if (!selected || uploadUncertain) return;
          const base = selectedName.trim();
          const suffix = selected.name.match(/\.[^.]+$/)?.[0] ?? "";
          const chosenName = base.toLowerCase().endsWith(suffix.toLowerCase()) ?
            base : base + suffix;
          if (!base || base.includes("/") || base.includes("\\") ||
              [...base].some(char => char.charCodeAt(0) < 32) || chosenName.length > 250) {
            setError("Название документа: от 1 до 250 символов без разделителей пути.");
            return;
          }
          const chosen = chosenName === selected.name ? selected :
            new File([selected], chosenName, {
              type: selected.type, lastModified: selected.lastModified,
            });
          void run(async () => {
            const ack = await uploadPetDocument(petId, ownerId, chosen);
            return { verify: items => items.some(item => item.id === ack.id),
              success: "Документ загружен." };
          }).then(confirmed => {
            if (!live()) return;
            if (confirmed) { setSelected(null); setSelectedName(""); setUploadUncertain(false); }
            else setUploadUncertain(true);
          });
        }}>
          {inCard ? <PrimaryButton type="button"
            disabled={busy || uploadUncertain} className={cardStyles.documentAddButton}
            onClick={() => picker.current?.click()}>+ Добавить документ</PrimaryButton> :
            <label htmlFor={`pet-document-file-${petId}`}>Добавить документ</label>}
            <input ref={picker} type="file" id={`pet-document-file-${petId}`}
              aria-label="Выбрать документ"
              accept="application/pdf,image/jpeg,image/png" disabled={busy}
              className={inCard ? cardStyles.documentPickInput : undefined}
              onChange={event => {
                const picked = event.target.files?.item(0) ?? null;
                // Original Next clears the input so selecting the same file
                // after Cancel triggers a fresh change event.
                event.currentTarget.value = "";
                setSelected(picked);
                setSelectedName(picked?.name.replace(/\.[^.]+$/, "") ?? "");
                setError("");
              }}/>
          {(!inCard || selected) && <>
            <p>PDF, JPG или PNG, до 10 МБ. Не более 20 документов.</p>
            {inCard && selected && <div className={cardStyles.documentPending}>
              {selectedPreview && <img src={selectedPreview} alt="Предпросмотр документа"/>}
              <label>Название документа
                <input type="text" maxLength={250} value={selectedName}
                  disabled={busy} onChange={event => setSelectedName(event.target.value)}
                  placeholder="Введите название документа" required/>
              </label>
            </div>}
            {inCard ? <div className={cardStyles.documentPickActions}>
              <SecondaryButton variant="red" disabled={busy}
                onClick={() => { setSelected(null); setSelectedName(""); setError(""); }}>
                Отмена</SecondaryButton>
              <PrimaryButton type="submit" disabled={busy || !selected || uploadUncertain}>
                {busy ? "Загружаем…" : "Сохранить"}</PrimaryButton>
            </div> : <PrimaryButton type="submit" disabled={busy || !selected || uploadUncertain}>
              Загрузить документ</PrimaryButton>}
          </>}
          {uploadUncertain && <div role="alert" className="pet-document-uncertain">
            <p>Результат последней загрузки неизвестен. Повторное отправление может
              создать второй документ. Сначала проверьте список.</p>
            <PrimaryButton type="button" disabled={busy} onClick={() => {
              void refetch().then(list => {
                if (!live() || !list) return;
                setUploadUncertain(false);
                setError("Список документов перечитан. Проверьте, нет ли уже загруженного файла, прежде чем отправлять его снова.");
              });
            }}>Проверить список перед новой отправкой</PrimaryButton>
          </div>}
        </form>
      </>}
      {expanded && link && documents.isSuccess && !documents.isFetching &&
        documents.data.some(doc => doc.id === link.id) && (() => {
          const index = documents.data.findIndex(doc => doc.id === link.id);
          const document = documents.data[index]!;
          return createPortal(<div className={viewerStyles.overlay}>
            <div ref={viewerDialog} role="dialog" aria-modal="true"
              aria-label={`Просмотр документа ${document.name}`}
              className={`${viewerStyles.viewer} ${fullscreen ? viewerStyles.fullscreen : ""}`}>
              <div className={viewerStyles.header}>
                <strong className={viewerStyles.heading}>{document.name}</strong>
                <span className={viewerStyles.position}>{index + 1} / {documents.data.length}</span>
                <button type="button" onClick={() => {
                  shareEpoch.current++;
                  setShareOpen(value => !value);setShareCopied(false);setShareError("");
                }}>Поделиться</button>
                <a href={link.url} target="_blank" rel="noopener noreferrer"
                  referrerPolicy="no-referrer" download>Скачать</a>
                <button type="button" onClick={() => setFullscreen(value => !value)}>
                  {fullscreen ? "Свернуть с полного экрана" : "Развернуть на весь экран"}
                </button>
                <SecondaryButton variant="red" ref={closeViewerButton} type="button" onClick={closePreview}>
                  Закрыть просмотр</SecondaryButton>
              </div>
              {shareOpen && <div className={viewerStyles.sharePanel}
                aria-label="Поделиться ссылкой">
                <strong>Поделиться ссылкой</strong>
                <div className={viewerStyles.shareControls}>
                  <input readOnly aria-label="Ссылка на документ" value={link.url}
                    onFocus={event => event.currentTarget.select()}/>
                  <button type="button" onClick={() => {
                    // Source Next exposes the ephemeral signed link only after
                    // owner opens the panel. Never copy it without this click.
                    const write=globalThis.navigator.clipboard?.writeText;
                    if (!write) {setShareError("Не удалось скопировать ссылку");return;}
                    const version=linkVersion.current;
                    const shareVersion=shareEpoch.current;
                    const currentShare=() => live() && shareOpen &&
                      requestVersion.current === version && shareEpoch.current === shareVersion;
                    void write.call(globalThis.navigator.clipboard,link.url).then(() => {
                      if (currentShare()) setShareCopied(true);
                    }).catch(() => {
                      if (currentShare()) setShareError("Не удалось скопировать ссылку");
                    });
                  }}>{shareCopied?"Скопировано":"Скопировать"}</button>
                </div>
                {shareError && <p role="alert">{shareError}</p>}
              </div>}
              <div className={viewerStyles.body}>
                {document.mimeType === "application/pdf" ?
                  <iframe src={link.url} title={document.name} sandbox="" referrerPolicy="no-referrer"/> :
                  <img src={link.url} alt={document.name} referrerPolicy="no-referrer"/>}
              </div>
              <div className={viewerStyles.arrows}>
                <button type="button" disabled={index === 0}
                  onClick={() => { const previous = documents.data[index - 1];
                    if (previous) openPreview(previous.id); }}>Предыдущий документ</button>
                <button type="button" disabled={index === documents.data.length - 1}
                  onClick={() => { const next = documents.data[index + 1];
                    if (next) openPreview(next.id); }}>Следующий документ</button>
              </div>
            </div>
          </div>, globalThis.document.body);
        })()}
    </section>
  );
}
