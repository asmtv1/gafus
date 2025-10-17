"use client";

import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import {
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
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
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import * as React from "react";

import type { TrainerDayTableRow as Day } from "@gafus/types";

type Order = "asc" | "desc";

// Day тип теперь импортируется из @gafus/types

const headCells = [
  { id: "title", label: "Название", numeric: false },
  { id: "type", label: "Тип", numeric: false },
  { id: "description", label: "Описание", numeric: false },
  { id: "steps", label: "Шаги", numeric: false },
  { id: "courses", label: "Курсы", numeric: false },
  { id: "actions", label: "Действия", numeric: false },
] as const;

type HeadCellId = (typeof headCells)[number]["id"];

interface EnhancedDaysTableProps {
  days: Day[];
  onEditDay?: (id: string) => void;
  onDeleteDays?: (ids: string[]) => void;
}

export default function EnhancedDaysTable({
  days,
  onEditDay,
  onDeleteDays,
}: EnhancedDaysTableProps) {
  const [order, setOrder] = React.useState<Order>("asc");
  const [orderBy, setOrderBy] = React.useState<HeadCellId>("title");
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [page, setPage] = React.useState(0);
  const [dense, setDense] = React.useState(false);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);

  const handleRequestSort = (_: React.MouseEvent<unknown>, property: HeadCellId) => {
    setOrder(orderBy === property && order === "asc" ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(event.target.checked ? days.map((d) => d.id) : []);
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
        const value = (day as unknown as Record<string, unknown>)[orderBy];
        return typeof value === "number" ? value.toString() : String(value || "");
      };
      const aValue = getValue(a);
      const bValue = getValue(b);
      return order === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    },
    [order, orderBy],
  );

  const visibleRows = React.useMemo(() => {
    const sorted = [...days].sort(comparator);
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [days, page, rowsPerPage, comparator]);

  return (
    <Box sx={{ width: "100%" }}>
      <Paper sx={{ width: "100%", mb: 2 }}>
        <Toolbar
          sx={{
            pl: { sm: 2 },
            pr: { xs: 1, sm: 1 },
            ...(selected.length > 0 && { bgcolor: (theme) => theme.palette.action.selected }),
          }}
        >
          <Typography
            sx={{ flex: "1 1 100%" }}
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
            >
              {selected.length > 0 ? <DeleteIcon /> : <FilterListIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
        <TableContainer>
          <Table size={dense ? "small" : "medium"}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    color="primary"
                    checked={days.length > 0 && selected.length === days.length}
                    indeterminate={selected.length > 0 && selected.length < days.length}
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
                    <TableCell align="center">
                      <Tooltip title="Редактировать">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditDay?.(row.id);
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
        <TablePagination
          component="div"
          count={days.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          rowsPerPageOptions={[5, 10, 25]}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
      <FormControlLabel
        control={<Switch checked={dense} onChange={() => setDense((d) => !d)} />}
        label="Компактный режим"
      />
    </Box>
  );
}
