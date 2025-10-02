"use client";

import { useState, useRef } from "react";
import { Button, Card, CardContent, Typography, Alert, Box, CircularProgress } from "@mui/material";
import { VideoCameraFront, Stop, PlayArrow } from "@mui/icons-material";
import { submitExamResult } from "@/shared/lib/actions/submitExamResult";

interface VideoReportProps {
  userStepId: string;
  stepId: string;
  onComplete: (videoBlob: Blob) => void;
  onReset: () => void;
}

export function VideoReport({ userStepId, stepId, onComplete, onReset }: VideoReportProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: BlobPart[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedVideo(videoUrl);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Ошибка при запуске записи:', error);
      alert('Не удалось получить доступ к камере. Проверьте разрешения.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleSubmit = async () => {
    if (!recordedVideo) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Создаем Blob из записанного видео
      const response = await fetch(recordedVideo);
      const blob = await response.blob();
      
      // В реальном приложении здесь нужно загрузить видео на сервер
      // и получить URL. Для демонстрации используем временный URL
      const videoUrl = recordedVideo; // В реальности это будет URL загруженного файла
      
      await submitExamResult({
        userStepId,
        stepId,
        videoReportUrl: videoUrl,
        overallScore: 100, // Видео отчёт считается выполненным
        isPassed: true
      });
      
      onComplete(blob);
      setIsSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Ошибка при сохранении видео отчёта");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    if (recordedVideo) {
      URL.revokeObjectURL(recordedVideo);
    }
    setRecordedVideo(null);
    setIsSubmitted(false);
    setIsRecording(false);
    setSubmitError(null);
    onReset();
  };

  return (
    <div style={{ padding: "16px" }}>
      <Typography variant="h6" gutterBottom>
        Видео отчёт о работе
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Запишите видео, где вы рассказываете о пройденном материале, 
        демонстрируете выполнение упражнений или делитесь своими мыслями.
      </Typography>

      <Card>
        <CardContent>
          {!recordedVideo ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                style={{ 
                  width: "100%", 
                  maxWidth: "400px", 
                  height: "auto",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "8px"
                }}
              />
              
              <Box sx={{ mt: 2 }}>
                {!isRecording ? (
                  <Button
                    variant="contained"
                    startIcon={<VideoCameraFront />}
                    onClick={startRecording}
                    size="large"
                  >
                    Начать запись
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<Stop />}
                    onClick={stopRecording}
                    size="large"
                  >
                    Остановить запись
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: "center" }}>
              <video
                src={recordedVideo}
                controls
                style={{ 
                  width: "100%", 
                  maxWidth: "400px", 
                  height: "auto",
                  borderRadius: "8px"
                }}
              />
              
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={isSubmitting ? <CircularProgress size={20} /> : <PlayArrow />}
                  onClick={handleSubmit}
                  disabled={isSubmitted || isSubmitting}
                  sx={{ mr: 1 }}
                >
                  {isSubmitting ? "Сохранение..." : "Отправить видео"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleReset}
                >
                  Записать заново
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {submitError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {submitError}
        </Alert>
      )}
      
      {isSubmitted && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Видео отчёт успешно отправлен!
        </Alert>
      )}
    </div>
  );
}
