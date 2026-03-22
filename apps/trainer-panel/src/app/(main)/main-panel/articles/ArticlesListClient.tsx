"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import FavoriteIcon from "@mui/icons-material/Favorite";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

import PageLayout from "@shared/components/PageLayout";
import { deleteArticleAction, getArticleViewersAction } from "@shared/lib/actions/articles";
import type { ArticleListDto, ArticleViewerDto } from "@gafus/types";

interface ArticlesListClientProps {
  articles: ArticleListDto[];
}

function formatViewCount(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatViewerDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ArticlesListClient({ articles }: ArticlesListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersTitle, setViewersTitle] = useState("");
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersError, setViewersError] = useState<string | null>(null);
  const [viewers, setViewers] = useState<ArticleViewerDto[]>([]);

  const handleOpenViewers = useCallback((article: ArticleListDto) => {
    setViewersTitle(article.title);
    setViewers([]);
    setViewersError(null);
    setViewersOpen(true);
    setViewersLoading(true);
    void (async () => {
      const result = await getArticleViewersAction(article.id);
      setViewersLoading(false);
      if (result.success) {
        setViewers(result.data);
      } else {
        setViewersError(result.error);
      }
    })();
  }, []);

  const handleCloseViewers = useCallback(() => {
    setViewersOpen(false);
    setViewersError(null);
    setViewers([]);
  }, []);

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Удалить статью «${title}»?`)) return;
    startTransition(async () => {
      const result = await deleteArticleAction(id);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <PageLayout title="Статьи" subtitle="Управление вашими статьями">
      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push("/main-panel/articles/new")}
        >
          Создать статью
        </Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Заголовок</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Видимость</TableCell>
              <TableCell align="center">
                <Tooltip title="Лайки">
                  <FavoriteIcon fontSize="small" />
                </Tooltip>
              </TableCell>
              <TableCell align="center">
                <Tooltip title="Все заходы на страницу статьи, в том числе без входа в аккаунт">
                  <Box
                    component="span"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                  >
                    <VisibilityOutlinedIcon fontSize="small" />
                    Просмотры
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {articles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary">Пока нет статей</Typography>
                </TableCell>
              </TableRow>
            ) : (
              articles.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.title}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {a.slug}
                    </Typography>
                  </TableCell>
                  <TableCell>{a.visibility}</TableCell>
                  <TableCell align="center">{a.likeCount}</TableCell>
                  <TableCell align="center">{formatViewCount(a.viewCount)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Кто смотрел (авторизованные)">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenViewers(a)}
                        aria-label="Кто смотрел"
                      >
                        <PeopleOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Редактировать">
                      <IconButton
                        size="small"
                        onClick={() => router.push(`/main-panel/articles/${a.id}/edit`)}
                        aria-label="Редактировать"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Удалить">
                      <IconButton
                        size="small"
                        color="error"
                        disabled={isPending}
                        onClick={() => handleDelete(a.id, a.title)}
                        aria-label="Удалить"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={viewersOpen} onClose={handleCloseViewers} fullWidth maxWidth="sm">
        <DialogTitle>Просмотры: {viewersTitle}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Список — только для пользователей, которые были в аккаунте при открытии статьи. Гостевые
            просмотры входят только в общий счётчик в таблице.
          </Typography>
          {viewersLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={32} />
            </Box>
          ) : viewersError ? (
            <Alert severity="error">{viewersError}</Alert>
          ) : viewers.length === 0 ? (
            <Typography color="text.secondary">Пока нет данных об авторизованных просмотрах</Typography>
          ) : (
            <List dense disablePadding>
              {viewers.map((v) => (
                <ListItem key={v.userId} disableGutters>
                  <ListItemText
                    primary={v.fullName || v.username}
                    secondary={
                      <>
                        {v.fullName ? `${v.username} · ` : null}
                        {formatViewerDate(v.lastViewedAt)}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseViewers}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}
