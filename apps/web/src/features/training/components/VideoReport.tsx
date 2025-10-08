"use client";

import { useState, useRef, useEffect } from "react";
import { Button, Card, CardContent, Typography, Alert, Box, CircularProgress } from "@mui/material";
import { VideoCameraFront, Stop, CloudUpload } from "@mui/icons-material";
import { submitExamResult } from "@/shared/lib/actions/submitExamResult";
import { getExamResult } from "@/shared/lib/actions/getExamResult";
import { uploadExamVideo } from "@/shared/lib/actions/uploadExamVideo";

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
  const [isLoading, setIsLoading] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoSize, setVideoSize] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const maxRecordingTime = 120; // 2 минуты в секундах

  // Загружаем существующее видео при монтировании компонента
  useEffect(() => {
    async function loadExistingData() {
      try {
        const examResult = await getExamResult(userStepId);
        if (examResult?.videoReportUrl) {
          setRecordedVideo(examResult.videoReportUrl);
          setIsSubmitted(true);
        }
      } catch (error) {
        console.error("Ошибка при загрузке данных экзамена:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadExistingData();
  }, [userStepId]);

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

      // Настройки для оптимального сжатия видео
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9', // VP9 - лучшее сжатие
        videoBitsPerSecond: 500000, // 500 kbps - хорошее качество при небольшом размере
        audioBitsPerSecond: 64000   // 64 kbps для аудио
      };
      
      // Проверяем поддержку VP9, если нет - используем VP8
      let finalOptions = options;
      if (!MediaRecorder.isTypeSupported(options.mimeType || '')) {
        finalOptions = {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 500000,
          audioBitsPerSecond: 64000
        };
      }
      
      const mediaRecorder = new MediaRecorder(stream, finalOptions);
      mediaRecorderRef.current = mediaRecorder;
      
      recordedChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        recordedChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedVideo(videoUrl);
        setVideoSize(blob.size);
        setRecordingTime(0);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Запускаем таймер для отсчета времени записи
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          // Автоматически останавливаем запись через 2 минуты
          if (newTime >= maxRecordingTime) {
            stopRecording();
            return maxRecordingTime;
          }
          return newTime;
        });
      }, 1000);
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
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Очистка таймера при размонтировании компонента
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleSubmit = async () => {
    if (!recordedVideo) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Создаем Blob из записанного видео
      const response = await fetch(recordedVideo);
      const blob = await response.blob();
      
      // Создаем File объект из Blob для загрузки на CDN
      const fileName = `exam-video-${Date.now()}.webm`;
      const videoFile = new File([blob], fileName, { type: blob.type });
      
      // Загружаем видео на CDN через FormData
      const formData = new FormData();
      formData.append("video", videoFile);
      
      const uploadResult = await uploadExamVideo(formData);
      
      if (!uploadResult.success || !uploadResult.videoUrl) {
        throw new Error(uploadResult.error || "Не удалось загрузить видео на сервер");
      }
      
      // Сохраняем результат экзамена с реальным CDN URL
      await submitExamResult({
        userStepId,
        stepId,
        videoReportUrl: uploadResult.videoUrl,
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
    setRecordingTime(0);
    setVideoSize(0);
    recordedChunksRef.current = [];
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onReset();
  };

  // Форматирование времени в MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Форматирование размера файла
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // Показываем индикатор загрузки
  if (isLoading) {
    return (
      <div style={{ padding: "16px", textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Загрузка данных...
        </Typography>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <Typography variant="h6" gutterBottom>
        Видео отчёт о работе
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Запишите видео, где вы рассказываете о пройденном материале, 
        демонстрируете выполнение упражнений или делитесь своими мыслями.
      </Typography>

      {isSubmitted && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Ваш видео отчёт сохранен. Ожидайте проверки тренером.
        </Alert>
      )}

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
                {isRecording && (
                  <Box sx={{ mb: 2 }}>
                    <Typography 
                      variant="h5" 
                      sx={{ 
                        fontFamily: 'monospace',
                        color: recordingTime >= maxRecordingTime * 0.9 ? 'error.main' : 'primary.main'
                      }}
                    >
                      {formatTime(recordingTime)} / {formatTime(maxRecordingTime)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Максимальная длительность: 2 минуты
                    </Typography>
                  </Box>
                )}
                
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
              
              {videoSize > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  Размер видео: {formatSize(videoSize)}
                  {videoSize > 50 * 1024 * 1024 && " ⚠️ Большой файл, загрузка может занять время"}
                </Typography>
              )}
              
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <CloudUpload />}
                  onClick={handleSubmit}
                  disabled={isSubmitted || isSubmitting}
                  sx={{ mr: 1 }}
                >
                  {isSubmitting ? "Загрузка на сервер..." : "Отправить видео"}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleReset}
                  disabled={isSubmitting}
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
