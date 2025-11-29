"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@gafus/prisma";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Форматирует ошибку в Markdown для AI-анализа
 */
function formatErrorForAI(error: {
  id: string;
  message: string;
  appName: string;
  environment: string;
  url: string;
  stack: string | null;
  componentStack: string | null;
  additionalContext: unknown;
  tags: string[];
  userId: string | null;
  sessionId: string | null;
  userAgent: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}): string {
  const lines: string[] = [];
  
  lines.push(`# Ошибка: ${error.message}`);
  lines.push('');
  lines.push(`**ID:** \`${error.id}\``);
  lines.push(`**Приложение:** ${error.appName}`);
  lines.push(`**Окружение:** ${error.environment}`);
  lines.push(`**Дата:** ${format(new Date(error.createdAt), 'dd.MM.yyyy HH:mm:ss', { locale: ru })}`);
  lines.push(`**URL:** ${error.url}`);
  lines.push(`**Статус:** ${error.resolved ? '✅ Решено' : '❌ Не решено'}`);
  
  if (error.userId) {
    lines.push(`**User ID:** \`${error.userId}\``);
  }
  
  if (error.sessionId) {
    lines.push(`**Session ID:** \`${error.sessionId}\``);
  }
  
  if (error.stack) {
    lines.push('');
    lines.push('## Stack Trace');
    lines.push('```');
    lines.push(error.stack);
    lines.push('```');
  }
  
  if (error.componentStack) {
    lines.push('');
    lines.push('## Component Stack');
    lines.push('```');
    lines.push(error.componentStack);
    lines.push('```');
  }
  
  if (error.additionalContext) {
    lines.push('');
    lines.push('## Дополнительный контекст');
    lines.push('```json');
    lines.push(JSON.stringify(error.additionalContext, null, 2));
    lines.push('```');
  }
  
  if (error.tags && error.tags.length > 0) {
    lines.push('');
    lines.push(`## Теги`);
    lines.push(error.tags.map(tag => `- ${tag}`).join('\n'));
  }
  
  if (error.userAgent) {
    lines.push('');
    lines.push('## User Agent');
    lines.push(`\`${error.userAgent}\``);
  }
  
  return lines.join('\n');
}

/**
 * GET /api/errors/export
 * Export multiple errors with filters
 * 
 * Query params:
 * - format: 'json' | 'markdown' (default: 'json')
 * - ids: comma-separated list of error IDs (optional, exports specific errors)
 * - appName: filter by app name (optional)
 * - environment: filter by environment (optional)
 * - resolved: filter by resolved status (optional)
 * - limit: max number of errors (default: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const formatType = searchParams.get('format') || 'json';
    const ids = searchParams.get('ids')?.split(',').filter(Boolean);
    const appName = searchParams.get('appName');
    const environment = searchParams.get('environment');
    const resolvedParam = searchParams.get('resolved');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Build where clause
    const where: {
      id?: { in: string[] };
      appName?: string;
      environment?: string;
      resolved?: boolean;
    } = {};

    if (ids && ids.length > 0) {
      where.id = { in: ids };
    }
    if (appName) {
      where.appName = appName;
    }
    if (environment) {
      where.environment = environment;
    }
    if (resolvedParam !== null) {
      where.resolved = resolvedParam === 'true';
    }

    const errors = await prisma.errorReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (errors.length === 0) {
      return NextResponse.json(
        { error: 'Ошибки не найдены' },
        { status: 404 }
      );
    }

    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');

    if (formatType === 'markdown' || formatType === 'md') {
      const markdownParts = errors.map((error, index) => {
        const md = formatErrorForAI(error);
        return index === 0 ? md : `\n\n---\n\n${md}`;
      });
      
      const markdown = `# Экспорт ошибок (${errors.length})\n\nДата экспорта: ${format(new Date(), 'dd.MM.yyyy HH:mm:ss', { locale: ru })}\n\n---\n\n${markdownParts.join('')}`;
      
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="errors-export-${timestamp}.md"`,
        },
      });
    }

    // JSON format by default
    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        count: errors.length,
        errors,
      },
      {
        headers: {
          'Content-Disposition': `attachment; filename="errors-export-${timestamp}.json"`,
        },
      }
    );
  } catch (error) {
    console.error('Error exporting errors:', error);
    return NextResponse.json(
      { error: 'Не удалось экспортировать ошибки' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/errors/export
 * Export specific errors by IDs (for batch selection)
 * 
 * Body:
 * - ids: array of error IDs
 * - format: 'json' | 'markdown' (default: 'json')
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, format: formatType = 'json' } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Необходимо указать массив ID ошибок' },
        { status: 400 }
      );
    }

    const errors = await prisma.errorReport.findMany({
      where: {
        id: { in: ids },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (errors.length === 0) {
      return NextResponse.json(
        { error: 'Ошибки не найдены' },
        { status: 404 }
      );
    }

    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');

    if (formatType === 'markdown' || formatType === 'md') {
      const markdownParts = errors.map((error, index) => {
        const md = formatErrorForAI(error);
        return index === 0 ? md : `\n\n---\n\n${md}`;
      });
      
      const markdown = `# Экспорт ошибок (${errors.length})\n\nДата экспорта: ${format(new Date(), 'dd.MM.yyyy HH:mm:ss', { locale: ru })}\n\n---\n\n${markdownParts.join('')}`;
      
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="errors-export-${timestamp}.md"`,
        },
      });
    }

    // JSON format by default
    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        count: errors.length,
        errors,
      },
      {
        headers: {
          'Content-Disposition': `attachment; filename="errors-export-${timestamp}.json"`,
        },
      }
    );
  } catch (error) {
    console.error('Error exporting errors:', error);
    return NextResponse.json(
      { error: 'Не удалось экспортировать ошибки' },
      { status: 500 }
    );
  }
}

