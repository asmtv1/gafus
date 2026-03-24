import { cache } from "react";
import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";

/**
 * Одна сессия на RSC-запрос: дедупликация getServerSession между страницей и server actions.
 */
export const getCachedSession = cache(() => getServerSession(authOptions));
