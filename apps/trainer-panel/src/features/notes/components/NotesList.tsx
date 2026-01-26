"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Box,
  Typography,
  Autocomplete,
  TextField,
  Button,
  Paper,
  Chip,
} from "@/utils/muiImports";
import { Add } from "@mui/icons-material";
import type { TrainerNote, GetNotesResult } from "../types";
import NoteCard from "./NoteCard";
import NoteForm from "./NoteForm";
import { createNote, updateNote, deleteNote } from "../lib/index";
import { useRouter } from "next/navigation";

interface NotesListProps {
  initialNotes: GetNotesResult;
}

export default function NotesList({ initialNotes }: NotesListProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes.notes);
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<TrainerNote | null>(null);
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Обновляем локальное состояние когда приходят новые данные с сервера
  useEffect(() => {
    setNotes(initialNotes.notes);
  }, [initialNotes]);

  // Получаем уникальный список учеников для фильтра
  const students = useMemo(() => {
    const uniqueStudents = new Map<string, { id: string; username: string }>();
    notes.forEach((note) => {
      note.students.forEach((student) => {
        if (!uniqueStudents.has(student.id)) {
          uniqueStudents.set(student.id, {
            id: student.id,
            username: student.username,
          });
        }
      });
    });
    return Array.from(uniqueStudents.values());
  }, [notes]);

  // Получаем все уникальные теги
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    notes.forEach((note) => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach((tag) => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet).sort();
  }, [notes]);

  // Фильтрация заметок по ученику и тегам
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    // Фильтр по ученику
    if (studentFilter) {
      filtered = filtered.filter((note) =>
        note.students.some((student) => student.id === studentFilter)
      );
    }

    // Фильтр по тегам
    if (selectedTags.length > 0) {
      filtered = filtered.filter((note) => {
        if (!note.tags || !Array.isArray(note.tags) || note.tags.length === 0) {
          return false;
        }
        // Заметка должна содержать хотя бы один из выбранных тегов
        return selectedTags.some((tag) => note.tags.includes(tag));
      });
    }

    return filtered;
  }, [notes, studentFilter, selectedTags]);

  const handleCreateClick = () => {
    setEditingNote(null);
    setShowForm(true);
  };

  const handleEditClick = (note: TrainerNote) => {
    setEditingNote(note);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingNote(null);
  };

  const handleFormSubmit = async (formData: FormData) => {
    if (editingNote) {
      return await updateNote({}, formData);
    } else {
      return await createNote({}, formData);
    }
  };

  const handleDelete = async (noteId: string) => {
    const formData = new FormData();
    formData.append("id", noteId);
    const result = await deleteNote({}, formData);
    
    if (result.success) {
      // Обновляем список заметок
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      // Обновляем страницу для синхронизации с сервером
      router.refresh();
    }
    
    return result;
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingNote(null);
    // Обновляем страницу для получения новых данных
    router.refresh();
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleCreateClick}
          disabled={showForm}
        >
          Создать заметку
        </Button>
      </Box>

      {showForm && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <NoteForm
            mode={editingNote ? "edit" : "create"}
            initialData={editingNote ? {
              id: editingNote.id,
              studentIds: editingNote.students.map((s) => s.id),
              title: editingNote.title || undefined,
              entries: editingNote.entries || [],
              tags: editingNote.tags || [],
            } : undefined}
            onSubmit={async (formData) => {
              const result = await handleFormSubmit(formData);
              return result;
            }}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </Paper>
      )}

      <Box sx={{ mb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Autocomplete
          options={students}
          getOptionLabel={(option) => option.username}
          value={students.find((s) => s.id === studentFilter) || null}
          onChange={(_event, newValue) => {
            setStudentFilter(newValue?.id || null);
            // Обновляем URL для фильтрации
            const params = new URLSearchParams();
            if (newValue) {
              params.set("studentId", newValue.id);
            }
            const newUrl = params.toString() ? `?${params.toString()}` : "";
            router.push(`/main-panel/notes${newUrl}`, { scroll: false });
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Фильтр по ученику"
              placeholder="Выберите ученика"
              variant="outlined"
            />
          )}
          sx={{ minWidth: 250, flex: 1, maxWidth: 300 }}
        />
        {allTags.length > 0 && (
          <Autocomplete
            multiple
            options={allTags}
            value={selectedTags}
            onChange={(_event, newValue) => {
              setSelectedTags(newValue);
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  variant="outlined"
                  label={option}
                  size="small"
                  {...getTagProps({ index })}
                  key={option}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Фильтр по тегам"
                placeholder="Выберите теги"
                variant="outlined"
              />
            )}
            sx={{ minWidth: 250, flex: 1, maxWidth: 400 }}
          />
        )}
        {(studentFilter || selectedTags.length > 0) && (
          <Button
            variant="outlined"
            onClick={() => {
              setStudentFilter(null);
              setSelectedTags([]);
              router.push("/main-panel/notes", { scroll: false });
            }}
            sx={{ alignSelf: "flex-start" }}
          >
            Сбросить фильтры
          </Button>
        )}
      </Box>

      {filteredNotes.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body1" color="text.secondary">
            {studentFilter || selectedTags.length > 0
              ? "Нет заметок, соответствующих выбранным фильтрам"
              : "Нет заметок. Создайте первую заметку!"}
          </Typography>
        </Paper>
      ) : (
        <>
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={handleEditClick}
              onDelete={handleDelete}
            />
          ))}
        </>
      )}
    </Box>
  );
}
