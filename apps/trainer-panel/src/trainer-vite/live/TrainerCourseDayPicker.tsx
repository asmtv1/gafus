import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type TrainerCourseDay = { id: string; title: string };
const CAPACITY = 250;
const availablePrefix = "available:";
const selectedPrefix = "selected:";
const availableDrop = "available-list";
const selectedDrop = "selected-list";
/** Pointer position wins over the original draggable's rectangle. Otherwise
 * a large left scroll-list captures drops intended for the empty right list. */
const courseDayCollision: CollisionDetection = args => {
  const pointer = pointerWithin(args);
  return pointer.length ? pointer : closestCenter(args);
};

/** Pure transformation, with occurrences addressed by INDEX instead of dayId.
 * The same day can appear arbitrarily many times without collapsing entries. */
export function applyTrainerDayDrop(
  selected: readonly string[], source: string, destination: string | null,
): string[] {
  if (!destination) return [...selected];
  if (source.startsWith(availablePrefix)) {
    const id = source.slice(availablePrefix.length);
    if (!id || selected.length >= CAPACITY ||
        (destination !== selectedDrop && !destination.startsWith(selectedPrefix)))
      return [...selected];
    const at = destination === selectedDrop ? selected.length :
      Number(destination.slice(selectedPrefix.length));
    if (!Number.isInteger(at) || at < 0 || at >= selected.length + 1)
      return [...selected];
    const next = [...selected];
    next.splice(at, 0, id);
    return next;
  }
  if (!source.startsWith(selectedPrefix)) return [...selected];
  const from = Number(source.slice(selectedPrefix.length));
  if (!Number.isInteger(from) || from < 0 || from >= selected.length)
    return [...selected];
  if (destination === availableDrop) return selected.filter((_, i) => i !== from);
  if (destination !== selectedDrop && !destination.startsWith(selectedPrefix))
    return [...selected];
  const to = destination === selectedDrop ? selected.length - 1 :
    Number(destination.slice(selectedPrefix.length));
  if (!Number.isInteger(to) || to < 0 || to >= selected.length)
    return [...selected];
  return arrayMove([...selected], from, to);
}

function AvailableDay({ day, add, disabled, amount, kind }: {
  day: TrainerCourseDay; add: (id: string) => void; disabled: boolean; amount: number;
  kind: "day" | "step";
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: availablePrefix + day.id, disabled,
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.45 : 1 };
  return <li ref={setNodeRef} style={style} className="trainer-day-available-row">
    <div className="trainer-day-available-drag" {...attributes} {...listeners}
      title={"Перетащить " + (kind === "step" ? "шаг: " : "день: ") + day.title}>
      <span className="trainer-day-grip" aria-hidden="true">⠿</span>
      <div className="trainer-day-available-info">
        <strong>{day.title}</strong>
        {amount > 0 && <small>{kind === "step" ? "В дне" : "В курсе"}: {amount}</small>}
      </div>
    </div>
    <button type="button" className="trainer-day-add" disabled={disabled}
      aria-label={"Добавить " + (kind === "step" ? "шаг: " : "день: ") + day.title} onClick={() => add(day.id)}>+ Добавить</button>
  </li>;
}

