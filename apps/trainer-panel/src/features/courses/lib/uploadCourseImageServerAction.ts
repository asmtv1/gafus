"use server";

import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import path from "path";

export async function uploadCourseImageServerAction(formData: FormData) {
  let file: File | null = null;

  try {
    file = formData.get("image") as File | null;

    if (!file || file.size === 0) {
      throw new Error("Файл не получен или пуст");
    }

    // Валидация типа файла
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Неподдерживаемый тип файла. Разрешены только JPEG, PNG и WebP");
    }

    // Валидация размера файла (максимум 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error("Файл слишком большой. Максимальный размер: 5MB");
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const ext = file.name.split(".").pop();
    const fileName = `${randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public/uploads/courses");
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, uint8Array);

    return `/uploads/courses/${fileName}`;
  } catch (error) {
    console.error("❌ Error in uploadCourseImageServerAction:", error);

    await reportErrorToDashboard({
      message:
        error instanceof Error ? error.message : "Unknown error in uploadCourseImageServerAction",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "uploadCourseImageServerAction",
        fileName: file?.name,
        fileSize: file?.size,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["courses", "upload", "server-action"],
    });

    throw new Error("Что-то пошло не так при загрузке изображения");
  }
}
