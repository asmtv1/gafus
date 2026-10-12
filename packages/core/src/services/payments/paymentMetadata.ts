import { prisma } from "@gafus/prisma";

/** Read-only payment-target metadata belongs to core, not HTTP handlers. */
export async function getArticlePaymentTarget(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    select: { slug: true },
  });
}

export async function getAppleCoursePaymentMetadata(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: { appleIapProductId: true, isPaid: true },
  });
}
