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
  createdAt: Date;
  updatedAt: Date;
}): string {
  const lines: string[] = [];
  
  lines.push(`# Ошибка: ${error.message}`);
  lines.push('');
  lines.push(`**ID:** \`${error.id}\``);
  lines.push(`**Приложение:** ${error.appName}`);
  lines.push(`**Окружение:** ${error.environment}`);
  lines.push(`**Дата:** ${format(new Date(error.createdAt), 'dd.MM.yyyy HH:mm:ss', { locale: ru })}`);
  lines.push(`**URL:** ${error.url}`);
  
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const formatType = searchParams.get('format') || 'json';

    const error = await prisma.errorLog.findUnique({
      where: { id },
    });

    if (!error) {
      return NextResponse.json(
        { error: 'Ошибка не найдена' },
        { status: 404 }
      );
    }

    if (formatType === 'markdown' || formatType === 'md') {
      const markdown = formatErrorForAI(error as unknown as Parameters<typeof formatErrorForAI>[0]);
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="error-${id}.md"`,
        },
      });
    }

    // JSON format by default
    return NextResponse.json(error, {
      headers: {
        'Content-Disposition': `attachment; filename="error-${id}.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting error:', error);
    return NextResponse.json(
      { error: 'Не удалось экспортировать ошибку' },
      { status: 500 }
    );
  }
}

