"use server";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";

export async function createTrainingDay(data: {
  title: string;
  description: string;
  type: string;
  equipment: string;
  stepIds: string[];
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Not authenticated");

  const authorId = session.user.id;

  const day = await prisma.trainingDay.create({
    data: {
      title: data.title,
      description: data.description,
      type: data.type,
      equipment: data.equipment,
      author: { connect: { id: authorId } },
      stepLinks: {
        create: data.stepIds.map((stepId: string, index: number) => ({
          step: { connect: { id: stepId } },
          order: index,
        })),
      },
    },
  });

  return day;
}
