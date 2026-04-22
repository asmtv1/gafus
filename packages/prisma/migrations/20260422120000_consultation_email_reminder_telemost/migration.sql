-- Новые типы писем: сбой Телемоста, напоминания за 30 мин.
ALTER TYPE "ConsultationEmailType" ADD VALUE 'CLIENT_BOOKING_TELEMOST_FAILED';
ALTER TYPE "ConsultationEmailType" ADD VALUE 'CLIENT_CONSULTATION_REMINDER_30M';
ALTER TYPE "ConsultationEmailType" ADD VALUE 'TRAINER_CONSULTATION_REMINDER_30M';
