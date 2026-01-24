"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import UsersTable from "@/app/(main)/main-panel/users/UsersTable";
import EditUserForm from "@/features/users/components/EditUserForm";
import PageLayout from "@shared/components/PageLayout";
import { deleteUser } from "@/features/users/lib/deleteUser";
import { Alert, Box } from "@/utils/muiImports";

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
  _count: {
    pushSubscriptions: number;
  };
}

interface UsersClientProps {
  users: User[];
}

type SortField = "role" | "isConfirmed" | "createdAt" | "notifications" | null;
type SortDirection = "asc" | "desc";

export default function UsersClient({ users }: UsersClientProps) {
  const router = useRouter();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    // Фильтрация по нику
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((user) => user.username.toLowerCase().includes(query));
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
          case "notifications":
            aValue = a._count.pushSubscriptions > 0 ? 1 : 0;
            bValue = b._count.pushSubscriptions > 0 ? 1 : 0;
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

  const handleDeleteUser = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    const userName = user?.profile?.fullName || user?.username || "пользователя";

    if (!confirm(`Вы уверены, что хотите удалить ${userName}? Это действие нельзя отменить.`)) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("userId", userId);

        const result = await deleteUser({}, formData);

        if (result.success) {
          setMessage({
            type: "success",
            text: `✅ Пользователь ${userName} успешно удален`,
          });

          // Обновляем список пользователей
          router.refresh();
        } else {
          setMessage({
            type: "error",
            text: `❌ Ошибка: ${result.error || "Не удалось удалить пользователя"}`,
          });
        }
      } catch (error) {
        setMessage({
          type: "error",
          text: `❌ Ошибка: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`,
        });
      }
    });
  };

  return (
    <PageLayout
      title="Пользователи платформы"
      subtitle="Список всех зарегистрированных пользователей"
    >
      {message && (
        <Box sx={{ mb: 2 }}>
          <Alert severity={message.type} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        </Box>
      )}

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
