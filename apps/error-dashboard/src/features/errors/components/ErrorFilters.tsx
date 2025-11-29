"use client";

import { FilterList, Clear } from "@mui/icons-material";
import {
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Box,
  Chip,
  Typography,
} from "@mui/material";
import { useFilters } from "@shared/contexts/FilterContext";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function ErrorFilters() {
  const router = useRouter();
  const { filters, setFilters } = useFilters();

  const [localFilters, setLocalFilters] = useState({
    app: filters.appName || "",
    environment: filters.environment || "",
    resolved: filters.resolved === true ? "true" : filters.resolved === false ? "false" : "",
  });

  // Синхронизируем локальные фильтры с контекстом
  useEffect(() => {
    setLocalFilters({
      app: filters.appName || "",
      environment: filters.environment || "",
      resolved: filters.resolved === true ? "true" : filters.resolved === false ? "false" : "",
    });
  }, [filters]);

  const handleFilterChange = (field: string, value: string) => {
    const newLocalFilters = { ...localFilters, [field]: value };
    setLocalFilters(newLocalFilters);

    // Обновляем контекст
    const newFilters = {
      appName: newLocalFilters.app || undefined,
      environment: newLocalFilters.environment || undefined,
      resolved:
        newLocalFilters.resolved === "true"
          ? true
          : newLocalFilters.resolved === "false"
            ? false
            : undefined,
    };
    setFilters(newFilters);

    // Обновляем URL без перезагрузки страницы
    const params = new URLSearchParams();
    if (newLocalFilters.app) params.set("app", newLocalFilters.app);
    if (newLocalFilters.environment) params.set("env", newLocalFilters.environment);
    if (newLocalFilters.resolved) params.set("resolved", newLocalFilters.resolved);

    const newUrl = params.toString() ? `/?${params.toString()}` : "/";
    router.push(newUrl, { scroll: false });
  };

  const clearFilters = () => {
    setLocalFilters({ app: "", environment: "", resolved: "" });
    setFilters({});
    router.push("/", { scroll: false });
  };

  const hasActiveFilters = localFilters.app || localFilters.environment || localFilters.resolved;

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" mb={2}>
          <FilterList sx={{ mr: 1 }} />
          <Typography variant="h6">Фильтры</Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(4, 1fr)",
            },
          }}
        >
          <Box>
            <TextField
              fullWidth
              label="Приложение"
              value={localFilters.app}
              onChange={(e) => handleFilterChange("app", e.target.value)}
              placeholder="web, trainer-panel..."
            />
          </Box>

          <Box>
            <TextField
              fullWidth
              label="Окружение"
              value={localFilters.environment}
              onChange={(e) => handleFilterChange("environment", e.target.value)}
              placeholder="production, development..."
            />
          </Box>

          <Box>
            <FormControl fullWidth>
              <InputLabel>Статус</InputLabel>
              <Select
                value={localFilters.resolved}
                label="Статус"
                onChange={(e) => handleFilterChange("resolved", e.target.value)}
              >
                <MenuItem value="">Все</MenuItem>
                <MenuItem value="false">Неразрешенные</MenuItem>
                <MenuItem value="true">Разрешенные</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box display="flex" gap={1} alignItems="center" height="100%">
            <Button
              variant="outlined"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              startIcon={<Clear />}
              fullWidth
            >
              Очистить
            </Button>
          </Box>
        </Box>

        {hasActiveFilters && (
          <Box mt={2} display="flex" gap={1} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              Активные фильтры:
            </Typography>
            {localFilters.app && (
              <Chip
                label={`Приложение: ${localFilters.app}`}
                onDelete={() => handleFilterChange("app", "")}
                size="small"
                color="primary"
              />
            )}
            {localFilters.environment && (
              <Chip
                label={`Окружение: ${localFilters.environment}`}
                onDelete={() => handleFilterChange("environment", "")}
                size="small"
                color="primary"
              />
            )}
            {localFilters.resolved && (
              <Chip
                label={`Статус: ${localFilters.resolved === "true" ? "Разрешенные" : "Неразрешенные"}`}
                onDelete={() => handleFilterChange("resolved", "")}
                size="small"
                color="primary"
              />
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
