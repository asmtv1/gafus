"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Fab,
  MenuItem,
  FormControl,
  Select,
  Tooltip,
  Fade,
  Zoom,
} from "@/utils/muiImports";
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
  Delete as DeleteIcon,
  AttachFile as AttachFileIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  SmartToy as BotIcon,
} from "@mui/icons-material";
import { ChatMessage } from "./ChatMessage";
import { getChatHistory } from "../lib/getChatHistory";
import { clearChatHistory } from "../lib/clearChatHistory";
import { getAIConfig } from "../lib/getAIConfig";
import imageCompression from "browser-image-compression";

const MIN_WIDTH = 360;
const MIN_HEIGHT = 400;
const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 600;

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("meta-llama/llama-3.3-70b-instruct");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [config, setConfig] = useState<{
    model: string;
    enabled: boolean;
    hasApiKey: boolean;
  } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  // Состояние размера окна
  const [dimensions, setDimensions] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isResizing, setIsResizing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Cleanup таймаута при размонтировании
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { 
    messages, 
    input, 
    handleInputChange, 
    handleSubmit, 
    setMessages, 
    isLoading, 
    error: chatError,
    reload
  } = useChat({
    api: "/api/chat",
    body: {
      model: selectedModel,
    },
    onResponse: (response) => {
      // Устанавливаем таймаут на 60 секунд для обработки зависших запросов
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        if (isLoading) {
          alert("Превышено время ожидания ответа. Возможно, модель обрабатывает изображение. Попробуйте ещё раз или выберите другую модель.");
        }
      }, 60000);
    },
    onError: (error) => {
      // Очищаем таймаут при ошибке
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Показываем понятное сообщение пользователю
      if (error.message.includes("не поддерживает") || error.message.includes("vision") || error.message.includes("изображениями")) {
        return;
      } else if (error.message.includes("body stream already read")) {
        return;
      } else if (error.message.includes("timeout") || error.message.includes("таймаут")) {
        alert("Превышено время ожидания ответа от модели. Возможно:\n- Модель обрабатывает большое изображение\n- Проблемы с сетью\n- Модель перегружена\n\nПопробуйте ещё раз или выберите другую модель.");
      } else if (error.message.includes("image") || error.message.includes("attachment")) {
        alert("Ошибка при обработке изображения. Убедитесь, что:\n- Файл не превышает 10MB\n- Формат поддерживается (JPG, PNG, WebP)\n- Модель поддерживает работу с изображениями");
      } else if (error.message === "An error occurred.") {
        const isGemini = selectedModel.toLowerCase().includes("gemini");
        if (isGemini) {
          alert(
            "Ошибка при обработке ответа от Gemini 2.0 Flash.\n\n" +
            "Известная проблема: Gemini 2.0 Flash через OpenRouter может возвращать данные в формате, который не всегда корректно обрабатывается.\n\n" +
            "Попробуйте обновить страницу или отправить запрос ещё раз."
          );
        } else {
          alert("Ошибка при обработке ответа от модели. Возможные причины:\n- Модель вернула неожиданный формат данных\n- Проблемы с сетью или таймаут\n- Модель перегружена\n\nПопробуйте:\n- Обновить страницу\n- Выбрать другую модель\n- Отправить запрос ещё раз");
        }
      } else {
        alert(`Ошибка: ${error.message}\n\nПопробуйте:\n- Обновить страницу\n- Выбрать другую модель\n- Проверить размер файла`);
      }
    },
    onFinish: async (message) => {
      // Очищаем таймаут при успешном завершении
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Ждём немного, чтобы БД успела сохранить сообщения
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Перезагружаем историю из БД, чтобы получить правильный порядок с реальными createdAt
      setIsLoadingHistory(true);
      try {
        const result = await getChatHistory(0, 50);
        if (result.success && result.data) {
          const formattedMessages = result.data.messages.map(msg => {
            let attachments = [];
            try {
              if (msg.attachments) {
                attachments = typeof msg.attachments === "string" 
                  ? JSON.parse(msg.attachments) 
                  : msg.attachments;
              }
            } catch (e) {
              // Игнорируем ошибки парсинга attachments
            }

            return {
              id: msg.id,
              role: msg.role as "user" | "assistant" | "system" | "data",
              content: msg.content,
              createdAt: new Date(msg.createdAt),
              experimental_attachments: attachments
            };
          });
          
          formattedMessages.sort((a, b) => {
            const timeA = a.createdAt?.getTime() || 0;
            const timeB = b.createdAt?.getTime() || 0;
            const timeDiff = timeA - timeB;
            if (timeDiff !== 0) return timeDiff;
            return (a.id || "").localeCompare(b.id || "");
          });
          
          setMessages(formattedMessages);
        }
      } catch (error) {
        // Игнорируем ошибки перезагрузки истории
      } finally {
        setIsLoadingHistory(false);
      }
    },
  });

  // Обработка изменения размера
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && !isFullscreen) {
      const newWidth = window.innerWidth - e.clientX - 24;
      const newHeight = window.innerHeight - e.clientY - 24;
      
      setDimensions({
        width: Math.max(MIN_WIDTH, newWidth),
        height: Math.max(MIN_HEIGHT, newHeight)
      });
    }
  }, [isResizing, isFullscreen]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    // Фильтруем только изображения
    const imageFiles = Array.from(files).filter(file => {
      const isImage = file.type.startsWith("image/");
      if (!isImage) {
        alert(`Файл "${file.name}" не является изображением. Разрешены только изображения (JPG, PNG, WebP, GIF и т.д.).`);
      }
      return isImage;
    });
    
    if (imageFiles.length > 0) {
      setSelectedFiles(imageFiles);
    } else {
      // Если все файлы были отфильтрованы, очищаем input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Проверка поддержки vision моделью
  const checkVisionSupport = (model: string): boolean => {
    const visionModels = [
      "gpt-4-vision",
      "gpt-4o",
      "gpt-4-turbo",
      "claude-3",
      "claude-3.5",
      "claude-3-opus",
      "llama-3.2-vision",
      "llama-3.3-vision",
      "gemini-pro-vision",
      "gemini-1.5",
      "gemini-2.0-flash", // Gemini 2.0 Flash поддерживает vision
      "qwen-2.5-vl", // Qwen2.5-VL (Vision-Language)
      "qwen-2-vl", // Qwen2-VL
      "nemotron-nano", // Nemotron Nano с VL в названии
    ];
    const supportsVision = visionModels.some(vm => model.toLowerCase().includes(vm.toLowerCase()));
    
    const nonVisionModels = [
      "llama", // Все модели Llama без vision
      "deepseek-r1",
      "deepseek-chat",
      "mistral",
      "mixtral",
      "gemma", // Gemma без vision
      "molmo", // Molmo
    ];
    const isNonVisionModel = nonVisionModels.some(nvm => {
      const modelLower = model.toLowerCase();
      if (nvm === "llama") {
        return modelLower.includes("llama") && !modelLower.includes("vision");
      }
      return modelLower.includes(nvm.toLowerCase());
    });
    
    return !isNonVisionModel && supportsVision;
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!input.trim() && selectedFiles.length === 0) {
      return;
    }
    
    // Проверяем поддержку vision перед отправкой
    if (selectedFiles.length > 0 && !checkVisionSupport(selectedModel)) {
      alert(
        `Модель ${selectedModel} не поддерживает работу с изображениями.\n\n` +
        "Пожалуйста, выберите модель с поддержкой vision:\n" +
        "- Gemini 2.0 Flash (бесплатная)"
      );
      return;
    }
    
    // Валидация размера файлов (максимум 10MB на файл)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = selectedFiles.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      alert(`Файлы слишком большие. Максимальный размер: 10MB. Файлы: ${oversizedFiles.map(f => f.name).join(", ")}`);
      return;
    }
    
    // Дополнительная проверка: разрешены только изображения
    const nonImageFiles = selectedFiles.filter(f => !f.type.startsWith("image/"));
    if (nonImageFiles.length > 0) {
      alert(`Некоторые файлы не являются изображениями:\n${nonImageFiles.map(f => f.name).join("\n")}\n\nРазрешены только изображения (JPG, PNG, WebP, GIF и т.д.).`);
      return;
    }
    
    const attachments = await Promise.all(selectedFiles.map(async (file) => {
      try {
        let processedFile = file;
        
        // Сжимаем изображения для уменьшения размера data URL
        if (file.type.startsWith("image/")) {
          try {
            processedFile = await imageCompression(file, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1600,
              useWebWorker: true,
              fileType: "image/jpeg",
              initialQuality: 0.8,
            });
            
            // Если сжатие увеличило размер, используем оригинал
            if (processedFile.size >= file.size) {
              processedFile = file;
            }
          } catch (compressionError) {
            // Используем оригинальный файл при ошибке сжатия
            processedFile = file;
          }
        }
        
        return new Promise<any>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error(`Ошибка чтения файла ${file.name}`));
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            resolve({
              name: file.name,
              contentType: processedFile.type,
              url: dataUrl,
            });
          };
          reader.readAsDataURL(processedFile);
        });
      } catch (error) {
        throw error;
      }
    }));

    try {
      handleSubmit(e, {
        experimental_attachments: attachments
      });
    } catch (error) {
      // Ошибка уже обработается в onError
    }
    
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    getAIConfig().then((result) => {
      if (result.success && result.data) {
        setConfig(result.data);
        if (result.data.model) {
          setSelectedModel(result.data.model);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (isOpen && !historyLoaded) {
      setIsLoadingHistory(true);
      getChatHistory(0, 50)
        .then((result) => {
          if (result.success && result.data) {
            // Сообщения уже приходят отсортированными по createdAt ASC (от старых к новым) из getChatHistory
            const formattedMessages = result.data.messages.map(msg => {
              let attachments = [];
              try {
                if (msg.attachments) {
                  attachments = typeof msg.attachments === "string" 
                    ? JSON.parse(msg.attachments) 
                    : msg.attachments;
                }
              } catch (e) {
                // Игнорируем ошибки парсинга attachments
              }

              return {
                id: msg.id,
                role: msg.role as "user" | "assistant" | "system" | "data",
                content: msg.content,
                createdAt: new Date(msg.createdAt),
                experimental_attachments: attachments
              };
            });
            
            // Убеждаемся, что сообщения отсортированы по createdAt и id (от старых к новым)
            formattedMessages.sort((a, b) => {
              const timeA = a.createdAt?.getTime() || 0;
              const timeB = b.createdAt?.getTime() || 0;
              const timeDiff = timeA - timeB;
              if (timeDiff !== 0) return timeDiff;
              // Если время одинаковое, сортируем по ID
              return (a.id || "").localeCompare(b.id || "");
            });
            
            setMessages(formattedMessages);
            setHistoryLoaded(true);
          }
        })
        .finally(() => {
          setIsLoadingHistory(false);
        });
    }
  }, [isOpen, historyLoaded, setMessages]);

  // Постоянно поддерживаем правильный порядок сообщений по createdAt и id
  useEffect(() => {
    if (messages.length > 0) {
      // Сортируем по createdAt, затем по id для стабильности при одинаковом времени
      const sorted = [...messages].sort((a, b) => {
        const timeA = a.createdAt?.getTime() || 0;
        const timeB = b.createdAt?.getTime() || 0;
        const timeDiff = timeA - timeB;
        if (timeDiff !== 0) return timeDiff; // От старых к новым
        
        // Если время одинаковое, сортируем по ID (раньше созданный = меньший ID в cuid)
        return (a.id || "").localeCompare(b.id || "");
      });
      
      // Проверяем, изменился ли порядок
      const needsSort = sorted.some((msg, idx) => msg.id !== messages[idx]?.id);
      
      if (needsSort) {
        setMessages(sorted);
        return; // Не скроллим, если обновляем порядок
      }
    }
    
    // Скроллим вниз при изменении сообщений (только если порядок правильный)
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, setMessages]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (isFullscreen) setIsFullscreen(false);
        else setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, isFullscreen]);

  const handleClearHistory = async () => {
    if (confirm("Вы уверены, что хотите очистить всю историю чата?")) {
      const result = await clearChatHistory();
      if (result.success) {
        setMessages([]);
        setHistoryLoaded(true);
      }
    }
  };

  if (!config || !config.hasApiKey || !config.enabled) {
    return null;
  }

  return (
    <>
      <Zoom in={!isOpen}>
        <Fab
          color="primary"
          onClick={() => setIsOpen(true)}
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            boxShadow: "0 4px 20px rgba(25, 118, 210, 0.4)",
            transition: "all 0.3s ease",
            "&:hover": {
              transform: "scale(1.1) rotate(5deg)",
            }
          }}
        >
          <ChatIcon />
        </Fab>
      </Zoom>

      <Fade in={isOpen}>
        <Paper
          elevation={12}
          sx={{
            position: "fixed",
            bottom: isFullscreen ? 0 : 24,
            right: isFullscreen ? 0 : 24,
            width: isFullscreen ? "100vw" : dimensions.width,
            height: isFullscreen ? "100vh" : dimensions.height,
            maxWidth: isFullscreen ? "100vw" : "calc(100vw - 48px)",
            maxHeight: isFullscreen ? "100vh" : "calc(100vh - 48px)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1100,
            borderRadius: isFullscreen ? 0 : 3,
            overflow: "hidden",
            transition: isResizing ? "none" : "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {/* Resize handle */}
          {!isFullscreen && (
            <Box
              onMouseDown={startResizing}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 15,
                height: 15,
                cursor: "nwse-resize",
                zIndex: 1200,
                "&:hover": { bgcolor: "rgba(0,0,0,0.05)" }
              }}
            />
          )}

          {/* Заголовок */}
          <Box
            sx={{
              p: 2,
              background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
              color: "white",
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    bgcolor: "rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <BotIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                    AI Помощник
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>
                    {isLoading ? "Печатает..." : "В сети"}
                  </Typography>
                </Box>
              </Box>
              
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Tooltip title={isFullscreen ? "Выйти из полноэкранного режима" : "Развернуть"}>
                  <IconButton size="small" onClick={() => setIsFullscreen(!isFullscreen)} sx={{ color: "white" }}>
                    {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Очистить чат">
                  <IconButton size="small" onClick={handleClearHistory} sx={{ color: "white" }}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: "white" }}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>

            <FormControl fullWidth size="small">
              <Select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as string)}
                sx={{ 
                  fontSize: "0.8rem", 
                  height: "36px",
                  bgcolor: "rgba(255,255,255,0.1)",
                  color: "white",
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.3)" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.5)" },
                  "& .MuiSvgIcon-root": { color: "white" },
                }}
                disabled={isLoading}
              >
                <MenuItem value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B (Быстрая)</MenuItem>
                <MenuItem value="deepseek/deepseek-r1">DeepSeek R1 (Умная)</MenuItem>
                <MenuItem value="meta-llama/llama-3.1-405b-instruct">Llama 3.1 405B (Мощная)</MenuItem>

                <MenuItem value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash (Для изображений)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Сообщения */}
          <Box
            ref={chatContainerRef}
            sx={{
              flex: 1,
              overflowY: "auto",
              p: 2,
              bgcolor: "#f8f9fa",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              scrollBehavior: "smooth",
              "&::-webkit-scrollbar": { width: "6px" },
              "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(0,0,0,0.1)", borderRadius: "3px" },
            }}
          >
            {isLoadingHistory ? (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 2 }}>
                <CircularProgress size={30} />
                <Typography variant="caption" color="text.secondary">Загрузка истории...</Typography>
              </Box>
            ) : messages.length === 0 ? (
              <Box sx={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                justifyContent: "center", 
                height: "100%",
                opacity: 0.5,
                textAlign: "center",
                px: 4
              }}>
                <BotIcon sx={{ fontSize: 48, mb: 2 }} />
                <Typography variant="body2">
                  Привет! Я ваш персональный AI помощник. Чем я могу помочь вам сегодня?
                </Typography>
              </Box>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={{
                    ...msg,
                    createdAt: msg.createdAt || new Date()
                  } as any} />
                ))}
                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 1 }}>
                    <Paper 
                      elevation={0} 
                      sx={{ 
                        p: "10px 16px", 
                        bgcolor: "white", 
                        borderRadius: "18px 18px 18px 4px",
                        border: "1px solid",
                        borderColor: "divider",
                        display: "flex",
                        alignItems: "center",
                        gap: 1
                      }}
                    >
                      <CircularProgress size={12} thickness={5} />
                      <Typography variant="body2" color="text.secondary">AI думает...</Typography>
                    </Paper>
                  </Box>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </Box>

          {/* Ошибки */}
          {chatError && (
            <Fade in={!!chatError}>
              <Box sx={{ px: 2, py: 1 }}>
                <Alert 
                  severity="error" 
                  variant="outlined"
                  action={
                    <IconButton size="small" color="inherit" onClick={() => reload()}>
                      <SendIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  }
                  sx={{ borderRadius: 2, fontSize: "0.75rem" }}
                >
                  Ошибка связи. Попробуйте еще раз.
                </Alert>
              </Box>
            </Fade>
          )}

          {/* Поле ввода */}
          <Box
            component="form"
            onSubmit={handleFormSubmit}
            sx={{
              p: 2,
              bgcolor: "white",
              borderTop: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
            }}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            
            {selectedFiles.length > 0 && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {selectedFiles.map((file, i) => (
                  <Paper
                    key={i}
                    variant="outlined"
                    sx={{
                      pl: 1,
                      pr: 0.5,
                      py: 0.5,
                      fontSize: "0.7rem",
                      bgcolor: "rgba(25, 118, 210, 0.05)",
                      borderColor: "primary.light",
                      borderRadius: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    <Typography variant="caption" noWrap sx={{ maxWidth: 100 }}>
                      {file.name}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      sx={{ p: 0.2 }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Paper>
                ))}
              </Box>
            )}

            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
              <Tooltip title="Прикрепить файлы">
                <IconButton
                  size="medium"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  sx={{ 
                    bgcolor: selectedFiles.length ? "primary.main" : "action.hover",
                    color: selectedFiles.length ? "white" : "action.active",
                    "&:hover": { bgcolor: selectedFiles.length ? "primary.dark" : "action.selected" }
                  }}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              
              <TextField
                fullWidth
                multiline
                maxRows={4}
                size="small"
                placeholder="Напишите сообщение..."
                value={input}
                onChange={handleInputChange}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleFormSubmit(e as any);
                  }
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 3,
                    bgcolor: "action.hover",
                    "& fieldset": { borderColor: "transparent" },
                    "&:hover fieldset": { borderColor: "rgba(0,0,0,0.1)" },
                    "&.Mui-focused fieldset": { borderColor: "primary.main" },
                  }
                }}
              />
              
              <IconButton
                color="primary"
                type="submit"
                disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
                sx={{ 
                  bgcolor: "primary.main", 
                  color: "white",
                  "&:hover": { bgcolor: "primary.dark" },
                  "&.Mui-disabled": { bgcolor: "action.disabledBackground", color: "action.disabled" }
                }}
              >
                {isLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon fontSize="small" />}
              </IconButton>
            </Box>
            
            <Box sx={{ display: "flex", justifyContent: "space-between", px: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                Shift + Enter для новой строки
              </Typography>
              <Typography 
                variant="caption" 
                color={input.length > 3800 ? "error" : "text.secondary"} 
                sx={{ fontSize: "0.65rem" }}
              >
                {input.length}/4000
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Fade>
    </>
  );
}