function SelectedDay({ dayId, title, index, length, move, remove, disabled, kind }: {
  dayId: string; title: string; index: number; length: number;
  move: (from: number, to: number) => void;
  remove: (index: number) => void; disabled: boolean;
  kind: "day" | "step";
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform,
    transition, isDragging } = useSortable({ id: selectedPrefix + index, disabled });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform),
    transition, opacity: isDragging ? 0.5 : 1 };
  return <li ref={setNodeRef} style={style} className="trainer-day-selected-row"
    data-day-id={kind === "day" ? dayId : undefined}
    data-step-id={kind === "step" ? dayId : undefined} data-occurrence={index}>
    <button ref={setActivatorNodeRef} type="button" disabled={disabled}
      className="trainer-day-sort-handle" title="Перетащить для изменения порядка"
      aria-label={`Перетащить ${kind === "step" ? "шаг" : "день"} ${index + 1}: ${title}`}
      {...attributes} {...listeners}><span aria-hidden="true">⠿</span></button>
    <span className="trainer-day-ordinal" aria-label={`Позиция ${index + 1}`}>{index + 1}</span>
    <span className="trainer-day-selected-title">{title}</span>
    <div className="trainer-day-row-actions">
      <button type="button" className="trainer-day-icon-button" disabled={disabled || index === 0}
        aria-label={`Переместить выше: ${title}, позиция ${index + 1}`}
        title="Вверх" onClick={() => move(index, index - 1)}>↑</button>
      <button type="button" className="trainer-day-icon-button"
        disabled={disabled || index === length - 1}
        aria-label={`Переместить ниже: ${title}, позиция ${index + 1}`}
        title="Вниз" onClick={() => move(index, index + 1)}>↓</button>
      <button type="button" className="trainer-day-remove" disabled={disabled}
        aria-label={`Убрать ${kind === "step" ? "шаг" : "день"}: ${title}, позиция ${index + 1}`}
        title={kind === "step" ? "Убрать из дня" : "Убрать из курса"} onClick={() => remove(index)}>×</button>
    </div>
  </li>;
}

/** Must mount INSIDE DndContext; hooks in its parent's render function
 * would bind to the wrong context and fail for an empty target list. */
function DayDropZone({ id, className, zone, children }: {
  id: string; className?: string; zone: "available" | "selected";
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef} data-drop-zone={zone} className={className}>{children}</div>;
}

