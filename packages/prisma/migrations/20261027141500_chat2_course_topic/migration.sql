-- User-created groups about courses are separate from system-managed COURSE rooms.
-- The existing COURSE entitlement gate remains unchanged.
ALTER TYPE "Chat2Kind" ADD VALUE IF NOT EXISTS 'COURSE_TOPIC';
