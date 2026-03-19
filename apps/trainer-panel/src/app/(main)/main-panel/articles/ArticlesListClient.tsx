"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Box,
  Button,
  IconButton,
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

import PageLayout from "@shared/components/PageLayout";
import { deleteArticleAction } from "@shared/lib/actions/articles";
import type { ArticleListDto } from "@gafus/types";

interface ArticlesListClientProps {
  articles: ArticleListDto[];
}

export default function ArticlesListClient({ articles }: ArticlesListClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {articles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
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
                  <TableCell align="right">
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
    </PageLayout>
  );
}
