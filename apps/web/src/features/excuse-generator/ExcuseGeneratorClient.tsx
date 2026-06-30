"use client";

import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SendIcon from "@mui/icons-material/Send";
import { reportClientError } from "@gafus/error-handling";
import { useMemo, useState } from "react";

import { EXCUSE_SITUATIONS, type ExcuseSituationId } from "./situations";
import styles from "./excuse-generator.module.css";

interface GeneratedExcuse {
  excuse: string;
  plausibility: number;
  tone: string;
}

type ApiResponse =
  | {
      success: true;
      data: GeneratedExcuse;
    }
  | {
      success: false;
      error: string;
    };

const DEFAULT_SITUATION_ID: ExcuseSituationId = "late-work";

export function ExcuseGeneratorClient() {
  const [selectedSituationId, setSelectedSituationId] =
    useState<ExcuseSituationId>(DEFAULT_SITUATION_ID);
  const [result, setResult] = useState<GeneratedExcuse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const selectedSituation = useMemo(
    () =>
      EXCUSE_SITUATIONS.find((situation) => situation.id === selectedSituationId) ??
      EXCUSE_SITUATIONS[0],
    [selectedSituationId],
  );

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setCopyState("idle");

    try {
      const response = await fetch("/api/excuses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ situationId: selectedSituationId }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.success ? "Не удалось сгенерировать отмазку." : payload.error);
        return;
      }

      setResult(payload.data);
    } catch (err) {
      reportClientError(err, {
        issueKey: "ExcuseGenerator",
        keys: { operation: "generate_excuse", situationId: selectedSituationId },
      });
      setError("Не удалось связаться с генератором. Попробуйте ещё раз.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result.excuse);
      setCopyState("copied");
    } catch (err) {
      reportClientError(err, {
        issueKey: "ExcuseGenerator",
        keys: { operation: "copy_excuse" },
      });
      setCopyState("failed");
    }
  }

  return (
    <div className={styles.pageShell}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>GAFUS labs</p>
          <h1>Генератор отмазок</h1>
          <p className={styles.lead}>
            Выберите ситуацию, получите готовый текст и оценку правдоподобности.
          </p>
        </div>
        <div className={styles.visualPanel} aria-hidden="true">
          <div className={styles.noteStack}>
            <span />
            <span />
            <span />
          </div>
          <div className={styles.messageBubble}>сейчас всё объясню</div>
        </div>
      </section>

      <section className={styles.workspace} aria-label="Генератор отмазок">
        <div className={styles.situationColumn}>
          <div className={styles.sectionHeader}>
            <span>Ситуация</span>
            <strong>{EXCUSE_SITUATIONS.length}</strong>
          </div>
          <div className={styles.situationGrid}>
            {EXCUSE_SITUATIONS.map((situation) => (
              <button
                className={
                  situation.id === selectedSituationId
                    ? `${styles.situationButton} ${styles.situationButtonActive}`
                    : styles.situationButton
                }
                key={situation.id}
                onClick={() => {
                  setSelectedSituationId(situation.id);
                  setCopyState("idle");
                }}
                type="button"
              >
                <span>{situation.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.selectedContext}>
            <span>{selectedSituation.label}</span>
            <p>{selectedSituation.description}</p>
          </div>

          <button
            className={styles.generateButton}
            disabled={isGenerating}
            onClick={handleGenerate}
            type="button"
          >
            <AutoFixHighIcon fontSize="small" />
            {isGenerating ? "Генерирую..." : "Сгенерировать"}
          </button>
        </div>

        <div className={styles.resultColumn}>
          <div className={styles.sectionHeader}>
            <span>Готовый текст</span>
          </div>

          {error ? <div className={styles.errorBox}>{error}</div> : null}

          <div className={styles.resultBox}>
            {result ? (
              <>
                <p className={styles.excuseText}>{result.excuse}</p>
                <div className={styles.metricsRow}>
                  <div className={styles.metric}>
                    <span>Правдоподобность</span>
                    <div className={styles.meterTrack}>
                      <div
                        className={styles.meterFill}
                        style={{ width: `${result.plausibility}%` }}
                      />
                    </div>
                  </div>
                  <div className={styles.toneGroup}>
                    <span>Тон сообщения</span>
                    <div className={styles.toneBadge}>{result.tone}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>
                <SendIcon fontSize="large" />
                <p>Здесь появится отмазка после генерации.</p>
              </div>
            )}
          </div>

          <button
            className={styles.copyButton}
            disabled={!result}
            onClick={handleCopy}
            type="button"
          >
            <ContentCopyIcon fontSize="small" />
            {copyState === "copied"
              ? "Скопировано"
              : copyState === "failed"
                ? "Не удалось скопировать"
                : "Скопировать и отправить боссу"}
          </button>
        </div>
      </section>
    </div>
  );
}
