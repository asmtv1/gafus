"use client";

import { Autocomplete, TextField, Box, Typography, Chip } from "@mui/material";
import { searchUsersByUsername } from "@shared/lib/utils/searchUsersByUsername";
import { useEffect, useState, useTransition } from "react";

import styles from "./UserSearchSelector.module.css";

import type { TrainerUser as User } from "@gafus/types";

export default function UserSearchSelector({
  selectedUsers,
  setSelectedUsers,
}: {
  selectedUsers: User[];
  setSelectedUsers: (users: User[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<User[]>([]);
  const [isPending, startTransition] = useTransition();

  const fetchUsers = async (search: string) => {
    if (!search.trim()) {
      setOptions([]);
      return;
    }
    try {
      const users = await searchUsersByUsername(search);
      setOptions(users);
    } catch {
      setOptions([]);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      startTransition(() => {
        fetchUsers(inputValue);
      });
    }, 300);

    return () => clearTimeout(handler);
  }, [inputValue]);

  const handleAddUser = (user: User | null) => {
    if (!user) return;
    if (selectedUsers.find((u) => u.id === user.id)) return;
    setSelectedUsers([...selectedUsers, user]);
  };

  const handleRemoveUser = (id: string) => {
    setSelectedUsers(selectedUsers.filter((u) => u.id !== id));
  };

  return (
    <Box>
      <Box className={styles.fieldGroup}>
        <Typography className={styles.label}>Найти пользователя по нику</Typography>
        <Autocomplete
          options={options}
          getOptionLabel={(option) => option.username}
          onInputChange={(e, newInput) => setInputValue(newInput)}
          onChange={(e, value) => handleAddUser(value)}
          filterSelectedOptions
          loading={isPending}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              fullWidth
              error={false}
              className={styles.textField}
            />
          )}
        />
      </Box>

      <Box className={styles.selectedUsersBlock}>
        <Typography className={styles.selectedUsersBlockLabel}>
          Выбранные пользователи, кому доступен курс:
        </Typography>

        {selectedUsers.length === 0 ? (
          <Typography className={styles.emptyText}>Пока никто не добавлен.</Typography>
        ) : (
          selectedUsers.map((user) => (
            <Chip
              key={user.id}
              label={user.username}
              onDelete={() => handleRemoveUser(user.id)}
              className={styles.chip}
            />
          ))
        )}
      </Box>
    </Box>
  );
}
