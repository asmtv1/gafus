"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import { DragIndicator as DragIndicatorIcon, Search as SearchIcon } from "@mui/icons-material";
import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props<T> {
  allItems: T[];
  selectedItems: T[];
  onSelectionChange: (selected: T[]) => void;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  title?: string;
  allowDuplicates?: boolean;
  getItemSearchText?: (item: T) => string;
}

interface SortableSelectedItemProps<T> {
  item: T;
  index: number;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  onRemove: (index: number) => void;
}

function SortableSelectedItem<T>({
  item,
  index,
  getItemId,
  getItemLabel,
  onRemove,
}: SortableSelectedItemProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(index) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(index);
  };

  return (
    <ListItemButton
      ref={setNodeRef}
      style={style}
      sx={{
        py: 0.5,
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        minHeight: { xs: "44px", sm: "auto" },
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      <ListItemIcon
        {...attributes}
        {...listeners}
        sx={{
          minWidth: 36,
          cursor: "grab",
          "&:active": {
            cursor: "grabbing",
          },
        }}
      >
        <DragIndicatorIcon color="action" />
      </ListItemIcon>
      <ListItemText 
        primary={getItemLabel(item)} 
        onClick={handleTextClick}
        sx={{
          cursor: "pointer",
          "&:hover": {
            textDecoration: "underline",
          },
        }}
      />
    </ListItemButton>
  );
}

export default function DualListSelector<T>({
  allItems,
  selectedItems,
  onSelectionChange,
  getItemId,
  getItemLabel,
  title = "Выбор элементов",
  allowDuplicates = false,
  getItemSearchText,
}: Props<T>) {
  const [availableItems, setAvailableItems] = useState<T[]>([]);
  const [selected, setSelected] = useState<T[]>([]);
  const [searchText, setSearchText] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Минимальное расстояние для активации drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const getFilteredItems = useCallback((items: T[]): T[] => {
    let filtered = items;
    
    // Фильтр по тексту
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase().trim();
      filtered = filtered.filter((item) => {
        const text = (getItemSearchText || getItemLabel)(item).toLowerCase();
        return text.includes(searchLower);
      });
    }
    
    return filtered;
  }, [searchText, getItemSearchText, getItemLabel]);

  useEffect(() => {
    const filteredAllItems = getFilteredItems(allItems);
    
    if (allowDuplicates) {
      // Если дубликаты разрешены, показываем все отфильтрованные элементы как доступные
      setAvailableItems(filteredAllItems);
      setSelected(selectedItems);
    } else {
      // Если дубликаты не разрешены, фильтруем доступные элементы
      const selectedIds = new Set(selectedItems.map(getItemId));
      const available = filteredAllItems.filter((item) => !selectedIds.has(getItemId(item)));
      setAvailableItems(available);
      setSelected(selectedItems);
    }
  }, [allItems, selectedItems, getItemId, allowDuplicates, getFilteredItems]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = Number(active.id);
      const newIndex = Number(over.id);
      const newSelected = arrayMove(selected, oldIndex, newIndex);
      setSelected(newSelected);
      onSelectionChange(newSelected);
    }
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
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Поиск..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              <List sx={{ 
                minHeight: { xs: 300, sm: 400, md: 480 },
                maxHeight: { xs: 300, sm: 400, md: 480 },
                overflow: "auto" 
              }}>
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={selected.map((_, index) => String(index))}
                  strategy={verticalListSortingStrategy}
                >
                  <List sx={{ 
                    minHeight: { xs: 300, sm: 400, md: 480 },
                    maxHeight: { xs: 300, sm: 400, md: 480 },
                    overflow: "auto" 
                  }}>
                    {selected.map((item, index) => (
                      <SortableSelectedItem
                        key={`selected-${getItemId(item)}-${index}`}
                        item={item}
                        index={index}
                        getItemId={getItemId}
                        getItemLabel={getItemLabel}
                        onRemove={handleRemoveAt}
                      />
                    ))}
                  </List>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
