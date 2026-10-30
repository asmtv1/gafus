import type {PrismaClient} from '@gafus/prisma';
import {hello} from './safe';
export const result=hello();
export type OnlyType=PrismaClient;
