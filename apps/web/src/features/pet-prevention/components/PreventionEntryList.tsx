"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Box, Button, Chip, IconButton, List, ListItem, ListItemText, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";

import { deletePreventionEntry } from "@shared/lib/pet-prevention";

import { PreventionEntryForm } from "./PreventionEntryForm";
import { PREVENTION_TYPE_LABELS } from "../types";

import type { PreventionEntryDisplay } from "../types";

import styles from "./prevention-ui.module.css";

interface PreventionEntryListProps {
  entries: PreventionEntryDisplay[];
  petId: string;
}

const CHIP_CLASS: Record<string, string> = {
  VACCINATION: styles.chipVaccination,
  DEWORMING: styles.chipDeworming,
  TICKS_FLEAS: styles.chipTicks,
};

export function PreventionEntryList({ entries, petId }: PreventionEntryListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editEntry, setEditEntry] = useState<PreventionEntryDisplay | null>(
    null,
  );
  const [showAddForm, setShowAddForm] = useState(false);

  const handleFormSuccess = () => {
    setEditEntry(null);
    setShowAddForm(false);
    router.refresh();
  };

  const handleDelete = (entryId: string) => {
    startTransition(async () => {
      const result = await deletePreventionEntry(petId, entryId);
      if (result.success) {
        setEditEntry(null);
        router.refresh();
      }
    });
  };

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <>
      <Box className={styles.listWrap} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setShowAddForm(true)}
          className={styles.addButton}
          disableElevation
        >
          Добавить запись
        </Button>
      </Box>
      {entries.length === 0 ? (
        <p className={styles.emptyState}>Записей пока нет</p>
      ) : (
        <List disablePadding>
          {entries.map((entry) => (
            <ListItem key={entry.id} disablePadding className={styles.listItem}>
              <Box className={styles.listItemInner}>
                <Box className={styles.listItemMain}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Chip
                          label={PREVENTION_TYPE_LABELS[entry.type] ?? entry.type}
                          className={CHIP_CLASS[entry.type] ?? styles.chipTicks}
                          size="small"
                        />
                        <Typography variant="body2" className={styles.dateText}>
                          {formatDate(entry.performedAt)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <>
                        {entry.reminderEnabled && entry.remindAt && (
                          <Typography
                            variant="caption"
                            display="block"
                            className={styles.captionMuted}
                          >
                            Напоминание: {formatDate(entry.remindAt)}
                          </Typography>
                        )}
                        {entry.productName && (
                          <Typography variant="body2" component="span" className={styles.bodyPrimary}>
                            {entry.productName}
                            {entry.notes ? ". " : ""}
                          </Typography>
                        )}
                        {entry.notes && (
                          <Typography variant="body2" className={styles.bodySecondary}>
                            {entry.notes}
                          </Typography>
                        )}
                      </>
                    }
                  />
                </Box>
                <Box className={styles.listItemActions}>
                  <IconButton
                    aria-label="Редактировать"
                    onClick={() => setEditEntry(entry)}
                    disabled={isPending}
                    className={styles.iconBtn}
                    size="small"
                  >
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label="Удалить"
                    onClick={() => handleDelete(entry.id)}
                    disabled={isPending}
                    className={`${styles.iconBtn} ${styles.iconBtnDelete}`}
                    size="small"
                  >
                    <DeleteRoundedIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </ListItem>
          ))}
        </List>
      )}

      <PreventionEntryForm
        petId={petId}
        entry={editEntry}
        onSuccess={handleFormSuccess}
        onCancel={() => setEditEntry(null)}
        open={!!editEntry}
      />

      <PreventionEntryForm
        petId={petId}
        onSuccess={handleFormSuccess}
        onCancel={() => setShowAddForm(false)}
        open={showAddForm}
      />
    </>
  );
}
