/** Visual migration of the pre-refactor Next header; no Next.js dependencies. */
import { useEffect, useRef, useState } from "react";
import { RouteLink, navigate, useRoutePath, type RoutePath } from "../shared/router/location";
import { useLogout } from "../shared/auth/useAuth";
import type { AuthUser } from "../shared/auth/authApi";
import styles from "./Header.module.css";
import { BackButton } from "../shared/ui";
import { BurgerIcon } from "./BurgerIcon";

const navItems: { path: RoutePath; label: string; icon: string; iconFolder?: "tab-icons" | "profile-icons" }[] = [
  { path: "/profile", label: "Профиль", icon: "profile.webp" },
  { path: "/pets", label: "Питомцы", icon: "pets.webp" },
  { path: "/courses", label: "Курсы", icon: "courses.webp" },
  { path: "/moments", label: "Моменты", icon: "feed.webp" },
  { path: "/questions", label: "Вопросы", icon: "questions.png" },
  { path: "/consultations", label: "Занятия с кинологом", icon: "cynologist.webp" },
  { path: "/chats", label: "Сообщения", icon: "chat.webp" },
  { path: "/profile/albums", label: "Фотоальбомы", icon: "albums.webp" },
  { path: "/reminders", label: "Напоминания о тренировках", icon: "reminders.webp", iconFolder: "profile-icons" },
  { path: "/articles", label: "Статьи", icon: "articles.webp" },
];

function activeMenuItem(current: RoutePath, path: RoutePath): boolean {
  if (current === path || current.startsWith(`${path}/`)) return true;
  if (path === "/moments") return current.startsWith("/feed/");
  if (path === "/courses") return current === "/" || current === "/favorites" ||
    current.startsWith("/trainings/");
  if (path === "/profile") return current === "/gafus" || current.startsWith("/gafus/") ||
    current === "/partner";
  return false;
}

/** Match Next HeaderServerWrapper: only trainer/admin/moderator sees the panel. */
export function canSeeTrainerPanel(role: AuthUser["role"] | null | undefined): boolean {
  return role === "TRAINER" || role === "ADMIN" || role === "MODERATOR";
}

export function GafusHeader({ authenticated, role, showAchievements = false }: {
  authenticated: boolean; role?: AuthUser["role"] | null; showAchievements?: boolean;
}) {
  const route = useRoutePath() ?? "/";
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  useEffect(() => { setMenuOpen(false); }, [route]);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node &&
          !menuRef.current?.contains(event.target) &&
          !burgerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); burgerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  if (!authenticated) return <header className={styles.container} role="banner"
    data-ui-parity="legacy-header">
    <RouteLink to="/courses" className={styles.backButton}>Гафус</RouteLink>
    <RouteLink to="/login" className={styles.burgerButton}>Войти</RouteLink>
  </header>;
  return <header className={styles.container} role="banner" data-ui-parity="legacy-header">
    <BackButton onClick={() => window.history.length > 1 ? window.history.back() : navigate("/courses")}>Назад</BackButton>
    <button ref={burgerRef} type="button" className={styles.burgerButton}
      aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
      aria-expanded={menuOpen} aria-controls="gafus-main-menu"
      onClick={() => setMenuOpen(open => !open)}>
      <span aria-hidden="true"><BurgerIcon active={menuOpen}/></span>
      <span className={styles.burgerLabel} aria-hidden="true">Меню</span>
    </button>
    {menuOpen && <div className={styles.overlay}
      onClick={() => setMenuOpen(false)} aria-hidden="true"/>}
      <nav id="gafus-main-menu" className={styles.dropdownMenu} ref={menuRef}
        aria-label="Разделы" hidden={!menuOpen}>
        {navItems.map(item => <RouteLink key={item.path} to={item.path}
          className={`${styles.menuButton} ${activeMenuItem(route,item.path) ? styles.menuButtonActive : ""}`}
          current={activeMenuItem(route,item.path)}>
          <span className={styles.menuIconSlot} aria-hidden="true"
            data-menu-icon={item.icon.split(".")[0]}>
            <img src={`/images/${item.iconFolder ?? "tab-icons"}/${item.icon}`}
              width={40} height={40} alt="" loading="lazy"/>
          </span>
          <span className={styles.menuLabel}>{item.label}</span>
        </RouteLink>)}
        {showAchievements && <RouteLink to="/achievements" className={styles.menuButton}>
          Достижения (макет)
        </RouteLink>}
        {canSeeTrainerPanel(role) && <a href="https://trainer-panel.gafus.ru/"
          className={styles.menuButton} onClick={() => setMenuOpen(false)}>
          <span className={styles.menuIconSlot} aria-hidden="true" data-menu-icon="trainer-panel">
            <img src="/images/profile-icons/trainer-notes.webp"
              width={40} height={40} alt="" loading="lazy"/>
          </span>
          <span className={styles.menuLabel}>Панель тренера</span>
        </a>}
        <button type="button" className={`${styles.menuButton} ${styles.logoutMenuItem}`}
          disabled={logout.isPending} onClick={() => { setMenuOpen(false); logout.mutate(); }}>
          <span className={styles.menuIconSlot} aria-hidden="true" data-menu-icon="logout">
            <img src="/images/profile-icons/logout.webp" width={40} height={40}
              alt="" loading="lazy"/>
          </span>
          <span className={styles.menuLabel}>Выход</span>
        </button>
        {logout.isError && <p role="alert">Не удалось выйти. Повторите попытку.</p>}
      </nav>
  </header>;
}
