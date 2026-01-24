"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
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
} from "@/utils/muiImports";
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { ChatMessage } from "./ChatMessage";
import { sendMessage } from "../lib/sendMessage";
import { getChatHistory } from "../lib/getChatHistory";
import { clearChatHistory } from "../lib/clearChatHistory";
import { getAIConfig } from "../lib/getAIConfig";
import type { ChatMessage as ChatMessageType } from "../lib/getChatHistory";

const ERROR_MESSAGES: Record<string, string> = {
  "Неверный API ключ": "Проверьте правильность ключа в настройках",
  "Превышен лимит": "Слишком много запросов. Подождите немного.",
  "RATE_LIMIT_EXCEEDED": "Лимит запросов исчерпан. Переключение на резервный провайдер...",
};

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState("meta-llama/llama-3.3-70b-instruct");
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{
    model: string;
    enabled: boolean;
    hasApiKey: boolean;
  } | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Загружаем конфигурацию при монтировании
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

  // Ленивая загрузка истории при открытии виджета
  useEffect(() => {
    if (isOpen && !historyLoaded) {
      setIsLoadingHistory(true);
      getChatHistory(0, 20)
        .then((result) => {
          if (result.success && result.data) {
            // Переворачиваем массив, так как сообщения приходят в порядке DESC
            setMessages([...result.data.messages].reverse());
            setHistoryLoaded(true);
          }
        })
        .catch(() => {
          // Игнорируем ошибки загрузки истории
        })
        .finally(() => {
          setIsLoadingHistory(false);
        });
    }
  }, [isOpen, historyLoaded]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Закрытие по Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleSend = () => {
    // Валидация на клиенте
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError("Сообщение не может быть пустым");
      return;
    }

    if (trimmedMessage.length > 4000) {
      setError("Сообщение слишком длинное (максимум 4000 символов)");
      return;
    }

    // Rate limiting на клиенте
    const now = Date.now();
    if (now - lastMessageTime < 1000) {
      setError("Подождите немного перед отправкой следующего сообщения");
      return;
    }

    setError(null);
    setLastMessageTime(now);
    setIsTyping(true);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("message", trimmedMessage);
        formData.append("model", selectedModel);

        const result = await sendMessage({ success: false }, formData);

        if (result.success && result.data) {
          const data = result.data;
          // Добавляем оба сообщения (user + assistant)
          setMessages((prev) => [
            ...prev,
            {
              id: data.userMessageId,
              role: "user",
              content: trimmedMessage,
              createdAt: new Date(),
            },
            {
              id: data.assistantMessageId,
              role: "assistant",
              content: data.content,
              tokensUsed: data.tokensUsed ?? null,
              createdAt: new Date(),
            },
          ]);
          setMessage("");
          setHistoryLoaded(false); // Перезагрузим историю при следующем открытии
        } else {
          setError(result.error || "Ошибка при отправке сообщения");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      } finally {
        setIsTyping(false);
      }
    });
  };

  const handleClearHistory = async () => {
    if (confirm("Вы уверены, что хотите очистить всю историю чата?")) {
      const result = await clearChatHistory();
      if (result.success) {
        setMessages([]);
        setHistoryLoaded(false);
      } else {
        setError(result.error || "Ошибка при очистке истории");
      }
    }
  };


  // Если нет API ключа (ни общего, ни индивидуального), не показываем виджет
  if (!config || !config.hasApiKey) {
    return null; // Виджет не отображается, если нет ключа
  }

  if (!config.enabled) {
    return null; // Виджет не отображается, если отключен
  }

  return (
    <>
      {!isOpen ? (
        <Fab
          color="primary"
          onClick={() => setIsOpen(true)}
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
          }}
        >
          <ChatIcon />
        </Fab>
      ) : (
        <Paper
          elevation={8}
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 400,
            maxWidth: "calc(100vw - 48px)",
            height: 600,
            maxHeight: "calc(100vh - 48px)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
          }}
        >
          {/* Заголовок */}
          <Box
            sx={{
              p: 2,
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="h6">AI Помощник</Typography>
              <Box>
                <IconButton size="small" onClick={handleClearHistory} title="Очистить историю">
                  <DeleteIcon />
                </IconButton>
                <IconButton size="small" onClick={() => setIsOpen(false)}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>

            <FormControl fullWidth size="small">
              <Select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as string)}
                sx={{ fontSize: "0.8rem", height: "32px" }}
              >
                <MenuItem value="meta-llama/llama-3.3-70b-instruct" sx={{ fontSize: "0.8rem" }}>
                  Llama 3.3 70B (Быстрая)
                </MenuItem>
                <MenuItem value="deepseek/deepseek-r1" sx={{ fontSize: "0.8rem" }}>
                  DeepSeek R1 (Умная)
                </MenuItem>
                <MenuItem value="meta-llama/llama-3.1-405b-instruct" sx={{ fontSize: "0.8rem" }}>
                  Llama 3.1 405B (Мощная)
                </MenuItem>
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
              bgcolor: "background.default",
            }}
          >
            {isLoadingHistory ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
                <CircularProgress />
              </Box>
            ) : messages.length === 0 ? (
              <Box sx={{ textAlign: "center", p: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Начните диалог с AI помощником
                </Typography>
              </Box>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
                {isTyping && (
                  <Box sx={{ display: "flex", justifyContent: "flex-start", mb: 2 }}>
                    <Paper elevation={1} sx={{ p: 2, bgcolor: "grey.100" }}>
                      <Typography variant="body2">AI печатает...</Typography>
                    </Paper>
                  </Box>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </Box>

          {/* Ошибки */}
          {error && (
            <Box sx={{ p: 1 }}>
              <Alert severity="error" onClose={() => setError(null)} sx={{ fontSize: "0.875rem" }}>
                {ERROR_MESSAGES[error] || error}
              </Alert>
            </Box>
          )}

          {/* Поле ввода */}
          <Box
            sx={{
              p: 2,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              gap: 1,
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Введите сообщение..."
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isPending && message.trim()) {
                    handleSend();
                  }
                }
              }}
              disabled={isPending}
              inputProps={{
                maxLength: 4000,
              }}
              helperText={`${message.length}/4000`}
            />
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={isPending || !message.trim() || message.length > 4000}
            >
              {isPending ? <CircularProgress size={20} /> : <SendIcon />}
            </IconButton>
          </Box>
        </Paper>
      )}

    </>
  );
}
