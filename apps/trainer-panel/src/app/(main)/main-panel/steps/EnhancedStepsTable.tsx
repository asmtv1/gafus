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

import type { TrainerStepTableRow as Step } from "@gafus/types";

type Order = "asc" | "desc";

// Step тип теперь импортируется из @gafus/types

const headCells = [
  { id: "title", label: "Название", numeric: false },
  { id: "description", label: "Описание", numeric: false },
  { id: "durationSec", label: "Длительность (сек)", numeric: true },
  { id: "days", label: "Дни", numeric: false },
  { id: "courses", label: "Курсы", numeric: false },
  { id: "actions", label: "Действия", numeric: false },
] as const;

type HeadCellId = (typeof headCells)[number]["id"];

interface EnhancedStepsTableProps {
  steps: Step[];
  onEditStep?: (id: string) => void;
  onDeleteSteps?: (ids: string[]) => void;
}

export default function EnhancedStepsTable({
  steps,
  onEditStep,
  onDeleteSteps,
}: EnhancedStepsTableProps) {
  const [order, setOrder] = React.useState<Order>("asc");
  const [orderBy, setOrderBy] = React.useState<HeadCellId>("durationSec");
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [page, setPage] = React.useState(0);
  const [dense, setDense] = React.useState(false);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);

  const handleRequestSort = (_: React.MouseEvent<unknown>, property: HeadCellId) => {
    setOrder(orderBy === property && order === "asc" ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelected(event.target.checked ? steps.map((step) => step.id) : []);
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
    const sorted = [...steps].sort(comparator);
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [steps, page, rowsPerPage, comparator]);

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

  return (
    <Box sx={{ width: "100%" }}>
      <Paper sx={{ width: "100%", mb: 2 }}>
        <Toolbar
          sx={{
            pl: { sm: 2 },
            pr: { xs: 1, sm: 1 },
            ...(selected.length > 0 && {
              bgcolor: (theme) => theme.palette.action.selected,
            }),
          }}
        >
          <Typography
            sx={{ flex: "1 1 100%" }}
            color={selected.length > 0 ? "inherit" : "text.primary"}
            variant="h6"
          >
            {selected.length > 0 ? `${selected.length} выбрано` : "Шаги тренинга"}
          </Typography>
          <Tooltip title={selected.length > 0 ? "Удалить" : "Фильтр"}>
            <IconButton
              onClick={() => {
                if (selected.length > 0) {
                  onDeleteSteps?.([...selected]);
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
                    checked={steps.length > 0 && selected.length === steps.length}
                    indeterminate={selected.length > 0 && selected.length < steps.length}
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
                    <TableCell align="right">{row.durationSec}</TableCell>
                    <TableCell>{renderDayNames(row)}</TableCell>
                    <TableCell>{renderCourseNames(row)}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Редактировать">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditStep?.(row.id);
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
          count={steps.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          rowsPerPageOptions={[5, 10, 25, { label: "Все", value: -1 }]}
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
