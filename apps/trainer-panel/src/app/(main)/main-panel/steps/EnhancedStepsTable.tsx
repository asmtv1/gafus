"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import SearchIcon from "@mui/icons-material/Search";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Card,
  CardContent,
  CardActions,
  Chip,
  Stack,
  Divider,
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";

import type { TrainerStepTableRow as Step } from "@gafus/types";

type Order = "asc" | "desc";

// Step тип теперь импортируется из @gafus/types

const baseHeadCells = [
  { id: "title", label: "Название", numeric: false },
  { id: "description", label: "Описание", numeric: false },
  { id: "createdAt", label: "Дата создания", numeric: false },
  { id: "durationSec", label: "Длительность (сек)", numeric: true },
  { id: "estimatedDurationSec", label: "Оценка (сек)", numeric: true },
  { id: "days", label: "Дни", numeric: false },
  { id: "courses", label: "Курсы", numeric: false },
  { id: "actions", label: "Действия", numeric: false },
] as const;

type HeadCellId = (typeof baseHeadCells)[number]["id"] | "author";

const STORAGE_KEY_ROWS_PER_PAGE = "stepsTable_rowsPerPage";
const STORAGE_KEY_ORDER_BY = "stepsTable_orderBy";
const STORAGE_KEY_ORDER = "stepsTable_order";

interface EnhancedStepsTableProps {
  steps: Step[];
  onEditStep?: (id: string) => void;
  onDeleteSteps?: (ids: string[]) => void;
  onCreateDayFromSteps?: (stepIds: string[]) => void;
  isAdmin?: boolean;
  initialSearchParams?: {
    search?: string;
    orderBy?: string;
    order?: string;
    page?: string;
    rowsPerPage?: string;
    onlyOrphanSteps?: string;
  };
}

