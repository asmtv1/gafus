"use client";

import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import SearchIcon from "@mui/icons-material/Search";
import {
  Box,
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

import type { TrainerDayTableRow as Day } from "@gafus/types";

type Order = "asc" | "desc";

// Day тип теперь импортируется из @gafus/types

const baseHeadCells = [
  { id: "title", label: "Название", numeric: false },
  { id: "type", label: "Тип", numeric: false },
  { id: "description", label: "Описание", numeric: false },
  { id: "steps", label: "Шаги", numeric: false },
  { id: "courses", label: "Курсы", numeric: false },
  { id: "actions", label: "Действия", numeric: false },
] as const;

type HeadCellId = (typeof baseHeadCells)[number]["id"] | "author";

interface EnhancedDaysTableProps {
  days: Day[];
  onEditDay?: (id: string) => void;
  onDeleteDays?: (ids: string[]) => void;
  isAdmin?: boolean;
}

export default function EnhancedDaysTable({
  days,
  onEditDay,
  onDeleteDays,
  isAdmin = false,
}: EnhancedDaysTableProps) {
  const headCells = React.useMemo(() => {
    if (isAdmin) {
      // Вставляем колонку "Автор" перед "Действия"
      const authorCell = { id: "author" as const, label: "Автор", numeric: false as const };
      return [...baseHeadCells.slice(0, -1), authorCell, baseHeadCells[baseHeadCells.length - 1]];
    }
    return baseHeadCells;
  }, [isAdmin]);
  const [order, setOrder] = React.useState<Order>("asc");
  const [orderBy, setOrderBy] = React.useState<HeadCellId>("title");
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [page, setPage] = React.useState(0);
  const [dense, setDense] = React.useState(false);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [searchQuery, setSearchQuery] = React.useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredDays = React.useMemo(() => {
    if (!normalizedQuery) return days;
    return days.filter((day) => {
      const matchesTitle = (day.title || "").toLowerCase().includes(normalizedQuery);
      const matchesStepTitle =
        day.stepLinks?.some((link) =>
          (link.step.title || "").toLowerCase().includes(normalizedQuery),
        ) ?? false;
      return matchesTitle || matchesStepTitle;
    });
  }, [days, normalizedQuery]);
  const filteredDayIds = React.useMemo(
    () => new Set(filteredDays.map((day) => day.id)),
    [filteredDays],
  );

  React.useEffect(() => {
    setSelected((prev) => prev.filter((id) => filteredDayIds.has(id)));
  }, [filteredDayIds]);

  React.useEffect(() => {
    setPage(0);
  }, [normalizedQuery]);

  const handleRequestSort = (_: React.MouseEvent<unknown>, property: HeadCellId) => {
    setOrder(orderBy === property && order === "asc" ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(event.target.checked ? filteredDays.map((d) => d.id) : []);
  };

  const handleClick = (_: React.MouseEvent<unknown>, id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const comparator = React.useCallback(
    (a: Day, b: Day) => {
      const getValue = (day: Day): string => {
        if (orderBy === "steps") {
          return (day.stepLinks?.map((sl) => sl.step.title).join(", ") || "").toLowerCase();
        }
        if (orderBy === "courses") {
          return (day.dayLinks?.map((dl) => dl.course.name).join(", ") || "").toLowerCase();
        }
        if (orderBy === "author") {
          if (!day.author) return "";
          return (day.author.fullName || day.author.username || "").toLowerCase();
        }
        const value = (day as unknown as Record<string, unknown>)[orderBy];
        return typeof value === "number" ? value.toString() : String(value || "");
      };
      const aValue = getValue(a);
      const bValue = getValue(b);
      return order === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    },
    [order, orderBy],
  );

  const renderAuthorName = (day: Day) => {
    if (!day.author) return "—";
    return day.author.fullName || day.author.username;
  };

  const visibleRows = React.useMemo(() => {
    const sorted = [...filteredDays].sort(comparator);
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [filteredDays, page, rowsPerPage, comparator]);

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
            ...(selected.length > 0 && { bgcolor: (theme) => theme.palette.action.selected }),
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
            {selected.length > 0 ? `${selected.length} выбрано` : "Дни"}
          </Typography>
          <Tooltip title={selected.length > 0 ? "Удалить" : "Фильтр"}>
            <IconButton
              onClick={() => {
                if (selected.length > 0) {
                  onDeleteDays?.([...selected]);
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
          <TextField
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            size="small"
            placeholder="Поиск по названию дня или шага"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Мобильное представление - карточки */}
        {isMobile ? (
          <Box sx={{ p: 2 }}>
            <Stack spacing={2}>
              {visibleRows.map((row) => {
                const isItemSelected = selected.includes(row.id);
                const stepsList =
                  row.stepLinks && row.stepLinks.length
                    ? Array.from(new Set(row.stepLinks.map((sl) => sl.step.title))).join(", ")
                    : "—";
                const coursesList =
                  row.dayLinks && row.dayLinks.length
                    ? Array.from(new Set(row.dayLinks.map((dl) => dl.course.name))).join(", ")
                    : "—";

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
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                            <Typography variant="h6" sx={{ fontSize: "1rem", fontWeight: 600 }}>
                              {row.title}
                            </Typography>
                            <Chip
                              label={row.type}
                              size="small"
                              color={row.type === "TRAINING" ? "primary" : "default"}
                              sx={{ height: "20px", fontSize: "0.6875rem" }}
                            />
                          </Box>
                          {row.description && (
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
                          )}
                        </Box>
                      </Box>

                      <Divider sx={{ my: 1.5 }} />

                      <Stack spacing={1}>
                        {stepsList !== "—" && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Шаги:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: "0.875rem", mt: 0.25 }}>
                              {stepsList}
                            </Typography>
                          </Box>
                        )}

                        {coursesList !== "—" && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Курсы:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: "0.875rem", mt: 0.25 }}>
                              {coursesList}
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
                        onClick={() => onEditDay?.(row.id)}
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
                      checked={filteredDays.length > 0 && selected.length === filteredDays.length}
                      indeterminate={selected.length > 0 && selected.length < filteredDays.length}
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
                {visibleRows.map((row) => {
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
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.description || "—"}</TableCell>
                      <TableCell>
                        {row.stepLinks && row.stepLinks.length
                          ? Array.from(new Set(row.stepLinks.map((sl) => sl.step.title))).join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {row.dayLinks && row.dayLinks.length
                          ? Array.from(new Set(row.dayLinks.map((dl) => dl.course.name))).join(", ")
                          : "—"}
                      </TableCell>
                      {isAdmin && <TableCell>{renderAuthorName(row)}</TableCell>}
                      <TableCell align="center">
                        <Tooltip title="Редактировать">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditDay?.(row.id);
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
          count={filteredDays.length}
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
