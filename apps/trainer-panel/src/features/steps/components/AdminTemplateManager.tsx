"use client";

import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { StepTemplateWithCategory } from "../lib/getStepTemplates";

interface AdminTemplateManagerProps {
  templates: StepTemplateWithCategory[];
  onDeleteTemplate: (templateId: string) => Promise<{ success: boolean; message: string }>;
}

export default function AdminTemplateManager({
  templates,
  onDeleteTemplate,
}: AdminTemplateManagerProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StepTemplateWithCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDeleteClick = (template: StepTemplateWithCategory) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTemplate) return;

    const result = await onDeleteTemplate(selectedTemplate.id);
    
    if (result.success) {
      setSuccess(result.message);
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
      // Обновляем страницу
      window.location.reload();
    } else {
      setError(result.message);
    }
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

      <Box sx={{ mb: 3, display: "flex", gap: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} href="/main-panel/templates/new">
          Создать шаблон
        </Button>
        <Button variant="outlined" startIcon={<AddIcon />} href="/main-panel/templates/categories/new">
          Создать категорию
        </Button>
      </Box>

      <Typography variant="h6" sx={{ mb: 2 }}>
        Шаблоны ({templates.length})
      </Typography>

      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        gap: 2 
      }}>
        {templates.map((template) => (
          <Box key={template.id}>
              <Card>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1 }}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    {template.title}
                  </Typography>
                  <Box>
                    <IconButton size="small" color="error" onClick={() => handleDeleteClick(template)}>
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>

                {template.category && (
                  <Chip
                    label={template.category.name}
                    size="small"
                    icon={template.category.icon ? <span>{template.category.icon}</span> : undefined}
                    sx={{ mb: 1 }}
                  />
                )}

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Использовано: {template.usageCount} раз
                </Typography>

                {template.tags.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {template.tags.slice(0, 3).map((tag) => (
                      <Chip key={tag} label={tag} size="small" variant="outlined" />
                    ))}
                  </Box>
                )}

                {/* Markdown описание полноценно, с GFM */}
                {template.description && (
                  <Box sx={{
                    mt: 1.5,
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
                      {template.description}
                    </ReactMarkdown>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Удалить шаблон?</DialogTitle>
        <DialogContent>
          <Typography>
            Вы уверены, что хотите удалить шаблон "{selectedTemplate?.title}"?
            Это действие нельзя отменить.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Отмена</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

