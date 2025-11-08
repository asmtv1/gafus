"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

interface Props<T> {
  allItems: T[];
  selectedItems: T[];
  onSelectionChange: (selected: T[]) => void;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  title?: string;
  allowDuplicates?: boolean;
}

export default function DualListSelector<T>({
  allItems,
  selectedItems,
  onSelectionChange,
  getItemId,
  getItemLabel,
  title = "Выбор элементов",
  allowDuplicates = false,
}: Props<T>) {
  const [availableItems, setAvailableItems] = useState<T[]>([]);
  const [selected, setSelected] = useState<T[]>([]);

  useEffect(() => {
    if (allowDuplicates) {
      // Если дубликаты разрешены, показываем все элементы как доступные
      setAvailableItems(allItems);
      setSelected(selectedItems);
    } else {
      // Если дубликаты не разрешены, фильтруем доступные элементы
      const selectedIds = new Set(selectedItems.map(getItemId));
      const available = allItems.filter((item) => !selectedIds.has(getItemId(item)));
      setAvailableItems(available);
      setSelected(selectedItems);
    }
  }, [allItems, selectedItems, getItemId, allowDuplicates]);

  const handleAdd = (item: T) => {
    const newSelected = [...selected, item];
    // Если дубликаты разрешены, не удаляем элемент из доступных
    if (allowDuplicates) {
      setSelected(newSelected);
      setAvailableItems(availableItems);
    } else {
      const newAvailable = availableItems.filter((i) => getItemId(i) !== getItemId(item));
      setSelected(newSelected);
      setAvailableItems(newAvailable);
    }
    onSelectionChange(newSelected);
  };

  const handleRemoveAt = (indexToRemove: number) => {
    const item = selected[indexToRemove];
    const newSelected = selected.filter((_, idx) => idx !== indexToRemove);
    const newAvailable = [...availableItems, item];
    setSelected(newSelected);
    setAvailableItems(newAvailable);
    onSelectionChange(newSelected);
  };

  const handleAddAll = () => {
    const newSelected = [...selected, ...availableItems];
    setSelected(newSelected);
    // Если дубликаты разрешены, не очищаем доступные элементы
    if (allowDuplicates) {
      setAvailableItems(availableItems);
    } else {
      setAvailableItems([]);
    }
    onSelectionChange(newSelected);
  };

  const handleRemoveAll = () => {
    const newAvailable = [...availableItems, ...selected];
    setSelected([]);
    setAvailableItems(newAvailable);
    onSelectionChange([]);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Box
        sx={{
          display: "flex",
          gap: 2,
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        <Box sx={{ flex: 1, width: "100%" }}>
          <Card>
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography variant="subtitle1">Доступные ({availableItems.length})</Typography>
                <Button 
                  size="small" 
                  onClick={handleAddAll} 
                  disabled={availableItems.length === 0}
                  sx={{
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                    minHeight: { xs: '44px', sm: 'auto' }
                  }}
                >
                  Добавить все
                </Button>
              </Box>
              <List sx={{ maxHeight: 200, overflow: "auto" }}>
                {availableItems.map((item, index) => (
                  <ListItemButton
                    key={`available-${index}-${getItemId(item)}`}
                    onClick={() => handleAdd(item)}
                    sx={{ 
                      py: 0.5,
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                      minHeight: { xs: '44px', sm: 'auto' }
                    }}
                  >
                    <ListItemText primary={getItemLabel(item)} />
                  </ListItemButton>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "row", md: "column" },
              gap: 1,
            }}
          >
            <Button
              variant="outlined"
              size="small"
              onClick={handleAddAll}
              disabled={availableItems.length === 0}
              sx={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                minHeight: { xs: '44px', sm: 'auto' }
              }}
            >
              &gt;&gt;
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleRemoveAll}
              disabled={selected.length === 0}
              sx={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                minHeight: { xs: '44px', sm: 'auto' }
              }}
            >
              &lt;&lt;
            </Button>
          </Box>
        </Box>
        <Box sx={{ flex: 1, width: "100%" }}>
          <Card>
            <CardContent>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography variant="subtitle1">Выбранные ({selected.length})</Typography>
                <Button 
                  size="small" 
                  onClick={handleRemoveAll} 
                  disabled={selected.length === 0}
                  sx={{
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                    minHeight: { xs: '44px', sm: 'auto' }
                  }}
                >
                  Удалить все
                </Button>
              </Box>
              <List sx={{ maxHeight: 200, overflow: "auto" }}>
                {selected.map((item, index) => (
                  <ListItemButton
                    key={`selected-${index}-${getItemId(item)}`}
                    onClick={() => handleRemoveAt(index)}
                    sx={{ 
                      py: 0.5,
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                      minHeight: { xs: '44px', sm: 'auto' }
                    }}
                  >
                    <ListItemText primary={getItemLabel(item)} />
                  </ListItemButton>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
