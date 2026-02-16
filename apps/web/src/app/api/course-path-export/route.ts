import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@gafus/auth";
import { getCoursePathData } from "@gafus/core/services/coursePath";
import { createWebLogger } from "@gafus/logger";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { courseIdSchema } from "@shared/lib/validation/schemas";

export const dynamic = "force-dynamic";

const logger = createWebLogger("web-api-course-path-export");

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    const courseId = request.nextUrl.searchParams.get("courseId");
    const parsed = courseIdSchema.safeParse(courseId);
    if (!parsed.success) {
      return new NextResponse("Invalid courseId", { status: 400 });
    }
    const safeCourseId = parsed.data;

    const result = await getCoursePathData(userId, safeCourseId);
    if (!result.success) {
      logger.warn("Course path data failed", {
        error: result.error,
        userId,
        courseId: safeCourseId,
      });
      return new NextResponse(result.error, { status: 403 });
    }

    const { data } = result;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let currentPage = pdfDoc.addPage([595, 842]);
    let width = currentPage.getSize().width;
    let height = currentPage.getSize().height;
    let y = height - 60;
    const margin = 50;
    const lineHeight = 18;
    const bodySize = 11;

    currentPage.drawText("Ваш путь", {
      x: margin,
      y,
      size: 20,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= lineHeight;
    currentPage.drawText(`— ${data.courseName}`, {
      x: margin,
      y,
      size: 16,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= lineHeight * 1.5;

    const startedStr = data.startedAt
      ? data.startedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      : "—";
    const completedStr = data.completedAt
      ? data.completedAt.toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";
    currentPage.drawText(`Начало: ${startedStr}`, {
      x: margin,
      y,
      size: bodySize,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= lineHeight;
    currentPage.drawText(`Завершение: ${completedStr}`, {
      x: margin,
      y,
      size: bodySize,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= lineHeight * 1.5;

    for (const entry of data.entries) {
      if (y < 80) {
        currentPage = pdfDoc.addPage([595, 842]);
        width = currentPage.getSize().width;
        height = currentPage.getSize().height;
        y = height - 60;
      }
      currentPage.drawText(`День ${entry.dayOrder}. ${entry.dayTitle}`, {
        x: margin,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= lineHeight;
      const excerpt = entry.contentExcerpt || "(нет записи)";
      const maxWidth = width - margin * 2;
      const words = excerpt.split(/\s+/);
      let line = "";
      const lines: string[] = [];
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, bodySize);
        if (textWidth > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);
      for (const ln of lines) {
        if (y < 60) {
          currentPage = pdfDoc.addPage([595, 842]);
          height = currentPage.getSize().height;
          y = height - 60;
        }
        currentPage.drawText(ln, {
          x: margin,
          y,
          size: bodySize,
          font: font,
          color: rgb(0.25, 0.25, 0.25),
        });
        y -= lineHeight * 0.9;
      }
      y -= lineHeight * 0.5;
    }

    const pdfBytes = await pdfDoc.save();
    const sanitized = data.courseName
      .replace(/[^a-zA-Zа-яА-Я0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim() || "курс";
    const fileName = `Ваш-путь-${sanitized}.pdf`;

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    logger.error("API course-path-export failed", error as Error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
