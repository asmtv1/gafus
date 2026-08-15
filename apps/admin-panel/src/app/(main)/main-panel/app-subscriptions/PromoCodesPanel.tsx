"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { AppSubscriptionPromoCodeAdminItem } from "@gafus/core/services/appSubscription";
import {
  archiveAppSubscriptionPromoCodeAction,
  createAppSubscriptionPromoCodeAction,
  updateAppSubscriptionPromoCodeAction,
} from "@/shared/lib/actions/appSubscriptionPromoCodeActions";

const eventLabels: Record<string, string> = {
  CREATED: "Создан",
  UPDATED: "Изменена скидка",
  ENABLED: "Включён",
  DISABLED: "Выключен",
  ARCHIVED: "Архивирован",
};

function moscowDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function PromoStatus({ promo }: { promo: AppSubscriptionPromoCodeAdminItem }) {
  if (promo.archivedAt) return <Chip size="small" label="Архив" />;
  return (
    <Chip
      size="small"
      color={promo.isActive ? "success" : "default"}
      label={promo.isActive ? "Активен" : "Выключен"}
    />
  );
}

export default function PromoCodesPanel({
  promoCodes,
  canManage,
  includeArchived,
}: {
  promoCodes: AppSubscriptionPromoCodeAdminItem[];
  canManage: boolean;
  includeArchived: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createDiscount, setCreateDiscount] = useState("10");
  const [createActive, setCreateActive] = useState(true);
  const [editTarget, setEditTarget] = useState<AppSubscriptionPromoCodeAdminItem | null>(null);
  const [editDiscount, setEditDiscount] = useState("10");
  const [editActive, setEditActive] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AppSubscriptionPromoCodeAdminItem | null>(
    null,
  );
  const [historyTarget, setHistoryTarget] = useState<AppSubscriptionPromoCodeAdminItem | null>(
    null,
  );

  const refreshAfter = (result: { success: boolean; error?: string }, close: () => void) => {
    if (!result.success) {
      setMessage({ severity: "error", text: result.error ?? "Не удалось сохранить" });
      return;
    }
    close();
    setMessage({ severity: "success", text: "Изменения сохранены" });
    router.refresh();
  };

  const openEdit = (promo: AppSubscriptionPromoCodeAdminItem) => {
    setEditTarget(promo);
    setEditDiscount(String(promo.discountPercent));
    setEditActive(promo.isActive);
  };

  const submitCreate = () => {
    startTransition(async () => {
      const result = await createAppSubscriptionPromoCodeAction({
        code: createCode,
        discountPercent: createDiscount,
        isActive: createActive,
      });
      refreshAfter(result, () => {
        setCreateOpen(false);
        setCreateCode("");
        setCreateDiscount("10");
        setCreateActive(true);
      });
    });
  };

  const submitEdit = () => {
    if (!editTarget) return;
    startTransition(async () => {
      const result = await updateAppSubscriptionPromoCodeAction({
        id: editTarget.id,
        discountPercent: editDiscount,
        isActive: editActive,
      });
      refreshAfter(result, () => setEditTarget(null));
    });
  };

  const submitArchive = () => {
    if (!archiveTarget) return;
    startTransition(async () => {
      const result = await archiveAppSubscriptionPromoCodeAction({ id: archiveTarget.id });
      refreshAfter(result, () => setArchiveTarget(null));
    });
  };

  const actionButtons = (promo: AppSubscriptionPromoCodeAdminItem) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      <Button size="small" variant="outlined" onClick={() => setHistoryTarget(promo)}>
        История
      </Button>
      {canManage && !promo.archivedAt ? (
        <>
          <Button size="small" onClick={() => openEdit(promo)}>
            Изменить
          </Button>
          <Button size="small" color="error" onClick={() => setArchiveTarget(promo)}>
            В архив
          </Button>
        </>
      ) : null}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {!canManage ? (
        <Alert severity="info">У MODERATOR доступ только для просмотра промокодов и истории.</Alert>
      ) : null}
      {message ? (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "center" },
            gap: 1.5,
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Промокоды
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Код после создания неизменяем. Даты показаны по Москве.
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={includeArchived}
                  onChange={(event) =>
                    router.replace(
                      `/main-panel/app-subscriptions?tab=promo-codes${event.target.checked ? "&includeArchived=1" : ""}`,
                    )
                  }
                />
              }
              label="Показывать архивные"
            />
            {canManage ? (
              <Button variant="contained" onClick={() => setCreateOpen(true)}>
                Создать промокод
              </Button>
            ) : null}
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ overflow: "hidden" }}>
        <TableContainer sx={{ display: { xs: "none", md: "block" }, maxHeight: 680 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Код</TableCell>
                <TableCell>Скидка</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Создан</TableCell>
                <TableCell>Последнее включение</TableCell>
                <TableCell>Последнее выключение</TableCell>
                <TableCell>Архивирован</TableCell>
                <TableCell>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {promoCodes.map((promo) => (
                <TableRow key={promo.id} hover>
                  <TableCell sx={{ maxWidth: 200, overflowWrap: "anywhere" }}>
                    <Typography variant="subtitle2">{promo.code}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      rev. {promo.revision}
                    </Typography>
                  </TableCell>
                  <TableCell>{promo.discountPercent}%</TableCell>
                  <TableCell>
                    <PromoStatus promo={promo} />
                  </TableCell>
                  <TableCell>{moscowDate(promo.createdAt)}</TableCell>
                  <TableCell>{moscowDate(promo.lastEnabledAt)}</TableCell>
                  <TableCell>{moscowDate(promo.lastDisabledAt)}</TableCell>
                  <TableCell>{moscowDate(promo.archivedAt)}</TableCell>
                  <TableCell>{actionButtons(promo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1.5, p: 2 }}>
          {promoCodes.map((promo) => (
            <Paper key={promo.id} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ overflowWrap: "anywhere" }}>
                  {promo.code}
                </Typography>
                <PromoStatus promo={promo} />
              </Box>
              <Typography variant="body2">
                Скидка: {promo.discountPercent}% · rev. {promo.revision}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Создан: {moscowDate(promo.createdAt)}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Включён: {moscowDate(promo.lastEnabledAt)} · выключен:{" "}
                {moscowDate(promo.lastDisabledAt)}
              </Typography>
              {promo.archivedAt ? (
                <Typography variant="caption" color="text.secondary" display="block">
                  Архивирован: {moscowDate(promo.archivedAt)}
                </Typography>
              ) : null}
              <Box sx={{ mt: 1 }}>{actionButtons(promo)}</Box>
            </Paper>
          ))}
        </Box>
        {promoCodes.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            Промокоды не найдены.
          </Typography>
        ) : null}
      </Paper>

      <Dialog
        open={createOpen}
        onClose={() => !isPending && setCreateOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Новый промокод</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}
        >
          <TextField
            autoFocus
            label="Код"
            value={createCode}
            onChange={(event) => setCreateCode(event.target.value)}
            inputProps={{ maxLength: 64 }}
            helperText="1–64: латинские буквы, цифры, _ или -"
          />
          <TextField
            label="Скидка, %"
            type="number"
            value={createDiscount}
            onChange={(event) => setCreateDiscount(event.target.value)}
            inputProps={{ min: 1, max: 50, step: 1 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={createActive}
                onChange={(event) => setCreateActive(event.target.checked)}
              />
            }
            label="Активен"
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={isPending} onClick={() => setCreateOpen(false)}>
            Отмена
          </Button>
          <Button disabled={isPending} variant="contained" onClick={submitCreate}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editTarget)}
        onClose={() => !isPending && setEditTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Изменить промокод</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}
        >
          <TextField label="Код" value={editTarget?.code ?? ""} disabled />
          <TextField
            label="Скидка, %"
            type="number"
            value={editDiscount}
            onChange={(event) => setEditDiscount(event.target.value)}
            inputProps={{ min: 1, max: 50, step: 1 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={editActive}
                onChange={(event) => setEditActive(event.target.checked)}
              />
            }
            label="Активен"
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={isPending} onClick={() => setEditTarget(null)}>
            Отмена
          </Button>
          <Button disabled={isPending} variant="contained" onClick={submitEdit}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(archiveTarget)} onClose={() => !isPending && setArchiveTarget(null)}>
        <DialogTitle>Архивировать промокод?</DialogTitle>
        <DialogContent>
          <Typography>
            {archiveTarget?.code}: действие необратимо из интерфейса, а код нельзя будет создать
            повторно.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={isPending} onClick={() => setArchiveTarget(null)}>
            Отмена
          </Button>
          <Button disabled={isPending} color="error" variant="contained" onClick={submitArchive}>
            Архивировать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>История: {historyTarget?.code}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {historyTarget?.events.map((event) => (
              <Paper key={event.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <Typography variant="subtitle2">
                    {eventLabels[event.type] ?? event.type}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {moscowDate(event.createdAt)}
                  </Typography>
                </Box>
                <Typography variant="body2">
                  Скидка {event.discountPercent}% · {event.isActive ? "активен" : "выключен"} · rev.{" "}
                  {event.revision}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  Администратор:{" "}
                  {event.actor?.fullName ?? event.actor?.username ?? "удалённый пользователь"}
                </Typography>
              </Paper>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryTarget(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
