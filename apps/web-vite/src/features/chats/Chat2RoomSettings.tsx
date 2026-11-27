import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chat2Api, type Chat2Conversation, type Chat2Member } from "./chat2Api";
import { Chat2ReportQueue } from "./Chat2ReportQueue";
import css from "./Chat2Messenger.module.css";
import { errorText, chat2ImageUrl, kindEmoji } from "./chat2Presentation";
/** Shared accessible avatar picker: the actual file input stays keyboard focusable but invisible. */
export function Chat2GroupAvatarEditor({
  src,
  onSelect,
  onRemove,
  onInvalid,
  disabled = false,
}: {
  src: string | null;
  onSelect: (file: File) => void;
  onRemove?: () => void;
  onInvalid: (message: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={css.avatarEditor}>
      <label className={css.avatarPicker}>
        <input
          className={css.avatarFileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={src ? "Заменить аватарку группы" : "Добавить аватарку группы"}
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
              file.size < 10 ||
              file.size > 5 * 1024 * 1024
            ) {
              onInvalid("Аватарка: JPG, PNG или WebP до 5 МБ");
              return;
            }
            onSelect(file);
          }}
        />
        <span className={css.avatarPreview} aria-hidden="true">
          {src ? <img src={src} alt="" /> : "👥"}
          <span className={css.avatarCamera}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h4l2-2h4l2 2h4v12H4V7Z" />
              <circle cx="12" cy="13" r="3.25" />
            </svg>
          </span>
        </span>
        <span className={css.avatarCopy}>
          <strong>Фото группы</strong>
          <span>{src ? "Заменить фотографию" : "Добавить фотографию"}</span>
          <small>Необязательно · JPG, PNG, WebP · до 5 МБ</small>
        </span>
      </label>
      {onRemove && (
        <button type="button" className={css.avatarRemove} disabled={disabled} onClick={onRemove}>
          Удалить фото
        </button>
      )}
    </div>
  );
}


