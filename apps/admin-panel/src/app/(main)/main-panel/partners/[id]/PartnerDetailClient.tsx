"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@/utils/muiImports";
import { markPartnerBalancePaid } from "@/features/partners/lib/partnerPayoutActions";

const money = (value: number) => `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽`;
const date = (value: string | Date | null) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

export default function PartnerDetailClient({ partner }: { partner: any }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);
  const markPaid = () => {
    if (!confirm(`Отметить выплату всего доступного баланса (${money(partner.availableRub)})?`)) return;
    startTransition(async () => {
      const result = await markPartnerBalancePaid(partner.id);
      if (!result.success) setMessage({ severity: "error", text: result.error || "Не удалось сохранить" });
      else { setMessage({ severity: "success", text: "Выплата отмечена" }); router.refresh(); }
    });
  };
  return <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}><Button component={Link} href="/main-panel/partners" variant="outlined">К списку</Button><Chip label={`${partner.referrals.length} рефералов`} /><Chip color="success" label={`Доступно ${money(partner.availableRub)}`} /><Button variant="contained" disabled={pending || partner.availableKopecks <= 0} onClick={markPaid}>{pending ? "Сохраняем…" : "Отметить весь баланс выплаченным"}</Button></Box>
    <Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h6">Сводка</Typography><Typography color="text.secondary">{partner.email || "Email не указан"} · начислено {money(partner.earnedRub)} · зарезервировано {money(partner.reservedRub)}</Typography></Paper>
    <Paper variant="outlined"><Typography sx={{ p: 2, pb: 0 }} variant="h6">История выплат</Typography><TableContainer><Table size="small"><TableHead><TableRow><TableCell>Дата</TableCell><TableCell>Сумма</TableCell><TableCell>Статус</TableCell></TableRow></TableHead><TableBody>{partner.payouts.map((row: any) => <TableRow key={row.id}><TableCell>{date(row.requestedAt)}</TableCell><TableCell>{money(row.amountKopecks / 100)}</TableCell><TableCell><Chip size="small" label={row.status === "PAID" ? "Выплачено" : row.status === "PENDING" ? "Ожидает" : "Отклонено"} /></TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
    <Paper variant="outlined"><Typography sx={{ p: 2, pb: 0 }} variant="h6">Привлечённые пользователи</Typography><TableContainer><Table size="small"><TableHead><TableRow><TableCell>ID пользователя</TableCell><TableCell>Дата</TableCell></TableRow></TableHead><TableBody>{partner.referrals.map((row: any) => <TableRow key={row.id}><TableCell>{row.buyerId}</TableCell><TableCell>{date(row.createdAt)}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Paper>
  </Box>;
}
