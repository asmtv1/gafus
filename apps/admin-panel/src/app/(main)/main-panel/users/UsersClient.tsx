"use client";

import { useState } from "react";

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

export default function UsersClient({ users }: UsersClientProps) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);

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
      <UsersTable users={users} onEditUser={handleEditUser} onDeleteUser={handleDeleteUser} />

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

