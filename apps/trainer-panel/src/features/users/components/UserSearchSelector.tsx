"use client";

import { useState } from "react";
import { Autocomplete, Box, Chip, TextField, Typography } from "../../../utils/muiImports";
import { searchUsersByUsername } from "@shared/lib/utils/searchUsersByUsername";

interface UserSearchSelectorProps {
  selectedUsers: { id: string; username: string }[];
  setSelectedUsers: (users: { id: string; username: string }[]) => void;
}

export default function UserSearchSelector({
  selectedUsers,
  setSelectedUsers,
}: UserSearchSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; username: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const users = await searchUsersByUsername(query);
      setSearchResults(users || []);
    } catch (error) {
      console.error("Error searching users:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (_event: unknown, value: { id: string; username: string } | null) => {
    if (value && !selectedUsers.find((u) => u.id === value.id)) {
      setSelectedUsers([...selectedUsers, value]);
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const handleRemove = (userId: string) => {
    setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
  };

  return (
    <Box>
      <Autocomplete
        options={searchResults}
        getOptionLabel={(option) => option.username}
        loading={isLoading}
        onInputChange={(_event, value) => {
          setSearchQuery(value);
          handleSearch(value);
        }}
        onChange={handleSelect}
        inputValue={searchQuery}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Поиск пользователей"
            placeholder="Введите username"
            variant="outlined"
          />
        )}
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Typography variant="body1">{option.username}</Typography>
          </li>
        )}
        noOptionsText={searchQuery.length < 2 ? "Введите минимум 2 символа" : "Пользователи не найдены"}
      />

      {selectedUsers.length > 0 && (
        <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 1 }}>
          {selectedUsers.map((user) => (
            <Chip
              key={user.id}
              label={user.username}
              onDelete={() => handleRemove(user.id)}
              color="primary"
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

