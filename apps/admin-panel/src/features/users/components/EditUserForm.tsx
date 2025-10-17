"use client";


import { createAdminPanelLogger } from "@gafus/logger";
import { FormField, SelectField } from "@shared/components/ui/FormField";
import { ValidationErrors } from "@shared/components/ui/ValidationError";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Box, Button, Dialog, DialogContent, DialogTitle, Typography } from "@/utils/muiImports";

// Создаем логгер для edit-user-form
const logger = createAdminPanelLogger('edit-user-form');

interface User {
  id: string;
  username: string;
  phone: string;
  role: string;
}

interface EditUserFormProps {
  user: User;
  open: boolean;
  onClose: () => void;
}

const roleOptions = [
  { value: "USER", label: "Пользователь" },
  { value: "TRAINER", label: "Тренер" },
  { value: "MODERATOR", label: "Модератор" },
  { value: "ADMIN", label: "Администратор" },
  { value: "PREMIUM", label: "Премиум" },
];

export default function EditUserForm({ user, open, onClose }: EditUserFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [formState, setFormState] = useState<{ success?: boolean; error?: string }>({});

  const form = useForm({
    defaultValues: {
      username: user.username,
      phone: user.phone,
      role: user.role,
    },
  });

  const handleSubmit = async (data: { username: string; phone: string; role: string }) => {
    setIsPending(true);
    setFormState({});

    try {
      logger.warn("Отправляем данные:", {
        id: user.id,
        username: data.username,
        phone: data.phone,
        role: data.role,
      });

      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: data.username !== user.username ? data.username : undefined,
          phone: data.phone !== user.phone ? data.phone : undefined,
          role: data.role !== user.role ? data.role : undefined,
        }),
      });

      const result = await response.json();
      logger.warn("Результат обновления:", {
        result: result,
      });

      if (result.success) {
        setFormState({ success: true });
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1000);
      } else {
        setFormState({ error: result.error || "Неизвестная ошибка" });
      }
    } catch (error) {
      logger.error("Ошибка в handleSubmit:", error as Error);
      setFormState({
        error: `Произошла ошибка при обновлении: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Редактировать пользователя</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={form.handleSubmit(handleSubmit)} sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            ID: {user.id}
          </Typography>

          <FormField
            id="username"
            name="username"
            label="Имя пользователя"
            form={form}
            disabled={isPending}
            className="mb-2"
          />

          <FormField
            id="phone"
            name="phone"
            label="Телефон"
            form={form}
            disabled={isPending}
            className="mb-2"
          />

          <SelectField
            id="role"
            name="role"
            label="Роль"
            form={form}
            options={roleOptions}
            disabled={isPending}
            className="mb-3"
          />

          {formState.error && <ValidationErrors errors={{ error: formState.error }} />}

          {formState.success && (
            <Typography color="success.main" sx={{ mb: 2 }}>
              Пользователь успешно обновлен!
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
            <Button onClick={onClose} disabled={isPending}>
              Отмена
            </Button>
            <Button type="submit" variant="contained" disabled={isPending}>
              {isPending ? "Обновление..." : "Обновить"}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

