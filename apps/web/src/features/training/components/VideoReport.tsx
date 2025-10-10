"use client";

import { useState, useRef, useEffect } from "react";
import { Button, Card, CardContent, Typography, Alert, Box, CircularProgress } from "@mui/material";
import { VideoCameraFront, Stop, CloudUpload, CloudDone } from "@mui/icons-material";
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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoSize, setVideoSize] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recordedVideoRef = useRef<HTMLVideoElement | null>(null);
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
          // Для существующих видео с CDN URL просто отмечаем как отправленные
          // Не устанавливаем recordedVideo, чтобы не показывать CDN URL в preview
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

      // Настройки для оптимального сжатия видео (уменьшенный битрейт для меньшего размера)
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9', // VP9 - лучшее сжатие
        videoBitsPerSecond: 300000, // 300 kbps - уменьшен для меньшего размера файла
        audioBitsPerSecond: 48000   // 48 kbps для аудио (уменьшен)
      };
      
      // Проверяем поддержку VP9, если нет - используем VP8
      let finalOptions = options;
      if (!MediaRecorder.isTypeSupported(options.mimeType || '')) {
        finalOptions = {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 300000, // 300 kbps для VP8
          audioBitsPerSecond: 48000   // 48 kbps для аудио
        };
      }
      
      const mediaRecorder = new MediaRecorder(stream, finalOptions);
      mediaRecorderRef.current = mediaRecorder;
      
      recordedChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        if (recordedChunksRef.current.length === 0) {
          console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Нет записанных chunks!');
          alert('Ошибка: не удалось записать видео. Попробуйте еще раз.');
          return;
        }
        
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        
        if (blob.size === 0) {
          console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Blob пустой!');
          alert('Ошибка: записанное видео пустое. Попробуйте еще раз.');
          return;
        }
        
        const videoUrl = URL.createObjectURL(blob);
        
        // ПРЯМАЯ установка через DOM для корректного отображения видео
        if (recordedVideoRef.current) {
          recordedVideoRef.current.src = videoUrl;
          recordedVideoRef.current.load();
          
          setRecordedVideo(videoUrl);
          setVideoSize(blob.size);
          setRecordingTime(0);
        } else {
          console.error('❌ recordedVideoRef.current is null!');
        }
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
      
      mediaRecorder.start(1000); // Записываем chunks каждую секунду (как в HTML тесте)
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
    setUploadProgress(null);
    
    try {
      // Создаем Blob из записанного видео
      const response = await fetch(recordedVideo);
      const blob = await response.blob();
      
      // Проверяем размер файла (максимум 50MB)
      const maxFileSize = 50 * 1024 * 1024; // 50MB
      if (blob.size > maxFileSize) {
        throw new Error(`Размер видео (${(blob.size / 1024 / 1024).toFixed(1)}MB) превышает максимально допустимый (50MB). Попробуйте записать видео короче.`);
      }
      
      // Создаем File объект из Blob для загрузки на CDN
      const fileName = `exam-video-${Date.now()}.webm`;
      const videoFile = new File([blob], fileName, { type: blob.type });
      
      // Показываем статус загрузки на CDN
      setUploadProgress("Загружаем видео на сервер... Это может занять несколько секунд.");
      
      // Загружаем видео на CDN через FormData (одиночная загрузка)
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("userStepId", userStepId); // Для удаления старого видео
      
      const uploadResult = await uploadExamVideo(formData);
      
      if (!uploadResult.success || !uploadResult.videoUrl) {
        throw new Error(uploadResult.error || "Не удалось загрузить видео на сервер");
      }
      
      // Показываем статус сохранения результата
      setUploadProgress("Сохраняем результат экзамена...");
      
      // Сохраняем результат экзамена с реальным CDN URL
      await submitExamResult({
        userStepId,
        stepId,
        videoReportUrl: uploadResult.videoUrl,
        overallScore: 100, // Видео отчёт считается выполненным
        isPassed: true
      });
      
      // Очищаем прогресс и устанавливаем успешное состояние
      setUploadProgress(null);
      setSubmitError(null);
      onComplete(blob);
      setIsSubmitted(true);
    } catch (error) {
      setUploadProgress(null);
      // Проверяем, не был ли запрос прерван
      if (error instanceof Error && error.name === 'AbortError') {
        setSubmitError("Загрузка прервана. Попробуйте еще раз.");
      } else {
        setSubmitError(error instanceof Error ? error.message : "Ошибка при сохранении видео отчёта");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
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
    
    // Если видео было отправлено, нужно удалить его из базы данных
    if (isSubmitted) {
      try {
        await submitExamResult({
          userStepId,
          stepId,
          videoReportUrl: undefined,
          overallScore: undefined,
          isPassed: false
        });
      } catch (error) {
        console.error("Ошибка при сбросе видео:", error);
        setSubmitError("Ошибка при сбросе видео. Попробуйте еще раз.");
      }
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

  // Примечание: установка src теперь происходит напрямую в mediaRecorder.onstop

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

      {/* Скрытый video элемент для записанного видео - ВСЕГДА в DOM */}
      <video
        ref={recordedVideoRef}
        controls
        playsInline
        preload="auto"
        onError={(e) => console.error('❌ Ошибка видео:', e)}
        style={{ 
          display: !isSubmitted && recordedVideo ? "block" : "none",
          width: "100%", 
          maxWidth: "400px", 
          minHeight: "300px",
          height: "auto",
          borderRadius: "8px",
          backgroundColor: "#000",
          margin: "0 auto"
        }}
      />

      <Card>
        <CardContent>
          {isSubmitted ? (
            // Состояние: видео уже отправлено
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Box sx={{ 
                width: "100%", 
                maxWidth: "400px", 
                height: "225px",
                backgroundColor: "#f5f5f5",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto"
              }}>
                <Box sx={{ textAlign: "center" }}>
                  <CloudDone sx={{ fontSize: 48, color: "success.main", mb: 1 }} />
                  <Typography variant="h6" color="success.main">
                    Видео отправлено
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ожидайте проверки тренером
                  </Typography>
                </Box>
              </Box>
              
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleReset}
                  startIcon={<VideoCameraFront />}
                >
                  Записать заново
                </Button>
              </Box>
            </Box>
          ) : !recordedVideo ? (
            // Состояние: запись не начата
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
            // Состояние: видео записано, но не отправлено
            <Box sx={{ textAlign: "center" }}>
              {/* Видео элемент вынесен наверх, перед Card */}
              
              {/* Альтернативный способ отображения для отладки */}
              <Box sx={{ mt: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Debug info:
                </Typography>
                <Typography variant="caption" display="block">
                  URL: {recordedVideo?.substring(0, 80)}...
                </Typography>
                <Typography variant="caption" display="block">
                  Размер: {videoSize} байт
                </Typography>
                
                {/* Ссылка для скачивания blob */}
                {recordedVideo && (
                  <Box sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      component="a"
                      href={recordedVideo}
                      download="recorded-video.webm"
                    >
                      Скачать видео
                    </Button>
                  </Box>
                )}
              </Box>
              
              {videoSize > 0 && (
                <Typography 
                  variant="caption" 
                  color={videoSize > 50 * 1024 * 1024 ? "error" : "text.secondary"} 
                  sx={{ display: "block", mt: 1 }}
                >
                  Размер видео: {formatSize(videoSize)}
                  {videoSize > 50 * 1024 * 1024 && " ⚠️ Превышен лимит 50MB - загрузка будет заблокирована"}
                </Typography>
              )}
              
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <CloudUpload />}
                  onClick={handleSubmit}
                  disabled={isSubmitting || videoSize > 50 * 1024 * 1024}
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

      {uploadProgress && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {uploadProgress}
        </Alert>
      )}
      
      {submitError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {submitError}
        </Alert>
      )}
      
      {isSubmitted && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Видео отчёт успешно отправлен и сохранён. Ожидайте проверки тренером.
        </Alert>
      )}
    </div>
  );
}
