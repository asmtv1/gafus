import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import type { PublicProfile } from "@gafus/types";

// Создаем логгер для getPublicProfile
const logger = createWebLogger('web-get-public-profile');

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  if (!username) throw new Error("username is required");

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        username: true,
        role: true,
        profile: {
          select: {
            fullName: true,
            birthDate: true,
            about: true,
            telegram: true,
            instagram: true,
            website: true,
            avatarUrl: true,
          },
        },
        diplomas: {
          orderBy: { issuedAt: "desc" },
          select: {
            id: true,
            title: true,
            issuedBy: true,
            issuedAt: true,
            url: true,
          },
        },
        pets: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            type: true,
            breed: true,
            birthDate: true,
            heightCm: true,
            weightKg: true,
            photoUrl: true,
            notes: true,
            ownerId: true,
            awards: {
              orderBy: { date: "desc" },
              select: {
                id: true,
                title: true,
                event: true,
                date: true,
                rank: true,
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const publicProfile: PublicProfile = {
      ...user,
      diplomas: user.diplomas
        .filter((d: { issuedAt: Date | null }) => d.issuedAt !== null)
        .map(
          (d: {
            id: string | number;
            title: string;
            issuedBy: string | null;
            issuedAt: Date | null;
            url?: string | null;
          }) => ({
            id: String(d.id),
            title: d.title,
            issuedBy: d.issuedBy || "",
            issuedAt: d.issuedAt || new Date(),
            ...(d.url ? { url: d.url } : {}),
          }),
        ),
      pets: user.pets.map(
        (pet: {
          id: string | number;
          name: string;
          type: string | number;
          breed: string;
          birthDate: Date | null;
          heightCm: number | null;
          weightKg: number | null;
          photoUrl: string | null;
          notes: string | null;
          ownerId: string | number;
          awards: {
            id: string | number;
            title: string;
            event: string | null;
            date: Date | null;
            rank: string | null;
          }[];
        }) => ({
          id: String(pet.id),
          name: pet.name,
          type: String(pet.type),
          breed: pet.breed ?? "",
          birthDate: pet.birthDate ?? null,
          heightCm: pet.heightCm,
          weightKg: pet.weightKg,
          photoUrl: pet.photoUrl,
          notes: pet.notes,
          ownerId: String(pet.ownerId),
          awards: pet.awards
            .filter((a): a is Required<typeof a> => a.date !== null)
            .map(
              (a: {
                id: string | number;
                title: string;
                event: string | null;
                date: Date | null;
                rank: string | null;
              }) => ({
                id: String(a.id),
                title: a.title,
                event: a.event || "",
                date: a.date || new Date(),
                rank: a.rank || "",
              }),
            ),
        }),
      ),
    };

    return publicProfile;
  } catch (error) {
    logger.error("Ошибка в getPublicProfile:", error as Error, { operation: 'error' });
    throw new Error("Не удалось загрузить публичный профиль");
  }
}