export function Chat2RoomSettings({
  id,
  me,
  info,
  onRefresh,
  onExit,
}: {
  id: string;
  me: string;
  info: Chat2Conversation;
  onRefresh: () => void;
  onExit: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(info.name ?? ""),
    [description, setDescription] = useState(info.description ?? "");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE" | "UNLISTED">(info.visibility);
  const [search, setSearch] = useState("");
  const [silenced, setSilenced] = useState(info.muted ?? false);
  const [settings, setSettings] = useState(false);
  const cache = useQueryClient();
  const people = useQuery({
    queryKey: ["chat2", "invite", id, search],
    queryFn: () => chat2Api.users(search.trim()),
    enabled: search.trim().length >= 2,
    retry: false,
  });
  const room = useQuery({
    queryKey: ["chat2", "settings", id],
    queryFn: () => chat2Api.detail(id),
    retry: false,
  });
  const actual = room.data ?? info;
  const own = actual.role === "OWNER",
    moderator = own || actual.role === "ADMIN";
  const group = ["GROUP", "CITY", "BREED", "COURSE_TOPIC"].includes(actual.kind);
  async function act(run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run();
      await room.refetch();
      onRefresh();
      await cache.invalidateQueries({ queryKey: ["chat2", "list", me] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const safeChange = (person: Chat2Member, action: "BAN" | "KICK" | "PROMOTE" | "DEMOTE") => {
    if (
      !window.confirm(
        `${action === "BAN" ? "Заблокировать" : action === "KICK" ? "Удалить" : action === "PROMOTE" ? "Назначить администратором" : "Снять права администратора"} ${person.username}?`,
      )
    )
      return;
    void act(() => chat2Api.moderate(id, person.userId, action));
  };
  return (
    <section className={css.settings} aria-label="Настройки переписки">
      <h3>{actual.name ?? "Информация о чате"}</h3>
      {group &&
        (moderator ? (
          <Chat2GroupAvatarEditor
            src={chat2ImageUrl(actual.avatarUrl ?? null)}
            onSelect={(file) => void act(() => chat2Api.setAvatar(id, file))}
            onInvalid={setError}
            onRemove={
              actual.avatarUrl
                ? () => {
                    if (window.confirm("Удалить аватарку группы?"))
                      void act(() => chat2Api.removeAvatar(id));
                  }
                : undefined
            }
            disabled={busy}
          />
        ) : (
          <div className={css.avatarEditor}>
            <span className={css.avatarPreview}>
              {chat2ImageUrl(actual.avatarUrl ?? null) ? (
                <img src={chat2ImageUrl(actual.avatarUrl ?? null)!} alt="Аватарка группы" />
              ) : (
                kindEmoji[actual.kind]
              )}
            </span>
          </div>
        ))}
      {actual.description && <p>{actual.description}</p>}
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
      <div className={css.settingsActions}>
        <button
          type="button"
          onClick={() =>
            void act(async () => {
              await chat2Api.mute(id, !silenced);
              setSilenced(!silenced);
            })
          }
          disabled={busy}
        >
          {silenced ? "Включить уведомления" : "Отключить уведомления"}
        </button>
        {actual.kind !== "DIRECT" && actual.kind !== "CYNOLOGIST" && actual.role !== "OWNER" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Выйти из чата?"))
                void act(async () => {
                  await chat2Api.leave(id);
                  onExit();
                });
            }}
          >
            Выйти из чата
          </button>
        )}
        {group && moderator && (
          <button type="button" onClick={() => setSettings(!settings)}>
            {settings ? "Закрыть настройки" : "Настроить группу"}
          </button>
        )}
      </div>
      {settings && group && moderator && (
        <form
          className={css.roomEdit}
          onSubmit={(e) => {
            e.preventDefault();
            void act(() =>
              chat2Api.updateGroup(id, {
                name: name.trim(),
                description: description.trim(),
                visibility,
              }),
            );
          }}
        >
          <label>
            Название
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            Описание
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label>
            Видимость
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            >
              <option value="PUBLIC">Открытая</option>
              <option value="PRIVATE">По приглашению</option>
              <option value="UNLISTED">По ссылке или приглашению</option>
            </select>
          </label>
          <button type="submit" disabled={busy || name.trim().length < 2}>
            Сохранить
          </button>
        </form>
      )}
      {moderator &&
        ["GROUP", "CITY", "BREED", "COURSE_TOPIC", "COMMUNITY", "COURSE"].includes(actual.kind) && (
          <Chat2ReportQueue id={id} visible={moderator} />
        )}
      <h4>Участники · {actual.members.length}</h4>
      <div className={css.settingMembers}>
        {actual.members.map((member) => (
          <div className={css.settingMember} key={member.userId}>
            <span>
              👤 {member.username} {member.userId === me ? "(вы)" : ""}
            </span>
            <small>
              {member.role === "OWNER"
                ? "Владелец"
                : member.role === "ADMIN"
                  ? "Админ"
                  : "Участник"}
            </small>
            {group && moderator && member.userId !== me && member.role !== "OWNER" && (
              <div className={css.memberActions}>
                {own && member.role === "MEMBER" && (
                  <button type="button" onClick={() => safeChange(member, "PROMOTE")}>
                    Админ
                  </button>
                )}
                {own && member.role === "ADMIN" && (
                  <button type="button" onClick={() => safeChange(member, "DEMOTE")}>
                    Снять
                  </button>
                )}
                <button type="button" onClick={() => safeChange(member, "KICK")}>
                  Исключить
                </button>
                <button type="button" onClick={() => safeChange(member, "BAN")}>
                  Блокировать
                </button>
                {own && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Передать владельца группы?"))
                        void act(() => chat2Api.transfer(id, member.userId));
                    }}
                  >
                    Передать группу
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {group && moderator && (
        <div className={css.roomEdit}>
          <h4>Пригласить</h4>
          <label>
            Поиск пользователя
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Имя пользователя"
            />
          </label>
          {(people.data ?? [])
            .filter((p) => !actual.members.some((m) => m.userId === p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => void act(() => chat2Api.invite(id, p.id))}
              >
                ＋ {p.username}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
