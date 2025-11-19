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
  Card,
  CardContent,
  CardActions,
  Chip,
  Stack,
  Divider
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import * as React from "react";

import type { TrainerStepTableRow as Step } from "@gafus/types";

type Order = "asc" | "desc";

// Step тип теперь импортируется из @gafus/types

const baseHeadCells = [
  { id: "title", label: "Название", numeric: false },
  { id: "description", label: "Описание", numeric: false },
  { id: "durationSec", label: "Длительность (сек)", numeric: true },
  { id: "days", label: "Дни", numeric: false },
  { id: "courses", label: "Курсы", numeric: false },
  { id: "actions", label: "Действия", numeric: false },
] as const;

type HeadCellId = (typeof baseHeadCells)[number]["id"] | "author";

interface EnhancedStepsTableProps {
  steps: Step[];
  onEditStep?: (id: string) => void;
  onDeleteSteps?: (ids: string[]) => void;
  isAdmin?: boolean;
}

export default function EnhancedStepsTable({
  steps,
  onEditStep,
  onDeleteSteps,
  isAdmin = false,
}: EnhancedStepsTableProps) {
  const headCells = React.useMemo(() => {
    if (isAdmin) {
      // Вставляем колонку "Автор" перед "Действия"
      const authorCell = { id: "author" as const, label: "Автор", numeric: false as const };
      return [...baseHeadCells.slice(0, -1), authorCell, baseHeadCells[baseHeadCells.length - 1]];
    }
    return baseHeadCells;
  }, [isAdmin]);
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
        if (orderBy === "author") {
          if (!step.author) return "";
          return (step.author.fullName || step.author.username || "").toLowerCase();
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
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
              fontSize: { xs: '1rem', sm: '1.25rem' }
            }}
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
              disabled={selected.length === 0}
              sx={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                minWidth: '44px',
                minHeight: '44px'
              }}
            >
              {selected.length > 0 ? <DeleteIcon /> : <FilterListIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
        
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
                      bgcolor: isItemSelected ? 'action.selected' : 'background.paper',
                      position: 'relative'
                    }}
                  >
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                        <Checkbox
                          size="small"
                          checked={isItemSelected}
                          onClick={(e) => handleClick(e, row.id)}
                          sx={{ mt: -0.5 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, mb: 0.5 }}>
                            {row.title}
                          </Typography>
                          <Typography 
                            variant="body2" 
                            color="text.secondary" 
                            sx={{ 
                              fontSize: '0.875rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}
                          >
                            {row.description}
                          </Typography>
                        </Box>
                      </Box>

                      <Divider sx={{ my: 1.5 }} />

                      <Stack spacing={1}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Длительность:
                          </Typography>
                          <Chip 
                            label={`${row.durationSec} сек`} 
                            size="small" 
                            sx={{ height: '20px', fontSize: '0.75rem' }}
                          />
                        </Box>

                        {renderDayNames(row) !== "—" && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Дни:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.875rem', mt: 0.25 }}>
                              {renderDayNames(row)}
                            </Typography>
                          </Box>
                        )}

                        {renderCourseNames(row) !== "—" && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Курсы:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.875rem', mt: 0.25 }}>
                              {renderCourseNames(row)}
                            </Typography>
                          </Box>
                        )}

                        {isAdmin && (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Автор:
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.875rem', mt: 0.25 }}>
                              {renderAuthorName(row)}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </CardContent>

                    <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                      <IconButton
                        size="small"
                        onClick={() => onEditStep?.(row.id)}
                        sx={{ 
                          color: 'primary.main',
                          WebkitTapHighlightColor: 'transparent',
                          touchAction: 'manipulation',
                          minWidth: '44px',
                          minHeight: '44px'
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
                          sx={{
                            WebkitTapHighlightColor: 'transparent',
                            touchAction: 'manipulation',
                            minHeight: '44px',
                            '& .MuiTableSortLabel-icon': { mr: 0.5 }
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
                      <TableCell align="right">{row.durationSec}</TableCell>
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
                              WebkitTapHighlightColor: 'transparent',
                              touchAction: 'manipulation',
                              minWidth: '44px',
                              minHeight: '44px'
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
          count={steps.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          rowsPerPageOptions={[5, 10, 25]}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{
            '& .MuiTablePagination-select': {
              fontSize: { xs: '0.875rem', sm: '1rem' }
            },
            '& .MuiTablePagination-displayedRows': {
              fontSize: { xs: '0.875rem', sm: '1rem' }
            },
            '& .MuiIconButton-root': {
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              minWidth: '44px',
              minHeight: '44px'
            }
          }}
        />
      </Paper>
      {!isMobile && (
        <FormControlLabel
          control={<Switch checked={dense} onChange={() => setDense((d) => !d)} />}
          label="Компактный режим"
          sx={{ 
            fontSize: { xs: '0.875rem', sm: '1rem' },
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation'
          }}
        />
      )}
    </Box>
  );
}
