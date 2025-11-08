"use client";

import { useMemo, useState } from "react";

import UsersTable from "@/app/(main)/main-panel/users/UsersTable";
import EditUserForm from "@/features/users/components/EditUserForm";
import PageLayout from "@shared/components/PageLayout";

interface User {
  id: string;
  username: string;
  phone: string;
  role: string;
  isConfirmed: boolean;
  createdAt: Date;
  profile?: {
    fullName?: string | null;
    avatarUrl?: string | null;
  } | null;
}

interface UsersClientProps {
  users: User[];
}

type SortField = "role" | "isConfirmed" | "createdAt" | null;
type SortDirection = "asc" | "desc";

export default function UsersClient({ users }: UsersClientProps) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    // Фильтрация по нику
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((user) =>
        user.username.toLowerCase().includes(query)
      );
    }

    // Сортировка
    if (sortField) {
      result.sort((a, b) => {
        let aValue: string | number | boolean;
        let bValue: string | number | boolean;

        switch (sortField) {
          case "role":
            aValue = a.role;
            bValue = b.role;
            break;
          case "isConfirmed":
            aValue = a.isConfirmed ? 1 : 0;
            bValue = b.isConfirmed ? 1 : 0;
            break;
          case "createdAt":
            aValue = new Date(a.createdAt).getTime();
            bValue = new Date(b.createdAt).getTime();
            break;
          default:
            return 0;
        }

        if (aValue < bValue) {
          return sortDirection === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortDirection === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [users, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditFormOpen(true);
  };

  const handleDeleteUser = (_userId: string) => {
    if (confirm("Вы уверены, что хотите удалить этого пользователя?")) {
      // Простое удаление - в реальном приложении здесь можно добавить API вызов
      alert("Функция удаления будет реализована позже");
    }
  };

  return (
    <PageLayout 
      title="Пользователи платформы" 
      subtitle="Список всех зарегистрированных пользователей"
    >
      <UsersTable
        users={filteredAndSortedUsers}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onEditUser={handleEditUser}
        onDeleteUser={handleDeleteUser}
      />

      {editingUser && (
        <EditUserForm
          user={editingUser}
          open={isEditFormOpen}
          onClose={() => {
            setIsEditFormOpen(false);
            setEditingUser(null);
          }}
        />
      )}
    </PageLayout>
  );
}

