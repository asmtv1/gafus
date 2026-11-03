import { useState, type FormEvent } from "react";
import { requestAdmin } from "./api";
import { scheduleMutationNeedsReadback } from "./scheduleMutationResolution";
import { normalizeAdminWeeklyRules } from "./consultationScheduleRules";
import {
  editableScheduleDaysMsk,
  groupEditableSlotsByMskDay,
  readableSlotMsk,
  type EditableSlot,
} from "./consultationScheduleTime";
import { formatConsultationListDateTimeMsk } from "@gafus/consultation-shared/consultation-msk-format";

type Rule = { weekday: number; startTime: string; endTime: string; isWorkingDay: boolean };
type DayOff = { id: string; date: string; reason: string | null };
type Exception = { id: string; startAtUtc: string; endAtUtc: string; reason: string | null };
type Availability = {
  rules: Rule[];
  slotDurationMin: number;
  dayOffs: DayOff[];
  exceptions: Exception[];
};
type ScheduleData = { availability: Availability; editableSlots: EditableSlot[] };
const names = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const validId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);
const asSchedule = (value: unknown): ScheduleData | null => {
  if (
    !value ||
    typeof value !== "object" ||
    !("availability" in value) ||
    !("editableSlots" in value)
  )
    return null;
  const schedule = value as ScheduleData;
  if (
    !schedule.availability ||
    !Array.isArray(schedule.availability.rules) ||
    !Array.isArray(schedule.availability.dayOffs) ||
    !Array.isArray(schedule.availability.exceptions) ||
    !Array.isArray(schedule.editableSlots)
  )
    return null;
  return schedule;
};
export function TrainerPicker({
  source,
  onSelect,
}: {
  source: unknown;
  onSelect: (trainerId: string) => void;
}) {
  if (!Array.isArray(source)) return <p role="alert">Некорректный список кинологов</p>;
  return (
    <section className="content-card">
      <h2>Выберите кинолога</h2>
      <div className="trainer-list">
        {source.map((row) => {
          if (!row || typeof row !== "object" || !validId(String(row.userId ?? ""))) return null;
          return (
            <div className="trainer-row" key={row.userId}>
              <div className="trainer-details">
                <strong>{row.fullName || row.username}</strong>
                <span>
                  @{row.username} · {row.userId}
                </span>
              </div>
              <button onClick={() => onSelect(String(row.userId))}>Открыть расписание</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ScheduleEditor({
  source,
  trainerId,
  onSaved,
}: {
  source: unknown;
  trainerId: string;
  onSaved: () => void;
}) {
  const schedule = asSchedule(source);
  // The Next editor showed exactly seven fixed weekdays. Keep one row per
  // weekday to match its UI and the Prisma uniqueness constraint.
  const [rules, setRules] = useState<Rule[]>(() =>
    normalizeAdminWeeklyRules(schedule?.availability.rules),
  );
  const [pending, setPending] = useState(false);
  const [needsReadback, setNeedsReadback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => editableScheduleDaysMsk()[0]?.date ?? "");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  if (!validId(trainerId) || !schedule)
    return <p role="alert">Расписание недоступно или неверно сформировано</p>;
  const root = `/api/v1/admin/consultations/schedules/${trainerId}`;
  const blocked = pending || needsReadback;
  const slotDays = editableScheduleDaysMsk();
  const slotsByDay = groupEditableSlotsByMskDay(schedule.editableSlots);
  const visibleSlots = slotsByDay.find((day) => day.date === selectedDay)?.slots ?? [];
  const checkedSlots = schedule.editableSlots.filter((slot) => selectedSlotIds.includes(slot.id));
  const toggleSlot = (id: string) =>
    setSelectedSlotIds((old) => {
      if (old.includes(id)) return old.filter((entry) => entry !== id);
      if (old.length >= 20) return old;
      return [...old, id];
    });
  async function blockChosenSlots() {
    if (blocked || !checkedSlots.length || checkedSlots.length !== selectedSlotIds.length) {
      return setError("Выберите свободные слоты для блокировки");
    }
    if (!window.confirm(`Сделать недоступными выбранные слоты: ${checkedSlots.length}?`)) return;
    setPending(true);
    setError(null);
    setMessage(null);
    let completed = 0;
    try {
      for (const slot of checkedSlots) {
        await requestAdmin(`${root}/exceptions`, {
          method: "POST",
          body: {
            startAt: slot.startAtUtc,
            endAt: slot.endAtUtc,
            reason: null,
          },
        });
        completed++;
      }
      setSelectedSlotIds([]);
      onSaved();
    } catch (cause) {
      // Partial success is possible when a slot was concurrently booked/blocked.
      setSelectedSlotIds(checkedSlots.slice(completed).map((slot) => slot.id));
      setNeedsReadback(true);
      setError(
        `Подтверждено ${completed} из ${checkedSlots.length} блокировок; ` +
          "результат последнего запроса может быть неизвестен. " +
          `Сначала перечитайте расписание. ${cause instanceof Error ? cause.message : "Ошибка"}`,
      );
    } finally {
      setPending(false);
    }
  }

  const update = (index: number, patch: Partial<Rule>) =>
    setRules((old) => old.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  async function perform(endpoint: string, method: "PUT" | "POST" | "DELETE", body?: unknown) {
    if (blocked) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await requestAdmin(endpoint, { method, body });
      setMessage("Изменение сохранено. Обновляем расписание.");
      onSaved();
    } catch (cause) {
      const ambiguous = scheduleMutationNeedsReadback(cause);
      if (ambiguous) setNeedsReadback(true);
      setError(
        ambiguous
          ? "Результат изменения неизвестен. Перечитайте расписание перед новой записью."
          : cause instanceof Error
            ? cause.message
            : "Ошибка сохранения",
      );
    } finally {
      setPending(false);
    }
  }
  function saveRules() {
    if (blocked) return;
    if (!rules.length) return setError("Укажите хотя бы один интервал");
    if (!window.confirm("Перестроить слоты кинолога после изменения недельного расписания?"))
      return;
    void perform(root, "PUT", { rules });
  }
  function addDayOff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blocked) return;
    const fd = new FormData(e.currentTarget);
    const date = String(fd.get("date") ?? "");
    const reason = String(fd.get("reason") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Укажите дату выходного");
    void perform(`${root}/day-offs`, "POST", { date, reason });
  }
  const deleteRow = (type: "day-offs" | "exceptions", id: string) => {
    if (blocked || !validId(id) || !window.confirm("Удалить выбранное исключение расписания?"))
      return;
    void perform(`${root}/${type}/${id}`, "DELETE");
  };
  return (
    <div className="schedule-editor">
      <p className="note">
        <a href="/consultations">← Консультации (каталог)</a>
      </p>
      <section className="content-card">
        <h2>Недельное расписание кинолога</h2>
        <p className="note">
          Длительность консультации: {schedule.availability.slotDurationMin} мин. Изменение
          расписания перестраивает будущие слоты.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>День</th>
                <th>С</th>
                <th>До</th>
                <th>Рабочий</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => (
                <tr key={index}>
                  <td>{names[rule.weekday]}</td>
                  <td>
                    <input
                      type="time"
                      value={rule.startTime}
                      onChange={(e) => update(index, { startTime: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={rule.endTime}
                      onChange={(e) => update(index, { endTime: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={rule.isWorkingDay}
                      onChange={(e) => update(index, { isWorkingDay: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="action-row">
          <button disabled={blocked} onClick={saveRules}>
            Сохранить расписание
          </button>
        </div>
      </section>
      <section className="content-card">
        <h2>Выходные</h2>
        <p className="note">Даты выходных указываются для московского расписания.</p>
        <div className="data-section">
          {schedule.availability.dayOffs.map((day) => (
            <div key={day.id} className="exception-row">
              <span>
                {day.date} · {day.reason || "Без причины"}
              </span>
              <button
                className="secondary"
                disabled={blocked}
                onClick={() => deleteRow("day-offs", day.id)}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={addDayOff} className="inline-form">
          <label>
            Дата
            <input type="date" name="date" required />
          </label>
          <label>
            Причина
            <input maxLength={500} name="reason" />
          </label>
          <button type="submit" disabled={blocked}>
            Добавить выходной
          </button>
        </form>
      </section>
      <section className="content-card">
        <h2>Исключения по времени</h2>
        {schedule.availability.exceptions.map((row) => (
          <div key={row.id} className="exception-row">
            <span>
              {formatConsultationListDateTimeMsk(row.startAtUtc)} —
              {formatConsultationListDateTimeMsk(row.endAtUtc)}. {row.reason || ""}
            </span>
            <button
              className="secondary"
              disabled={blocked}
              onClick={() => deleteRow("exceptions", row.id)}
            >
              Удалить
            </button>
          </div>
        ))}
        <p className="note">
          Исключения добавляются выбором свободных слотов в календаре ниже, как в старой панели
          Next. Местная часовая зона компьютера не влияет на результат.
        </p>
      </section>
      <section className="content-card">
        <h2>Недоступные слоты · МСК (UTC+3)</h2>
        <p className="note">
          Выберите конкретные свободные слоты на сегодня и 14 дней вперёд по московскому времени.
          Выбранные слоты станут недоступны для записи.
        </p>
        <div className="slot-day-picker" role="group" aria-label="Дни расписания МСК">
          {slotDays.map((day) => (
            <button
              type="button"
              className={selectedDay === day.date ? "" : "secondary"}
              key={day.date}
              aria-pressed={selectedDay === day.date}
              onClick={() => setSelectedDay(day.date)}
            >
              {day.label}
            </button>
          ))}
        </div>
        <div className="slot-choices" role="group" aria-label="Свободные слоты для блокировки">
          {!visibleSlots.length && <p className="empty">На этот день свободных слотов нет.</p>}
          {visibleSlots.map((slot) => (
            <button
              type="button"
              key={slot.id}
              aria-pressed={selectedSlotIds.includes(slot.id)}
              className={selectedSlotIds.includes(slot.id) ? "" : "secondary"}
              disabled={
                blocked || (selectedSlotIds.length >= 20 && !selectedSlotIds.includes(slot.id))
              }
              onClick={() => toggleSlot(slot.id)}
            >
              {readableSlotMsk(slot)}
            </button>
          ))}
        </div>
        <p className="note">Выбрано: {selectedSlotIds.length} из 20 возможных за операцию.</p>
        <button
          type="button"
          onClick={() => void blockChosenSlots()}
          disabled={blocked || !selectedSlotIds.length}
        >
          {pending ? "Блокируем слоты…" : "Сделать выбранные слоты недоступными"}
        </button>
        <h3>Свободные слоты на период: {schedule.editableSlots.length}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Дата и время МСК</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {schedule.editableSlots.map((slot) => (
                <tr key={slot.id}>
                  <td>{readableSlotMsk(slot)}</td>
                  <td>{slot.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {needsReadback && (
        <button type="button" className="secondary" disabled={pending} onClick={onSaved}>
          Сверить расписание с сервером
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </div>
  );
}
