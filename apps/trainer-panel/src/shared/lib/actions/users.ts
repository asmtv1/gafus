"use server";

import { prisma } from "@gafus/prisma";

import type { PublicProfile } from "@gafus/types";

export async function getPublicProfileAction(
  username: string,
): Promise<{ success: true; data: PublicProfile } | { success: false; error: string }> {
  try {
    if (!username) {
      return { success: false, error: "Не указан username" };
    }

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

    if (!user) {
      return { success: false, error: "Пользователь не найден" };
    }

    const data: PublicProfile = {
      username: user.username,
      role: user.role as PublicProfile["role"],
      profile: user.profile
        ? {
            fullName: user.profile.fullName,
            birthDate: user.profile.birthDate,
            about: user.profile.about,
            telegram: user.profile.telegram,
            instagram: user.profile.instagram,
            website: user.profile.website,
            avatarUrl: user.profile.avatarUrl,
          }
        : null,
      diplomas: user.diplomas
        .filter((d) => d.issuedAt !== null)
        .map((d) => ({
          id: String(d.id),
          title: d.title,
          issuedBy: d.issuedBy ?? null,
          issuedAt: d.issuedAt ?? new Date(),
          ...(d.url ? { url: d.url } : {}),
        })),
      pets: user.pets.map((pet) => ({
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
          .filter((a) => a.date !== null)
          .map((a) => ({
            id: String(a.id),
            title: a.title,
            event: a.event ?? null,
            date: a.date ?? new Date(),
            rank: a.rank ?? null,
          })),
      })),
    };

    return { success: true, data };
  } catch (error) {
    console.error("getPublicProfileAction error:", error);
    return { success: false, error: "Не удалось получить профиль пользователя" };
  }
}


