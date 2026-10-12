"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { trackEvent } from "@gafus/analytics";

import { Box, Chip, IconButton, List, ListItem, ListItemText, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";

import { deletePreventionEntry } from "@shared/lib/pet-prevention/deletePreventionEntry";

import { PreventionEntryForm } from "./PreventionEntryForm";
import { PREVENTION_TYPE_LABELS } from "../types";

import type { PreventionEntryDisplay } from "../types";

import styles from "./prevention-ui.module.css";
import { PrimaryButton } from "@/shared/components/ui";

interface PreventionEntryListProps {
  entries: PreventionEntryDisplay[];
  petId: string;
  onEntriesChanged?: () => Promise<void> | void;
}

const CHIP_CLASS: Record<string, string> = {
  VACCINATION: styles.chipVaccination,
  DEWORMING: styles.chipDeworming,
  TICKS_FLEAS: styles.chipTicks,
};

export function PreventionEntryList({
  entries,
  petId,
  onEntriesChanged,
}: PreventionEntryListProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/pets";
  const [isPending, startTransition] = useTransition();
  const [editEntry, setEditEntry] = useState<PreventionEntryDisplay | null>(
    null,
  );
  const [showAddForm, setShowAddForm] = useState(false);

  const handleFormSuccess = useCallback(() => {
    setEditEntry(null);
    setShowAddForm(false);
    void onEntriesChanged?.();
    router.refresh();
  }, [onEntriesChanged, router]);

  const handleDelete = useCallback(
    (entryId: string) => {
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "profile-prevention-delete-click",
      });
      startTransition(async () => {
        const result = await deletePreventionEntry(petId, entryId);
        if (result.success) {
          trackEvent({
            eventName: "button_click",
            platform: "web",
            pathOrScreen: pathname,
            elementId: "profile-prevention-delete-success",
          });
          setEditEntry(null);
          void onEntriesChanged?.();
          router.refresh();
        }
      });
    },
    [onEntriesChanged, pathname, petId, router, startTransition],
  );

  const handleShowAddForm = useCallback(() => {
    trackEvent({
      eventName: "button_click",
      platform: "web",
      pathOrScreen: pathname,
      elementId: "profile-prevention-add-open",
    });
    (document.activeElement as HTMLElement | null)?.blur?.();
    requestAnimationFrame(() => setShowAddForm(true));
  }, [pathname]);

  const openEditForEntry = useCallback(
    (entry: PreventionEntryDisplay) => {
      trackEvent({
        eventName: "button_click",
        platform: "web",
        pathOrScreen: pathname,
        elementId: "profile-prevention-edit-open",
      });
      (document.activeElement as HTMLElement | null)?.blur?.();
      requestAnimationFrame(() => setEditEntry(entry));
    },
    [pathname],
  );

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <>
      <Box className={styles.listWrap} sx={{ mb: 2 }}>
        <PrimaryButton
          onClick={handleShowAddForm}
          className={styles.addButton}
        >
          <AddIcon className={styles.addButtonIcon} aria-hidden="true" />
          Добавить запись
        </PrimaryButton>
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
                            {Array.isArray(entry.reminderTimes) &&
                              entry.reminderTimes.length > 0 &&
                              ` в ${(entry.reminderTimes as string[]).join(", ")}`}
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
                    onClick={() => openEditForEntry(entry)}
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
