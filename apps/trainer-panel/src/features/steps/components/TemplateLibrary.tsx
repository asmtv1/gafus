"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  ContentCopy as CopyIcon,
  Search as SearchIcon,
  Timer as TimerIcon,
  Category as CategoryIcon,
} from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { StepTemplateWithCategory } from "../lib/getStepTemplates";
import type { StepCategoryWithCount } from "../lib/getStepCategories";

interface TemplateLibraryProps {
  initialTemplates: StepTemplateWithCategory[];
  categories: StepCategoryWithCount[];
  onUseTemplate: (templateId: string) => Promise<{ success: boolean; message: string; stepId?: string }>;
}

export default function TemplateLibrary({
  initialTemplates,
  categories,
  onUseTemplate,
}: TemplateLibraryProps) {
  const router = useRouter();
  const [templates] = useState(initialTemplates);
  const [filteredTemplates, setFilteredTemplates] = useState(initialTemplates);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filterTemplates = useCallback(() => {
    let filtered = [...templates];

    if (selectedCategory !== "all") {
      filtered = filtered.filter((t) => t.category?.id === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    setFilteredTemplates(filtered);
  }, [selectedCategory, searchQuery, templates]);

  useEffect(() => {
    filterTemplates();
  }, [filterTemplates]);

  const handleUseTemplate = async (templateId: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await onUseTemplate(templateId);

      if (result.success && result.stepId) {
        setSuccess(result.message);
        setTimeout(() => {
          router.push(`/main-panel/steps/${result.stepId}/edit`);
        }, 1000);
      } else {
        setError(result.message);
      }
    } catch (_err) {
      setError("Произошла ошибка при создании шага");
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "Не указано";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins} мин ${secs > 0 ? `${secs} сек` : ""}`;
    }
    return `${secs} сек`;
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Box sx={{ mb: 4, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          label="Поиск"
          variant="outlined"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию, описанию или тегам..."
          sx={{ flexGrow: 1, minWidth: 300 }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: "text.secondary" }} />,
          }}
        />

        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Категория</InputLabel>
          <Select
            value={selectedCategory}
            label="Категория"
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <MenuItem value="all">
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CategoryIcon fontSize="small" />
                Все категории ({initialTemplates.length})
              </Box>
            </MenuItem>
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.name} ({cat.templateCount})
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {filteredTemplates.length === 0 ? (
        <Alert severity="info">
          {searchQuery || selectedCategory !== "all"
            ? "Шаблоны не найдены. Попробуйте изменить критерии поиска."
            : "Шаблоны отсутствуют"}
        </Alert>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          gap: 3
        }}>
          {filteredTemplates.map((template) => (
            <Box key={template.id}>
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 4,
                  },
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "start", justifyContent: "space-between", mb: 1 }}>
                    <Typography variant="h6" component="h3" sx={{ flexGrow: 1 }}>
                      {template.title}
                    </Typography>
                    {template.type === "EXAMINATION" && (
                      <Chip label="Экзамен" color="secondary" size="small" />
                    )}
                  </Box>

                  {template.category && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                      {template.category.icon && <span>{template.category.icon}</span>}
                      <Typography variant="caption" color="text.secondary">
                        {template.category.name}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{
                    mb: 2,
                    color: 'text.secondary',
                    '& p': { margin: 0 },
                    '& ul, & ol': { pl: 3, my: 1 },
                    '& code': { bgcolor: 'action.hover', px: 0.5, py: 0.2, borderRadius: 0.5 },
                    '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto' },
                    '& a': { color: 'primary.main', textDecoration: 'underline' },
                    '& table': { width: '100%', borderCollapse: 'collapse', my: 1 },
                    '& th, & td': { border: '1px solid', borderColor: 'divider', p: 0.5 },
                  }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {template.description || ''}
                    </ReactMarkdown>
                  </Box>

                  {template.durationSec && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                      <TimerIcon fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">
                        {formatDuration(template.durationSec)}
                      </Typography>
                    </Box>
                  )}

                  {template.tags.length > 0 && (
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 2 }}>
                      {template.tags.slice(0, 3).map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                      {template.tags.length > 3 && (
                        <Chip label={`+${template.tags.length - 3}`} size="small" variant="outlined" />
                      )}
                    </Box>
                  )}

                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                    Использовано: {template.usageCount} раз
                  </Typography>
                </CardContent>

                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    variant="contained"
                    startIcon={loading ? <CircularProgress size={16} /> : <CopyIcon />}
                    onClick={() => handleUseTemplate(template.id)}
                    disabled={loading}
                    fullWidth
                  >
                    Использовать шаблон
                  </Button>
                </CardActions>
              </Card>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