function formatCreatedAt(createdAt: Date | undefined): string {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function EnhancedStepsTable({
  steps,
  onEditStep,
  onDeleteSteps,
  onCreateDayFromSteps,
  isAdmin = false,
  initialSearchParams,
}: EnhancedStepsTableProps) {
  const router = useRouter();
  const pathname = usePathname();

  const headCells = React.useMemo(() => {
    if (isAdmin) {
      // Вставляем колонку "Автор" перед "Действия"
      const authorCell = { id: "author" as const, label: "Автор", numeric: false as const };
      return [...baseHeadCells.slice(0, -1), authorCell, baseHeadCells[baseHeadCells.length - 1]];
    }
    return baseHeadCells;
  }, [isAdmin]);

  // Инициализация состояния из URL или localStorage
  const getInitialOrder = (): Order => {
    if (
      initialSearchParams?.order &&
      (initialSearchParams.order === "asc" || initialSearchParams.order === "desc")
    ) {
      return initialSearchParams.order;
    }
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_ORDER) : null;
    return (saved === "asc" || saved === "desc" ? saved : "asc") as Order;
  };

  const getInitialOrderBy = (): HeadCellId => {
    if (initialSearchParams?.orderBy) {
      const validOrderBy =
        baseHeadCells.find((cell) => cell.id === initialSearchParams.orderBy)?.id || "author";
      if (initialSearchParams.orderBy === "author" || validOrderBy) {
        return initialSearchParams.orderBy as HeadCellId;
      }
    }
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_ORDER_BY) : null;
    return (saved as HeadCellId) || "durationSec";
  };

  const getInitialRowsPerPage = (): number => {
    if (initialSearchParams?.rowsPerPage) {
      const parsed = parseInt(initialSearchParams.rowsPerPage, 10);
      if ([5, 10, 25].includes(parsed)) return parsed;
    }
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_ROWS_PER_PAGE) : null;
    if (saved) {
      const parsed = parseInt(saved, 10);
      if ([5, 10, 25].includes(parsed)) return parsed;
    }
    return 5;
  };

  const getInitialPage = (): number => {
    if (initialSearchParams?.page) {
      const parsed = parseInt(initialSearchParams.page, 10);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    return 0;
  };

  const getInitialSearch = (): string => {
    return initialSearchParams?.search || "";
  };

  const getInitialOnlyOrphanSteps = (): boolean => {
    const v = initialSearchParams?.onlyOrphanSteps;
    return v === "1" || v === "true";
  };

  const [order, setOrder] = React.useState<Order>(getInitialOrder());
  const [orderBy, setOrderBy] = React.useState<HeadCellId>(getInitialOrderBy());
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [page, setPage] = React.useState(getInitialPage());
  const [dense, setDense] = React.useState(false);
  const [rowsPerPage, setRowsPerPage] = React.useState(getInitialRowsPerPage());
  const [searchQuery, setSearchQuery] = React.useState(getInitialSearch());
  const [onlyOrphanSteps, setOnlyOrphanSteps] = React.useState(getInitialOnlyOrphanSteps());

  // Функция для обновления URL с текущими параметрами
  const updateURL = React.useCallback(
    (updates: {
      search?: string;
      orderBy?: HeadCellId;
      order?: Order;
      page?: number;
      rowsPerPage?: number;
      onlyOrphanSteps?: boolean;
    }) => {
      const params = new URLSearchParams();

      const currentSearch = updates.search !== undefined ? updates.search : searchQuery;
      const currentOrderBy = updates.orderBy !== undefined ? updates.orderBy : orderBy;
      const currentOrder = updates.order !== undefined ? updates.order : order;
      const currentPage = updates.page !== undefined ? updates.page : page;
      const currentRowsPerPage =
        updates.rowsPerPage !== undefined ? updates.rowsPerPage : rowsPerPage;
      const currentOnlyOrphan =
        updates.onlyOrphanSteps !== undefined ? updates.onlyOrphanSteps : onlyOrphanSteps;

      if (currentSearch) params.set("search", currentSearch);
      if (currentOrderBy) params.set("orderBy", currentOrderBy);
      if (currentOrder) params.set("order", currentOrder);
      if (currentPage > 0) params.set("page", currentPage.toString());
      if (currentRowsPerPage) params.set("rowsPerPage", currentRowsPerPage.toString());
      if (currentOnlyOrphan) params.set("onlyOrphanSteps", "1");

      const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [router, pathname, searchQuery, orderBy, order, page, rowsPerPage, onlyOrphanSteps],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSteps = React.useMemo(() => {
    let result = steps;
    if (onlyOrphanSteps) {
      result = result.filter((step) => !step.stepLinks?.length);
    }
    if (!normalizedQuery) return result;
    return result.filter((step) => {
      const matchesTitle = (step.title || "").toLowerCase().includes(normalizedQuery);
      const matchesDayTitle =
        step.stepLinks?.some((link) =>
          (link.day.title || "").toLowerCase().includes(normalizedQuery),
        ) ?? false;
      return matchesTitle || matchesDayTitle;
    });
  }, [steps, normalizedQuery, onlyOrphanSteps]);
  const filteredStepIds = React.useMemo(
    () => new Set(filteredSteps.map((step) => step.id)),
    [filteredSteps],
  );

  React.useEffect(() => {
    setSelected((prev) => prev.filter((id) => filteredStepIds.has(id)));
  }, [filteredStepIds]);

  // Синхронизация поиска с URL (с debounce) и сброс страницы
  // Используем useRef для отслеживания предыдущего значения поиска
  const prevSearchQueryRef = React.useRef(searchQuery);
  React.useEffect(() => {
    // Сбрасываем страницу только если поиск действительно изменился
    const searchChanged = prevSearchQueryRef.current !== searchQuery;
    prevSearchQueryRef.current = searchQuery;

    const timeoutId = setTimeout(() => {
      if (searchChanged) {
        setPage(0);
        // Обновляем URL напрямую, не через updateURL, чтобы избежать конфликтов
        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (orderBy) params.set("orderBy", orderBy);
        if (order) params.set("order", order);
        // page = 0, не добавляем в URL
        if (rowsPerPage) params.set("rowsPerPage", rowsPerPage.toString());
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.push(newUrl, { scroll: false });
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, router, pathname, orderBy, order, rowsPerPage]);

  // Синхронизация сортировки с URL и localStorage
  React.useEffect(() => {
    updateURL({ orderBy, order });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ORDER_BY, orderBy);
      localStorage.setItem(STORAGE_KEY_ORDER, order);
    }
  }, [orderBy, order, updateURL]);

  // Синхронизация пагинации с URL - убрана, обновляется напрямую в handleChangePage

  // Синхронизация rowsPerPage с URL и localStorage
  React.useEffect(() => {
    updateURL({ rowsPerPage });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ROWS_PER_PAGE, rowsPerPage.toString());
    }
  }, [rowsPerPage, updateURL]);

  const handleRequestSort = (_: React.MouseEvent<unknown>, property: HeadCellId) => {
    const newOrder = orderBy === property && order === "asc" ? "desc" : "asc";
    setOrder(newOrder);
    setOrderBy(property);
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(event.target.checked ? filteredSteps.map((step) => step.id) : []);
  };

  const handleClick = (_: React.MouseEvent<unknown>, id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
    // Обновляем URL сразу при изменении страницы
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (orderBy) params.set("orderBy", orderBy);
    if (order) params.set("order", order);
    if (newPage > 0) params.set("page", newPage.toString());
    if (rowsPerPage) params.set("rowsPerPage", rowsPerPage.toString());
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(newUrl, { scroll: false });
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    // Обновляем URL сразу при изменении rowsPerPage
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (orderBy) params.set("orderBy", orderBy);
    if (order) params.set("order", order);
    // page = 0, не добавляем в URL
    params.set("rowsPerPage", newRowsPerPage.toString());
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(newUrl, { scroll: false });
  };

  const comparator = React.useCallback(
    (a: Step, b: Step) => {
      const getValue = (step: Step): string => {
        if (orderBy === "days") {
          return (
            Array.from(new Set(step.stepLinks.map((s) => s.day.title)))
              .sort()
              .join(", ") || ""
          );
        }
        if (orderBy === "courses") {
          return (
            step.stepLinks
              .flatMap((s) => s.day.dayLinks)
              .map((d) => d.course.name)
              .sort()
              .join(", ") || ""
          );
        }
        if (orderBy === "author") {
          if (!step.author) return "";
          return (step.author.fullName || step.author.username || "").toLowerCase();
        }
        if (orderBy === "createdAt") {
          const d = (step as Step & { createdAt?: Date }).createdAt;
          return d ? new Date(d).toISOString() : "";
        }

        // Безопасный доступ к свойствам Step
        const value = step[orderBy as keyof Step];
        return typeof value === "number" ? value.toString() : String(value || "");
      };

      const aValue = getValue(a);
      const bValue = getValue(b);
      return order === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    },
    [order, orderBy],
  );

  const visibleRows = React.useMemo(() => {
    const sorted = [...filteredSteps].sort(comparator);
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [filteredSteps, page, rowsPerPage, comparator]);

  const renderCourseNames = (step: Step) => {
    const courseNames = Array.from(
      new Set(step.stepLinks.flatMap((link) => link.day.dayLinks.map((d) => d.course.name))),
    );
    return courseNames.length ? courseNames.join(", ") : "—";
  };

  const renderDayNames = (step: Step) => {
    const dayNames = Array.from(new Set(step.stepLinks.map((link) => link.day.title)));
    return dayNames.length ? dayNames.join(", ") : "—";
  };

  const renderAuthorName = (step: Step) => {
    if (!step.author) return "—";
    return step.author.fullName || step.author.username;
  };

  // Определяем мобильный режим
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <Box sx={{ width: "100%" }}>
      <Paper sx={{ width: "100%", mb: 2, borderRadius: { xs: 2, md: 3 } }}>
        <Toolbar
          sx={{
            pl: { xs: 1, sm: 2 },
            pr: { xs: 1, sm: 1 },
            minHeight: { xs: 56, sm: 64 },
            ...(selected.length > 0 && {
              bgcolor: (theme) => theme.palette.action.selected,
            }),
          }}
        >
          <Typography
            sx={{
              flex: "1 1 100%",
              fontSize: { xs: "1rem", sm: "1.25rem" },
            }}
            color={selected.length > 0 ? "inherit" : "text.primary"}
            variant="h6"
          >
            {selected.length > 0 ? `${selected.length} выбрано` : "Шаги тренинга"}
          </Typography>
          {selected.length > 0 && onCreateDayFromSteps && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => onCreateDayFromSteps([...selected])}
              sx={{ mr: 1 }}
            >
              Создать день из выбранных шагов
            </Button>
          )}
          <Tooltip title={selected.length > 0 ? "Удалить" : "Фильтр"}>
            <IconButton
              onClick={() => {
                if (selected.length > 0) {
                  onDeleteSteps?.([...selected]);
                  setSelected([]);
                }
              }}
              disabled={selected.length === 0}
              sx={{
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                minWidth: "44px",
                minHeight: "44px",
              }}
            >
              {selected.length > 0 ? <DeleteIcon /> : <FilterListIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
        <Box sx={{ px: { xs: 2, sm: 2 }, pb: 1 }}>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 2,
            }}
          >
            <TextField
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              size="small"
              placeholder="Поиск по названию шага или дня"
              sx={{ flex: "1 1 200px", minWidth: 0 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={onlyOrphanSteps}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOnlyOrphanSteps(checked);
                    setPage(0);
                    updateURL({ onlyOrphanSteps: checked, page: 0 });
                  }}
                  size="small"
                />
              }
              label="Шаги вне дней"
              sx={{ flexShrink: 0 }}
            />
          </Box>
        </Box>

        {/* Мобильное представление - карточки */}
        {isMobile ? (
          <Box sx={{ p: 2 }}>
            <Stack spacing={2}>
              {visibleRows.map((row) => {
                const isItemSelected = selected.includes(row.id);
                return (
                  <Card
                    key={row.id}
                    sx={{
                      bgcolor: isItemSelected ? "action.selected" : "background.paper",
                      position: "relative",
                    }}
                  >
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
                        <Checkbox
                          size="small"
                          checked={isItemSelected}
                          onClick={(e) => handleClick(e, row.id)}
                          sx={{ mt: -0.5 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="h6"
                            sx={{ fontSize: "1rem", fontWeight: 600, mb: 0.5 }}
                          >
                            {row.title}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              fontSize: "0.875rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {row.description}
                          </Typography>
                        </Box>
                      </Box>

                      <Divider sx={{ my: 1.5 }} />

                      <Stack spacing={1}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Дата создания:
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: "0.875rem" }}>
                            {formatCreatedAt((row as Step & { createdAt?: Date }).createdAt)}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Длительность:
                          </Typography>
                          <Chip
                            label={`${row.durationSec} сек`}
                            size="small"
                            sx={{ height: "20px", fontSize: "0.75rem" }}
                          />
                        </Box>

                        {renderDayNames(row) !== "—" && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Дни:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: "0.875rem", mt: 0.25 }}>
                              {renderDayNames(row)}
                            </Typography>
                          </Box>
                        )}

                        {renderCourseNames(row) !== "—" && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Курсы:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: "0.875rem", mt: 0.25 }}>
                              {renderCourseNames(row)}
                            </Typography>
                          </Box>
                        )}

                        {isAdmin && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Автор:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: "0.875rem", mt: 0.25 }}>
                              {renderAuthorName(row)}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </CardContent>

                    <CardActions sx={{ justifyContent: "flex-end", pt: 0 }}>
                      <IconButton
                        size="small"
                        onClick={() => onEditStep?.(row.id)}
                        sx={{
                          color: "primary.main",
                          WebkitTapHighlightColor: "transparent",
                          touchAction: "manipulation",
                          minWidth: "44px",
                          minHeight: "44px",
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </CardActions>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        ) : (
          /* Десктопное представление - таблица */
          <TableContainer>
            <Table size={dense ? "small" : "medium"}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      color="primary"
                      checked={filteredSteps.length > 0 && selected.length === filteredSteps.length}
                      indeterminate={selected.length > 0 && selected.length < filteredSteps.length}
                      onChange={handleSelectAllClick}
                    />
                  </TableCell>
                  {headCells.map(({ id, label, numeric }) => (
                    <TableCell
                      key={id}
                      align={numeric ? "right" : "left"}
                      sortDirection={orderBy === id ? order : false}
                    >
                      {id !== "actions" ? (
                        <TableSortLabel
                          active={orderBy === id}
                          direction={orderBy === id ? order : "asc"}
                          onClick={(e) => handleRequestSort(e, id)}
                          sx={{
                            WebkitTapHighlightColor: "transparent",
                            touchAction: "manipulation",
                            minHeight: "44px",
                            "& .MuiTableSortLabel-icon": { mr: 0.5 },
                          }}
                        >
                          {label}
                          {orderBy === id && (
                            <Box component="span" sx={visuallyHidden}>
                              {order === "desc" ? "по убыванию" : "по возрастанию"}
                            </Box>
                          )}
                        </TableSortLabel>
                      ) : (
                        label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((row, _index) => {
                  const isItemSelected = selected.includes(row.id);
                  return (
                    <TableRow
                      key={row.id}
                      hover
                      onClick={(e) => handleClick(e, row.id)}
                      selected={isItemSelected}
                      aria-checked={isItemSelected}
                      tabIndex={-1}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox color="primary" checked={isItemSelected} />
                      </TableCell>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>
                        {formatCreatedAt((row as Step & { createdAt?: Date }).createdAt)}
                      </TableCell>
                      <TableCell align="right">{row.durationSec}</TableCell>
                      <TableCell align="right">
                        {row.estimatedDurationSec != null ? row.estimatedDurationSec : "—"}
                      </TableCell>
                      <TableCell>{renderDayNames(row)}</TableCell>
                      <TableCell>{renderCourseNames(row)}</TableCell>
                      {isAdmin && <TableCell>{renderAuthorName(row)}</TableCell>}
                      <TableCell align="center">
                        <Tooltip title="Редактировать">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditStep?.(row.id);
                            }}
                            sx={{
                              WebkitTapHighlightColor: "transparent",
                              touchAction: "manipulation",
                              minWidth: "44px",
                              minHeight: "44px",
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination
          component="div"
          count={filteredSteps.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          rowsPerPageOptions={[5, 10, 25]}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{
            "& .MuiTablePagination-select": {
              fontSize: { xs: "0.875rem", sm: "1rem" },
            },
            "& .MuiTablePagination-displayedRows": {
              fontSize: { xs: "0.875rem", sm: "1rem" },
            },
            "& .MuiIconButton-root": {
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              minWidth: "44px",
              minHeight: "44px",
            },
          }}
        />
      </Paper>
      {!isMobile && (
        <FormControlLabel
          control={<Switch checked={dense} onChange={() => setDense((d) => !d)} />}
          label="Компактный режим"
          sx={{
            fontSize: { xs: "0.875rem", sm: "1rem" },
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}
        />
      )}
    </Box>
  );
}
