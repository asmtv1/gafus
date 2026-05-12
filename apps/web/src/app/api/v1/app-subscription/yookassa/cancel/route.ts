import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { authOptions } from "@gafus/auth";
import { cancelYookassaAppSubscription } from "@gafus/core/services/appSubscription";

export const POST = withCSRFProtection(async (_request: NextRequest) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const data = await cancelYookassaAppSubscription(session.user.id);
  return NextResponse.json({ success: true, data });
});
