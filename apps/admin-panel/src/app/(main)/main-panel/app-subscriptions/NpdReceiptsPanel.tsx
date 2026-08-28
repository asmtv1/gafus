"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { NpdAdminPage } from "@gafus/core/services/appSubscription";
import { reconcileNpdReceiptAction, retryNpdReceiptAction } from "@/shared/lib/actions/npdAdminActions";

const labels: Record<string, string> = { PENDING: "Ожидает", ISSUED: "Выдан", CANCEL_PENDING: "Отмена ожидает", CANCELED: "Отменён", RECONCILIATION_REQUIRED: "Нужна сверка", FAILED: "Ошибка" };
function date(value: string | null) { return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date(value)) : "—"; }

export default function NpdReceiptsPanel({ data, role, status, search, from, to }: { data: NpdAdminPage; role: "ADMIN" | "MODERATOR"; status: string; search: string; from: string; to: string }) {
  const router = useRouter(); const [query, setQuery] = useState(search); const [busy, setBusy] = useState<string | null>(null);
  const navigate = (changes: Record<string, string | number>) => { const p = new URLSearchParams({ tab: "npd", npdPage: String(changes.page ?? data.page), npdPageSize: String(changes.pageSize ?? data.pageSize) }); const values = { status, search, from, to, ...changes }; for (const [key, value] of [["npdStatus", values.status], ["npdSearch", values.search], ["npdFrom", values.from], ["npdTo", values.to]]) if (value) p.set(key, String(value)); router.replace(`/main-panel/app-subscriptions?${p}`); };
  const submit = (event: FormEvent) => { event.preventDefault(); navigate({ search: query.trim(), page: 1 }); };
  const act = async (id: string, kind: "retry" | "reconcile") => { setBusy(id); try { const result = kind === "retry" ? await retryNpdReceiptAction(id) : await reconcileNpdReceiptAction(id); if (!result.ok) window.alert(result.code === "FORBIDDEN" ? "Недостаточно прав" : "Операция недоступна"); else router.refresh(); } finally { setBusy(null); } };
  return <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Chip label={`В очереди: ${data.backlog}`} /><Chip label={`Подключение: ${data.connection?.status ?? "не настроено"}`} /><Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>Старт: {date(data.connection?.fiscalizationStartedAt ?? null)} · Последний успех: {date(data.connection?.lastSuccessfulOperationAt ?? null)}</Typography></Box>
    {data.connection?.lastErrorRedacted ? <Typography color="error" variant="body2">Последняя ошибка: {data.connection.lastErrorRedacted}</Typography> : null}
    <Paper sx={{ width: "100%", overflow: "hidden" }}><Box component="form" onSubmit={submit} sx={{ p: 2, display: "flex", gap: 1, flexWrap: "wrap" }}><TextField label="Платёж или пользователь" value={query} onChange={e => setQuery(e.target.value)} inputProps={{ maxLength: 128 }} /><TextField label="Дата от" type="date" value={from} onChange={e => navigate({ from: e.target.value, page: 1 })} InputLabelProps={{ shrink: true }} /><TextField label="Дата до" type="date" value={to} onChange={e => navigate({ to: e.target.value, page: 1 })} InputLabelProps={{ shrink: true }} /><Button type="submit" variant="contained">Найти</Button></Box>
      <TableContainer sx={{ display: { xs: "none", md: "block" }, maxHeight: 680 }}><Table stickyHeader><TableHead><TableRow>{["Платёж", "Пользователь", "Тариф / сумма", "Состояние", "Email", "Повтор / чек", "Дата"].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{data.items.map(item => <TableRow key={item.id} hover><TableCell sx={{ maxWidth: 180, overflowWrap: "anywhere" }}>{item.paymentId}</TableCell><TableCell>{item.user.fullName ?? item.user.username}<Typography variant="caption" display="block" color="text.secondary">@{item.user.username}</Typography></TableCell><TableCell>{item.planCode}<Typography variant="body2">{item.amountRub.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} {item.currency}</Typography></TableCell><TableCell><Chip size="small" label={labels[item.status] ?? item.status} />{item.lastErrorRedacted ? <Typography variant="caption" color="error" display="block">{item.lastErrorRedacted}</Typography> : null}</TableCell><TableCell>{item.emailDelivery ?? "—"}</TableCell><TableCell>{item.printUrl ? <Button size="small" href={item.printUrl} target="_blank" rel="noreferrer">Открыть</Button> : null}{role === "ADMIN" && item.status === "RECONCILIATION_REQUIRED" ? <Button size="small" disabled={busy === item.id} onClick={() => act(item.id, "reconcile")}>Сверка</Button> : role === "ADMIN" && ["FAILED"].includes(item.status) ? <Button size="small" disabled={busy === item.id} onClick={() => act(item.id, "retry")}>Повторить</Button> : null}<Typography variant="caption" display="block">{date(item.retryAt)}</Typography></TableCell><TableCell>{date(item.operationAt)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
      {data.items.length === 0 ? <Typography sx={{ p: 2 }} color="text.secondary">Чеки не найдены.</Typography> : null}<TablePagination component="div" count={data.total} page={data.page - 1} rowsPerPage={data.pageSize} rowsPerPageOptions={[10, 25, 50, 100]} onPageChange={(_, p) => navigate({ page: p + 1 })} onRowsPerPageChange={e => navigate({ pageSize: Number(e.target.value), page: 1 })} labelRowsPerPage="Строк на странице:" /></Paper>
  </Box>;
}