export function TrainerCourseDayPicker({ available, selectedIds, labels, onChange,
  disabled = false, kind = "day" }: {
  available: TrainerCourseDay[]; selectedIds: string[];
  labels?: Record<string, string>;
  onChange: (ids: string[]) => void; disabled?: boolean;
  kind?: "day" | "step";
}) {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const count = useMemo(() => {
    const result = new Map<string, number>();
    selectedIds.forEach(id => result.set(id, (result.get(id) ?? 0) + 1));
    return result;
  }, [selectedIds]);
  const titles = useMemo(() => ({
    ...labels,
    ...Object.fromEntries(available.map(day => [day.id, day.title])),
  }), [available, labels]);
  const found = available.filter(day => day.title.toLocaleLowerCase("ru")
    .includes(search.trim().toLocaleLowerCase("ru")));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const canAdd = !disabled && selectedIds.length < CAPACITY;
  const apply = (values: string[]) => { if (!disabled) onChange(values); };
  function onDragEnd(event: DragEndEvent) {
    setActiveId(null); setOverId(null);
    if (disabled) return;
    const source = String(event.active.id);
    const destination = event.over ? String(event.over.id) : null;
    if (source.startsWith(availablePrefix) &&
        !available.some(day => day.id === source.slice(availablePrefix.length))) return;
    const next = applyTrainerDayDrop(selectedIds, source, destination);
    if (next.length !== selectedIds.length || next.some((id, i) => id !== selectedIds[i]))
      onChange(next);
  }
  function add(id: string) {
    if (canAdd && available.some(day => day.id === id)) apply([...selectedIds, id]);
  }
  function move(from: number, to: number) {
    if (disabled || from === to || to < 0 || to >= selectedIds.length) return;
    apply(arrayMove(selectedIds, from, to));
  }
  const previewTitle = activeId ?
    activeId.startsWith(availablePrefix) ? titles[activeId.slice(availablePrefix.length)] :
      titles[selectedIds[Number(activeId.slice(selectedPrefix.length))] ?? ""] : null;
  return <div className="trainer-course-day-picker">
    <p className="trainer-day-picker-hint">Нажмите «Добавить» или перетащите
      {kind === "step" ? " шаг " : " день "}в правую колонку.
      {kind === "step" ? " Один шаг можно включить в день несколько раз." :
        " Один день можно включить в курс несколько раз."}
      Для изменения порядка перетаскивайте карточки за значок
      <span aria-hidden="true"> ⠿ </span>либо используйте стрелки.</p>
    <DndContext sensors={sensors} collisionDetection={courseDayCollision}
      onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
      onDragOver={event => setOverId(event.over ? String(event.over.id) : null)}
      onDragCancel={() => { setActiveId(null); setOverId(null); }}
      onDragEnd={onDragEnd}>
      <div className="trainer-day-picker-columns">
        <section className="trainer-day-picker-panel" aria-label={kind === "step" ? "Доступные тренировочные шаги" : "Доступные тренировочные дни"}>
          <div className="trainer-day-picker-panel-head">
            <h3>Доступные <small>({available.length})</small></h3>
            <button type="button" className="trainer-day-action-subtle"
              disabled={!canAdd || available.length === 0}
              onClick={() => apply([...selectedIds, ...available.map(day => day.id)]
                .slice(0, CAPACITY))}>Добавить все</button>
          </div>
          <label className="trainer-day-picker-search">{kind === "step" ? "Поиск шагов" : "Поиск дней"}
            <input type="search" placeholder="Поиск по названию…" value={search}
              onChange={event => setSearch(event.target.value)} />
          </label>
          <DayDropZone id={availableDrop} zone="available" className="trainer-day-available-drop">
            <ul className="trainer-day-picker-list trainer-day-available-list"
              data-drop-zone="available">
              {found.map(day => <AvailableDay key={day.id} day={day}
                add={add} amount={count.get(day.id) ?? 0} disabled={!canAdd} kind={kind} />)}
              {!found.length && <li className="trainer-day-picker-empty">
                {available.length ? "Ничего не найдено" :
                  kind === "step" ? "Нет доступных шагов" : "Нет доступных дней"}</li>}
            </ul>
          </DayDropZone>
        </section>
        <section className="trainer-day-picker-panel" aria-label={kind === "step" ? "Шаги дня в порядке выполнения" : "Дни курса в порядке прохождения"}>
          <div className="trainer-day-picker-panel-head">
            <h3>Выбранные <small>({selectedIds.length})</small></h3>
            <button type="button" className="trainer-day-action-subtle" disabled={disabled || !selectedIds.length}
              onClick={() => apply([])}>Убрать все</button>
          </div>
          <p className="trainer-day-picker-caption">{kind === "step" ?
            "Порядок выполнения сверху вниз" : "Порядок прохождения сверху вниз"}</p>
          <DayDropZone id={selectedDrop} zone="selected"
            className={"trainer-day-picker-drop-target" +
            (overId === selectedDrop ? " trainer-day-drag-over" : "")}>
            <SortableContext items={selectedIds.map((_, i) => selectedPrefix + i)}
              strategy={verticalListSortingStrategy}>
              <ol className="trainer-day-picker-list trainer-day-selected-list"
                aria-label={kind === "step" ? "Порядок выбранных шагов" : undefined}>
                {selectedIds.map((dayId, index) => <SelectedDay
                  key={index} dayId={dayId} index={index} length={selectedIds.length}
                  title={titles[dayId] ?? dayId} disabled={disabled} kind={kind}
                  remove={i => apply(selectedIds.filter((_, at) => at !== i))}
                  move={move} />)}
                {!selectedIds.length && <li className="trainer-day-picker-empty">
                  {kind === "step" ? "Перетащите сюда тренировочный шаг или нажмите «Добавить» слева" :
                    "Перетащите сюда тренировочный день или нажмите «Добавить» слева"}
                </li>}
              </ol>
            </SortableContext>
          </DayDropZone>
        </section>
      </div>
      <DragOverlay>
        {previewTitle ? <div className="trainer-day-drag-preview">⠿ {previewTitle}</div> : null}
      </DragOverlay>
    </DndContext>
    {selectedIds.length === CAPACITY && <p role="status">Достигнут лимит: {CAPACITY}
      {kind === "step" ? " шагов в дне." : " дней в курсе."}</p>}
  </div>;
}
