/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { getPartnersAdmin } from "@/features/partners/lib/getPartnersAdmin";
import PageLayout from "@/shared/components/PageLayout";
import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@/utils/muiImports";

const money = (value: number) => `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽`;

export default async function PartnersPage() {
  const partners = await getPartnersAdmin();
  return (
    <PageLayout title="Партнёрская программа" subtitle="Партнёры, привлечённые пользователи и выплаты">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {!partners.length ? <Alert severity="info">Партнёров пока нет. Назначьте пользователю роль «Партнёр» в разделе пользователей.</Alert> : null}
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <TableContainer>
            <Table>
              <TableHead><TableRow><TableCell>Партнёр</TableCell><TableCell>Код</TableCell><TableCell>Рефералы</TableCell><TableCell>Доступно</TableCell><TableCell>Статус</TableCell><TableCell align="right">Действие</TableCell></TableRow></TableHead>
              <TableBody>{partners.map((partner: any) => <TableRow hover key={partner.id}>
                <TableCell><Typography fontWeight={600}>{partner.fullName || partner.username}</Typography><Typography variant="caption" color="text.secondary">{partner.email || "Email не указан"}</Typography></TableCell>
                <TableCell><Typography component="code">{partner.referralCode}</Typography></TableCell>
                <TableCell>{partner.referrals}</TableCell>
                <TableCell><Typography fontWeight={700}>{money(partner.availableRub)}</Typography><Typography variant="caption" color="text.secondary">Всего: {money(partner.earnedRub)}</Typography></TableCell>
                <TableCell><Chip size="small" color={partner.isActive ? "success" : "default"} label={partner.isActive ? "Активен" : "Выключен"} /></TableCell>
                <TableCell align="right"><Button component={Link} href={`/main-panel/partners/${partner.id}`} size="small" variant="outlined">Открыть</Button></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </PageLayout>
  );
}
