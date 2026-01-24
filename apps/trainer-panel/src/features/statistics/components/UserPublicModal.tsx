"use client";

import { Close } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { getPublicProfileAction } from "@shared/lib/actions/users";
import { getTelegramUrl, getInstagramUrl } from "@shared/utils/socialLinks";

import {
  Avatar,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
  IconButton,
  Paper,
} from "@/utils/muiImports";

import type { PublicProfile } from "@gafus/types";

interface UserPublicModalProps {
  open: boolean;
  username: string | null;
  onClose: () => void;
}

export default function UserPublicModal({ open, username, onClose }: UserPublicModalProps) {
  const [data, setData] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !username) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getPublicProfileAction(username);
        if (!cancelled) {
          if (res.success) setData(res.data);
          else setError(res.error || "Ошибка загрузки");
        }
      } catch {
        if (!cancelled) setError("Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, username]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          },
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" color="text.primary">
            Публичный профиль пользователя
          </Typography>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              minWidth: "44px",
              minHeight: "44px",
            }}
          >
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {loading && (
          <Typography variant="body2" color="text.secondary">
            Загрузка...
          </Typography>
        )}
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        {data && (
          <Box>
            <Box sx={{ display: "flex", alignItems: "flex-start", mb: 3 }}>
              <Avatar
                sx={{ width: 80, height: 80, mr: 2 }}
                src={data.profile?.avatarUrl || "/uploads/avatar.svg"}
                alt={data.username}
              />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" gutterBottom color="text.primary">
                  {data.profile?.fullName || data.username}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Chip label={`Роль: ${data.role}`} size="small" variant="outlined" />
                  {data.profile?.telegram && (
                    <Chip
                      label={`TG: ${data.profile.telegram}`}
                      size="small"
                      variant="outlined"
                      component="a"
                      href={getTelegramUrl(data.profile.telegram)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`Открыть Telegram профиль ${data.profile.telegram} в новой вкладке`}
                      clickable
                      sx={{ cursor: "pointer" }}
                    />
                  )}
                  {data.profile?.instagram && (
                    <Chip
                      label={`IG: ${data.profile.instagram}`}
                      size="small"
                      variant="outlined"
                      component="a"
                      href={getInstagramUrl(data.profile.instagram)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`Открыть Instagram профиль ${data.profile.instagram} в новой вкладке`}
                      clickable
                      sx={{ cursor: "pointer" }}
                    />
                  )}
                  {data.profile?.website && (
                    <Chip
                      label={`Site: ${data.profile.website}`}
                      size="small"
                      variant="outlined"
                      component="a"
                      href={data.profile.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`Открыть сайт ${data.profile.website} в новой вкладке`}
                      clickable
                      sx={{ cursor: "pointer" }}
                    />
                  )}
                </Box>
                {data.profile?.about && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {data.profile.about}
                  </Typography>
                )}
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" gutterBottom color="text.primary">
              Питомцы
            </Typography>
            {data.pets.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Питомцев нет
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {data.pets.map((pet) => (
                  <Paper key={pet.id} sx={{ p: 2, flex: "1 1 260px", minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                      <Avatar
                        sx={{ width: 48, height: 48 }}
                        src={pet.photoUrl || "/uploads/pet-avatar.jpg"}
                        alt={pet.name}
                      />
                      <Box>
                        <Typography variant="subtitle1" fontWeight="bold" color="text.primary">
                          {pet.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {pet.type} • {pet.breed}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
                      <Chip
                        label={`Рост: ${typeof pet.heightCm === "number" ? `${pet.heightCm} см` : "—"}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`Вес: ${typeof pet.weightKg === "number" ? `${pet.weightKg} кг` : "—"}`}
                        size="small"
                        variant="outlined"
                      />
                      {pet.birthDate && (
                        <Chip
                          label={`Д.р.: ${new Date(pet.birthDate).toLocaleDateString("ru-RU")}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                    {pet.notes && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Заметки: {pet.notes}
                      </Typography>
                    )}
                    {pet.awards && pet.awards.length > 0 && (
                      <Box>
                        <Typography variant="body2" color="text.primary" gutterBottom>
                          Награды:
                        </Typography>
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                          {pet.awards.map((a) => (
                            <Typography key={a.id} variant="caption" color="text.secondary">
                              {a.title} {a.event ? `(${a.event})` : ""}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
