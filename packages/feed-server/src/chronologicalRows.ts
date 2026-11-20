import { prisma } from "@gafus/prisma";
import { createChronologicalFeedReader } from "./chronologicalQuery.js";

export const readChronologicalFeedRows = createChronologicalFeedReader(prisma);
