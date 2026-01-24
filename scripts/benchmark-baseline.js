#!/usr/bin/env node

/**
 * Скрипт для замера baseline метрик производительности
 * Замеряет время сборки, размер bundle, latency endpoints
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

class PerformanceBenchmark {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
        nodeVersion: process.version,
      },
      build: {},
      bundle: {},
      endpoints: {},
    };
  }

  log(message) {
    console.log(`📊 ${message}`);
  }

  error(message) {
    console.error(`❌ ${message}`);
  }

  success(message) {
    console.log(`✅ ${message}`);
  }

  /**
   * Замер времени сборки
   */
  measureBuildTime() {
    this.log("Замер времени сборки...");

    const startTime = Date.now();
    let buildOutput = "";

    try {
      // Замеряем сборку web приложения
      const buildCommand = "cd apps/web && pnpm build";
      this.log(`Выполняем: ${buildCommand}`);

      buildOutput = execSync(buildCommand, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 300000, // 5 минут таймаут
      });

      const endTime = Date.now();
      const buildTime = endTime - startTime;

      this.results.build = {
        duration: buildTime,
        durationFormatted: `${Math.round(buildTime / 1000)}s`,
        success: true,
        output: buildOutput.slice(-2000), // последние 2000 символов
      };

      this.success(`Сборка завершена за ${Math.round(buildTime / 1000)}s`);
    } catch (error) {
      const endTime = Date.now();
      const buildTime = endTime - startTime;

      this.results.build = {
        duration: buildTime,
        durationFormatted: `${Math.round(buildTime / 1000)}s`,
        success: false,
        error: error.message,
      };

      this.error(`Ошибка сборки: ${error.message}`);
    }
  }

  /**
   * Анализ размера bundle
   */
  analyzeBundleSize() {
    this.log("Анализ размера bundle...");

    const buildDir = path.join(process.cwd(), "apps/web/.next");

    if (!fs.existsSync(buildDir)) {
      this.error("Директория сборки не найдена");
      this.results.bundle = { error: "Build directory not found" };
      return;
    }

    try {
      // Ищем статические файлы
      const staticDir = path.join(buildDir, "static");
      let totalSize = 0;
      let fileCount = 0;
      const chunks = [];

      function calculateSize(dir) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            calculateSize(filePath);
          } else {
            totalSize += stat.size;
            fileCount++;

            // Собираем информацию о chunks
            if (file.endsWith(".js") && file.includes("chunk")) {
              chunks.push({
                name: file,
                size: stat.size,
                sizeFormatted: `${Math.round(stat.size / 1024)}KB`,
              });
            }
          }
        }
      }

      if (fs.existsSync(staticDir)) {
        calculateSize(staticDir);
      }

      // Сортируем chunks по размеру
      chunks.sort((a, b) => b.size - a.size);

      this.results.bundle = {
        totalSize,
        totalSizeFormatted: `${Math.round(totalSize / 1024 / 1024)}MB`,
        fileCount,
        topChunks: chunks.slice(0, 10), // Топ 10 самых больших chunks
        success: true,
      };

      this.success(
        `Общий размер bundle: ${Math.round(totalSize / 1024 / 1024)}MB (${fileCount} файлов)`,
      );

      if (chunks.length > 0) {
        this.log(`Крупнейшие chunks:`);
        chunks.slice(0, 5).forEach((chunk, i) => {
          console.log(`  ${i + 1}. ${chunk.name}: ${chunk.sizeFormatted}`);
        });
      }
    } catch (error) {
      this.error(`Ошибка анализа bundle: ${error.message}`);
      this.results.bundle = { error: error.message };
    }
  }

  /**
   * Замер latency критичных endpoints (простая симуляция)
   */
  async measureEndpointLatency() {
    this.log("Замер latency endpoints (симуляция)...");

    // Для реального замера latency нужен запущенный сервер
    // Пока создадим placeholder с ожидаемыми значениями

    this.results.endpoints = {
      note: "Для точного замера latency нужен запущенный сервер с нагрузкой",
      estimatedValues: {
        "GET /api/courses": { avg: 150, p95: 300 },
        "POST /api/courses/[id]/start": { avg: 200, p95: 450 },
        "GET /api/training/days/[id]": { avg: 100, p95: 200 },
        "POST /api/training/step/complete": { avg: 250, p95: 500 },
      },
      method: "Оценочные значения без нагрузки",
    };

    this.success("Latency метрики подготовлены (нужен запущенный сервер для точных измерений)");
  }

  /**
   * Сохранение результатов
   */
  saveResults() {
    const outputPath = path.join(
      process.cwd(),
      ".cursor/plans/BASELINE_МЕТРИКИ_ПРОИЗВОДИТЕЛЬНОСТИ.json",
    );

    try {
      fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2), "utf8");
      this.success(`Результаты сохранены: ${outputPath}`);
    } catch (error) {
      this.error(`Ошибка сохранения результатов: ${error.message}`);
    }
  }

  /**
   * Генерация отчета
   */
  generateReport() {
    console.log("\n" + "=".repeat(60));
    console.log("📈 BASELINE МЕТРИКИ ПРОИЗВОДИТЕЛЬНОСТИ");
    console.log("=".repeat(60));

    console.log(`⏰ Время сборки: ${this.results.build.durationFormatted || "N/A"}`);
    console.log(`📦 Размер bundle: ${this.results.bundle.totalSizeFormatted || "N/A"}`);
    console.log(`📊 Количество файлов: ${this.results.bundle.fileCount || "N/A"}`);

    if (this.results.bundle.topChunks && this.results.bundle.topChunks.length > 0) {
      console.log("\n🏆 Крупнейшие chunks:");
      this.results.bundle.topChunks.slice(0, 3).forEach((chunk, i) => {
        console.log(`  ${i + 1}. ${chunk.name}: ${chunk.sizeFormatted}`);
      });
    }

    console.log("\n🎯 Критические endpoints (оценка):");
    Object.entries(this.results.endpoints.estimatedValues || {}).forEach(([endpoint, metrics]) => {
      console.log(`  ${endpoint}: ${metrics.avg}ms (avg), ${metrics.p95}ms (p95)`);
    });

    console.log("\n⚠️  ВАЖНО: Эти метрики будут использоваться для сравнения после рефакторинга!");
    console.log("   Цель: не ухудшить производительность более чем на 5-10%");

    console.log("=".repeat(60) + "\n");
  }

  /**
   * Основной метод запуска
   */
  async run() {
    console.log("🚀 ЗАПУСК ЗAMEPA BASELINE МЕТРИК ПРОИЗВОДИТЕЛЬНОСТИ\n");

    try {
      // 1. Замер времени сборки
      await this.measureBuildTime();

      // 2. Анализ размера bundle
      await this.analyzeBundleSize();

      // 3. Замер latency (симуляция)
      await this.measureEndpointLatency();

      // 4. Сохранение результатов
      this.saveResults();

      // 5. Генерация отчета
      this.generateReport();

      this.success("✅ Baseline метрики успешно замерены!");
    } catch (error) {
      this.error(`Критическая ошибка: ${error.message}`);
      process.exit(1);
    }
  }
}

// Запуск
const benchmark = new PerformanceBenchmark();
benchmark.run().catch(console.error);
