import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { listUserPetDocuments } from "@shared/lib/pets/server";

const logger = createWebLogger("web-api-pet-documents-list");

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const documents = await listUserPetDocuments(userId);

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    logger.error("Ошибка при получении документов питомцев пользователя", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
}
