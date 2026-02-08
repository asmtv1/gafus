import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Box, Typography, IconButton, Paper, Tooltip } from "@/utils/muiImports";
import { 
  ContentCopy as ContentCopyIcon,
  AttachFile as AttachFileIcon,
  Check as CheckIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import type { Message } from "ai";

interface ChatMessageProps {
  message: Message & { tokensUsed?: number | null };
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        mb: 2,
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: isUser ? "row-reverse" : "row",
          alignItems: "flex-end",
          gap: 1,
          maxWidth: "85%",
        }}
      >
        {/* Avatar */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: isUser ? "primary.main" : "white",
            color: isUser ? "white" : "primary.main",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            border: isUser ? "none" : "1px solid",
            borderColor: "divider",
            flexShrink: 0,
            mb: 0.5,
          }}
        >
          {isUser ? <PersonIcon sx={{ fontSize: 16 }} /> : <BotIcon sx={{ fontSize: 16 }} />}
        </Box>

        <Paper
          elevation={0}
          sx={{
            p: "10px 16px",
            borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            bgcolor: isUser ? "primary.main" : "white",
            color: isUser ? "white" : "text.primary",
            boxShadow: isUser 
              ? "0 2px 8px rgba(25, 118, 210, 0.2)" 
              : "0 2px 8px rgba(0,0,0,0.05)",
            border: isUser ? "none" : "1px solid",
            borderColor: "divider",
            position: "relative",
            "&:hover .copy-button": { opacity: 1 },
          }}
        >
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <Typography variant="body2" component="div" sx={{ mb: 0.5, lineHeight: 1.5 }}>
                  {children}
                </Typography>
              ),
              code: ({ children }) => (
                <Box
                  component="code"
                  sx={{
                    bgcolor: isUser ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.05)",
                    px: 0.5,
                    borderRadius: 0.5,
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                  }}
                >
                  {children}
                </Box>
              ),
              ul: ({ children }) => <Box component="ul" sx={{ pl: 2, mb: 1 }}>{children}</Box>,
              ol: ({ children }) => <Box component="ol" sx={{ pl: 2, mb: 1 }}>{children}</Box>,
            }}
          >
            {message.content}
          </ReactMarkdown>

          {message.experimental_attachments && message.experimental_attachments.length > 0 && (
            <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
              {message.experimental_attachments.map((att: any, i: number) => (
                <Box 
                  key={i} 
                  sx={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 1,
                    bgcolor: isUser ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.03)",
                    p: "4px 8px",
                    borderRadius: 1.5,
                    fontSize: "0.75rem",
                    border: "1px solid",
                    borderColor: isUser ? "rgba(255,255,255,0.2)" : "divider",
                  }}
                >
                  <AttachFileIcon sx={{ fontSize: 14 }} />
                  <Typography variant="caption" noWrap sx={{ maxWidth: "100%", fontWeight: 500 }}>
                    {att.name}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          <Box sx={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            mt: 0.5,
            minWidth: 40 
          }}>
            <Typography variant="caption" sx={{ opacity: 0.6, fontSize: "0.65rem" }}>
              {formatTime(message.createdAt || new Date())}
            </Typography>
            
            {!isUser && (
              <Tooltip title={copied ? "Скопировано" : "Копировать"}>
                <IconButton 
                  className="copy-button"
                  size="small" 
                  onClick={handleCopy} 
                  sx={{ 
                    p: 0.2, 
                    ml: 1, 
                    opacity: 0, 
                    transition: "opacity 0.2s",
                    color: "inherit"
                  }}
                >
                  {copied ? <CheckIcon sx={{ fontSize: 14 }} /> : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
