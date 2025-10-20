import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getPendingExamCount } from "@/features/exam-results/lib/getPendingExamCount";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const count = await getPendingExamCount();
    
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Failed to get pending exam count:", error);
    return NextResponse.json({ error: "Ошибка получения данных" }, { status: 500 });
  }
}

