import type { PublicProfile } from "@/types/user";
import { prisma } from "@/shared/prisma";

export async function getPublicProfile(
  username: string
): Promise<PublicProfile | null> {
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
        .filter((d): d is Required<typeof d> => d.issuedAt !== null)
        .map((d) => ({
          id: String(d.id),
          title: d.title,
          issuedBy: d.issuedBy,
          issuedAt: d.issuedAt!,
          ...(d.url ? { url: d.url } : {}),
        })),
      pets: user.pets.map((pet) => ({
        id: String(pet.id),
        name: pet.name,
        type: String(pet.type),
        breed: pet.breed,
        birthDate: pet.birthDate ?? null,
        heightCm: pet.heightCm,
        weightKg: pet.weightKg,
        photoUrl: pet.photoUrl,
        notes: pet.notes,
        ownerId: String(pet.ownerId),
        awards: pet.awards
          .filter((a): a is Required<typeof a> => a.date !== null)
          .map((a) => ({
            id: String(a.id),
            title: a.title,
            event: a.event,
            date: a.date!,
            rank: a.rank,
          })),
      })),
    };

    return publicProfile;
  } catch (error) {
    console.error("Ошибка в getPublicProfile:", error);
    throw new Error("Не удалось загрузить публичный профиль");
  }
}
