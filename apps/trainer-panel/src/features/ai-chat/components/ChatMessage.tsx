"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Box, Typography, IconButton, Paper } from "@/utils/muiImports";
import { ContentCopy as ContentCopyIcon } from "@mui/icons-material";
import type { ChatMessage as ChatMessageType } from "../lib/getChatHistory";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Игнорируем ошибки копирования
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} дн. назад`;
    return new Date(date).toLocaleDateString("ru-RU");
  };

  const isUser = message.role === "user";

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 2,
      }}
    >
      <Paper
        elevation={1}
        sx={{
          maxWidth: "80%",
          p: 2,
          bgcolor: isUser ? "primary.light" : "grey.100",
          color: isUser ? "primary.contrastText" : "text.primary",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 1,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ display: "block", mb: 1, opacity: 0.7 }}>
              {isUser ? "Вы" : "AI"}
            </Typography>
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                    {children}
                  </Typography>
                ),
                code: ({ children }) => (
                  <Box
                    component="code"
                    sx={{
                      bgcolor: "rgba(0,0,0,0.1)",
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 0.5,
                      fontSize: "0.875rem",
                      fontFamily: "monospace",
                    }}
                  >
                    {children}
                  </Box>
                ),
                pre: ({ children }) => (
                  <Box
                    component="pre"
                    sx={{
                      bgcolor: "rgba(0,0,0,0.1)",
                      p: 1,
                      borderRadius: 1,
                      overflow: "auto",
                      fontSize: "0.875rem",
                      fontFamily: "monospace",
                    }}
                  >
                    {children}
                  </Box>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
            <Typography variant="caption" sx={{ display: "block", mt: 1, opacity: 0.6 }}>
              {formatTime(message.createdAt)}
            </Typography>
          </Box>
          <IconButton size="small" onClick={handleCopy} sx={{ alignSelf: "flex-start" }}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
        {copied && (
          <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "success.main" }}>
            Скопировано!
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
