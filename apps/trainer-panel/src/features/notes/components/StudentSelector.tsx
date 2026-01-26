"use client";

import { useState, useCallback, useRef } from "react";
import { Autocomplete, TextField, Typography, Chip, Box } from "@/utils/muiImports";
import { searchStudentsByUsername } from "@shared/lib/utils/searchStudentsByUsername";

interface StudentSelectorProps {
  selectedStudents: { id: string; username: string }[];
  onSelect: (students: { id: string; username: string }[]) => void;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
}

export default function StudentSelector({
  selectedStudents,
  onSelect,
  disabled = false,
  error = false,
  helperText,
}: StudentSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; username: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const students = await searchStudentsByUsername(query);
      // Фильтруем уже выбранных учеников
      const filtered = (students || []).filter(
        (s) => !selectedStudents.find((selected) => selected.id === s.id)
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error("Error searching students:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStudents]);

  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        handleSearch(query);
      }, 300);
    },
    [handleSearch]
  );

  const handleInputChange = (_event: unknown, value: string) => {
    setSearchQuery(value);
    if (value.length >= 2) {
      debouncedSearch(value);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelect = (
    _event: unknown,
    value: { id: string; username: string }[]
  ) => {
    onSelect(value);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleRemove = (studentId: string) => {
    onSelect(selectedStudents.filter((s) => s.id !== studentId));
  };

  return (
    <Box>
      <Autocomplete
        multiple
        freeSolo={false}
        options={searchResults}
        value={selectedStudents}
        getOptionLabel={(option) => option.username}
        loading={isLoading}
        disabled={disabled}
        onInputChange={handleInputChange}
        onChange={handleSelect}
        inputValue={searchQuery}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Выберите учеников"
            placeholder="Введите username (минимум 2 символа)"
            variant="outlined"
            error={error}
            helperText={helperText || "Можно выбрать несколько учеников"}
          />
        )}
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Typography variant="body1">{option.username}</Typography>
          </li>
        )}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={option.id}
              label={option.username}
              onDelete={disabled ? undefined : () => handleRemove(option.id)}
              variant="outlined"
              size="small"
            />
          ))
        }
        noOptionsText={
          searchQuery.length < 2 ? "Введите минимум 2 символа" : "Ученики не найдены"
        }
        isOptionEqualToValue={(option, value) => option.id === value.id}
      />
    </Box>
  );
}
