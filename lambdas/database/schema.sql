-- Brunnr Extension Analytics Database Schema
-- For MySQL/Aurora RDS

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS brunnr_analytics;
USE brunnr_analytics;

-- Engagement events table (video interactions)
CREATE TABLE IF NOT EXISTS engagement_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  lesson_id VARCHAR(100),
  video_url VARCHAR(500),
  event_type VARCHAR(50) NOT NULL, -- play, pause, seek, ended, error, etc.
  session_id VARCHAR(100),
  page_url VARCHAR(500),
  
  -- Video metrics
  current_time DECIMAL(10, 2),
  duration DECIMAL(10, 2),
  playback_rate DECIMAL(3, 2) DEFAULT 1.0,
  volume DECIMAL(3, 2) DEFAULT 1.0,
  fullscreen BOOLEAN DEFAULT FALSE,
  completion_percentage DECIMAL(5, 2),
  
  -- Metadata
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for common queries
  INDEX idx_user_email (user_email),
  INDEX idx_lesson_id (lesson_id),
  INDEX idx_session_id (session_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at),
  INDEX idx_user_lesson (user_email, lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Performance metrics table (lesson completion and quiz scores)
CREATE TABLE IF NOT EXISTS performance_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  lesson_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(100),
  
  -- Lesson metrics
  time_on_lesson INT, -- seconds
  completion_status ENUM('started', 'in_progress', 'completed', 'exited') DEFAULT 'started',
  
  -- Video metrics
  video_watched BOOLEAN DEFAULT FALSE,
  video_completion_percentage DECIMAL(5, 2),
  
  -- Quiz/Example metrics
  quiz_scores JSON, -- Array of scores
  quiz_attempts INT DEFAULT 0,
  example_attempts INT DEFAULT 0,
  performance_score INT, -- Calculated overall score (0-100)
  
  -- Metadata
  page_url VARCHAR(500),
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_user_email (user_email),
  INDEX idx_lesson_id (lesson_id),
  INDEX idx_session_id (session_id),
  INDEX idx_completion_status (completion_status),
  INDEX idx_created_at (created_at),
  INDEX idx_user_lesson_date (user_email, lesson_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lesson metadata table (cache lesson information)
CREATE TABLE IF NOT EXISTS lesson_metadata (
  lesson_id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255),
  grade_level INT,
  subject VARCHAR(50),
  topic VARCHAR(100),
  video_url VARCHAR(500),
  video_duration INT, -- seconds
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_grade_topic (grade_level, topic),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User profiles table (aggregate user data)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_email VARCHAR(255) PRIMARY KEY,
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  total_lessons_viewed INT DEFAULT 0,
  total_videos_watched INT DEFAULT 0,
  total_time_spent INT DEFAULT 0, -- seconds
  avg_performance_score DECIMAL(5, 2),
  
  -- Indexes
  INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily aggregates for reporting
CREATE TABLE IF NOT EXISTS daily_aggregates (
  date DATE NOT NULL,
  metric_type VARCHAR(50) NOT NULL, -- 'engagement', 'performance', 'users'
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(15, 2),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (date, metric_type, metric_name),
  INDEX idx_date (date),
  INDEX idx_metric_type (metric_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create views for common queries

-- User engagement summary
CREATE OR REPLACE VIEW user_engagement_summary AS
SELECT 
  user_email,
  COUNT(DISTINCT lesson_id) as lessons_viewed,
  COUNT(DISTINCT session_id) as total_sessions,
  COUNT(CASE WHEN event_type = 'play' THEN 1 END) as videos_played,
  COUNT(CASE WHEN event_type = 'ended' THEN 1 END) as videos_completed,
  AVG(CASE WHEN event_type = 'ended' THEN completion_percentage END) as avg_completion,
  MAX(created_at) as last_activity
FROM engagement_events
GROUP BY user_email;

-- Lesson performance summary
CREATE OR REPLACE VIEW lesson_performance_summary AS
SELECT 
  lesson_id,
  COUNT(DISTINCT user_email) as unique_users,
  AVG(performance_score) as avg_score,
  AVG(video_completion_percentage) as avg_video_completion,
  AVG(time_on_lesson) as avg_time_spent,
  COUNT(CASE WHEN completion_status = 'completed' THEN 1 END) as completions,
  COUNT(*) as total_attempts
FROM performance_metrics
GROUP BY lesson_id;

-- Stored procedures for common operations

DELIMITER $$

-- Update user profile after each event
CREATE PROCEDURE update_user_profile(IN p_user_email VARCHAR(255))
BEGIN
  INSERT INTO user_profiles (user_email, total_lessons_viewed, total_videos_watched, total_time_spent)
  SELECT 
    user_email,
    COUNT(DISTINCT lesson_id),
    COUNT(DISTINCT CASE WHEN video_watched THEN session_id END),
    SUM(time_on_lesson)
  FROM performance_metrics
  WHERE user_email = p_user_email
  GROUP BY user_email
  ON DUPLICATE KEY UPDATE
    last_seen = NOW(),
    total_lessons_viewed = VALUES(total_lessons_viewed),
    total_videos_watched = VALUES(total_videos_watched),
    total_time_spent = VALUES(total_time_spent);
END$$

-- Generate daily aggregates
CREATE PROCEDURE generate_daily_aggregates(IN p_date DATE)
BEGIN
  -- Delete existing aggregates for the date
  DELETE FROM daily_aggregates WHERE date = p_date;
  
  -- Insert engagement metrics
  INSERT INTO daily_aggregates (date, metric_type, metric_name, metric_value)
  SELECT 
    p_date,
    'engagement',
    'total_events',
    COUNT(*)
  FROM engagement_events
  WHERE DATE(created_at) = p_date;
  
  -- Insert performance metrics
  INSERT INTO daily_aggregates (date, metric_type, metric_name, metric_value)
  SELECT 
    p_date,
    'performance',
    'avg_score',
    AVG(performance_score)
  FROM performance_metrics
  WHERE DATE(created_at) = p_date;
  
  -- Insert user metrics
  INSERT INTO daily_aggregates (date, metric_type, metric_name, metric_value)
  SELECT 
    p_date,
    'users',
    'active_users',
    COUNT(DISTINCT user_email)
  FROM engagement_events
  WHERE DATE(created_at) = p_date;
END$$

DELIMITER ;

-- ============================================
-- PHASE 8: Video Generation Pipeline Tables
-- Added: 2025-09-30
-- Purpose: Support struggle detection and dynamic video catalog
-- ============================================

-- Track all student struggles for video generation pipeline
CREATE TABLE IF NOT EXISTS struggle_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_email VARCHAR(255),
  lesson_id VARCHAR(100),
  
  -- Struggle context
  question_id VARCHAR(100),
  question_text TEXT,
  student_answer VARCHAR(500),
  correct_answer VARCHAR(500),
  skill_tags JSON NOT NULL,
  
  -- Lesson context
  grade_level INT,
  topic VARCHAR(100),
  subject VARCHAR(50) DEFAULT 'math',
  
  -- Video generation tracking
  video_generated BOOLEAN DEFAULT FALSE,
  video_id VARCHAR(100),
  generation_status ENUM('pending', 'generating', 'ready', 'failed') DEFAULT 'pending',
  generation_requested_at TIMESTAMP NULL,
  generation_completed_at TIMESTAMP NULL,
  generation_error TEXT,
  
  -- Metadata
  page_url VARCHAR(500),
  session_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for fast pipeline queries
  INDEX idx_user_email (user_email),
  INDEX idx_lesson_id (lesson_id),
  INDEX idx_generation_status (generation_status),
  INDEX idx_pending_videos (video_generated, generation_status),
  INDEX idx_grade_topic (grade_level, topic),
  INDEX idx_created_at (created_at),
  
  -- Functional index for skill_tags (MySQL 8.0+)
  INDEX idx_skill_tags_array ((CAST(skill_tags AS CHAR(500) ARRAY)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Logs student struggles for video pipeline consumption';

-- Dynamic video catalog (replaces hardcoded videoMap in validate-lesson.js)
CREATE TABLE IF NOT EXISTS video_catalog (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  
  -- Video identification
  skill_tag VARCHAR(100) UNIQUE NOT NULL,
  video_url VARCHAR(500) NOT NULL,
  video_id VARCHAR(100) UNIQUE,
  
  -- Video metadata
  title VARCHAR(255),
  description TEXT,
  duration INT, -- seconds
  thumbnail_url VARCHAR(500),
  
  -- Categorization
  grade_level INT,
  topic VARCHAR(100),
  subject VARCHAR(50) DEFAULT 'math',
  difficulty_level ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
  
  -- Performance tracking
  is_active BOOLEAN DEFAULT TRUE,
  view_count INT DEFAULT 0,
  avg_completion_rate DECIMAL(5,2),
  avg_performance_improvement DECIMAL(5,2), -- % improvement after watching
  
  -- A/B testing support
  ab_test_variant VARCHAR(50), -- 'A', 'B', 'control', etc.
  ab_test_group_size INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_viewed_at TIMESTAMP NULL,
  
  -- Indexes
  INDEX idx_skill_tag (skill_tag),
  INDEX idx_video_id (video_id),
  INDEX idx_grade_topic (grade_level, topic),
  INDEX idx_active (is_active),
  INDEX idx_performance (avg_performance_improvement DESC),
  INDEX idx_subject_grade (subject, grade_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Dynamic video catalog - replaces hardcoded video mappings';

-- View: Pending video generation requests (for pipeline to consume)
CREATE OR REPLACE VIEW pending_video_requests AS
SELECT 
  JSON_UNQUOTE(JSON_EXTRACT(skill_tags, '$[0]')) as primary_skill_tag,
  skill_tags,
  COUNT(*) as struggle_count,
  MIN(created_at) as first_requested,
  MAX(created_at) as last_requested,
  grade_level,
  topic,
  subject,
  -- Priority calculation (more recent + more frequent = higher priority)
  COUNT(*) * (1 + DATEDIFF(NOW(), MIN(created_at))) as priority_score
FROM struggle_events
WHERE video_generated = FALSE 
  AND generation_status = 'pending'
GROUP BY skill_tags, grade_level, topic, subject
ORDER BY priority_score DESC, struggle_count DESC
LIMIT 100;

-- View: Video catalog performance summary
CREATE OR REPLACE VIEW video_performance_summary AS
SELECT 
  vc.skill_tag,
  vc.title,
  vc.video_url,
  vc.view_count,
  vc.avg_completion_rate,
  vc.avg_performance_improvement,
  COUNT(DISTINCT se.user_email) as students_who_struggled,
  COUNT(DISTINCT ee.user_email) as students_who_watched,
  ROUND(COUNT(DISTINCT ee.user_email) / COUNT(DISTINCT se.user_email) * 100, 2) as watch_rate_percentage
FROM video_catalog vc
LEFT JOIN struggle_events se ON JSON_CONTAINS(se.skill_tags, JSON_QUOTE(vc.skill_tag))
LEFT JOIN engagement_events ee ON ee.video_url = vc.video_url
WHERE vc.is_active = TRUE
GROUP BY vc.skill_tag, vc.title, vc.video_url, vc.view_count, vc.avg_completion_rate, vc.avg_performance_improvement;

-- Stored procedure: Log struggle event (called from Lambda)
DELIMITER $$

CREATE PROCEDURE log_struggle_event(
  IN p_user_email VARCHAR(255),
  IN p_lesson_id VARCHAR(100),
  IN p_question_id VARCHAR(100),
  IN p_question_text TEXT,
  IN p_student_answer VARCHAR(500),
  IN p_correct_answer VARCHAR(500),
  IN p_skill_tags JSON,
  IN p_grade_level INT,
  IN p_topic VARCHAR(100),
  IN p_subject VARCHAR(50),
  IN p_page_url VARCHAR(500),
  IN p_session_id VARCHAR(100)
)
BEGIN
  DECLARE v_struggle_count INT;
  
  -- Insert struggle event
  INSERT INTO struggle_events (
    user_email, lesson_id, question_id, question_text, 
    student_answer, correct_answer, skill_tags, 
    grade_level, topic, subject, page_url, session_id,
    generation_status
  ) VALUES (
    p_user_email, p_lesson_id, p_question_id, p_question_text,
    p_student_answer, p_correct_answer, p_skill_tags,
    p_grade_level, p_topic, p_subject, p_page_url, p_session_id,
    'pending'
  );
  
  -- Check if video generation should be triggered (threshold: 5+ struggles)
  SELECT COUNT(*) INTO v_struggle_count
  FROM struggle_events
  WHERE JSON_CONTAINS(skill_tags, p_skill_tags)
    AND video_generated = FALSE
    AND generation_status = 'pending';
  
  -- If threshold reached, mark for immediate generation
  IF v_struggle_count >= 5 THEN
    UPDATE struggle_events
    SET generation_status = 'generating',
        generation_requested_at = NOW()
    WHERE JSON_CONTAINS(skill_tags, p_skill_tags)
      AND generation_status = 'pending';
  END IF;
END$$

-- Stored procedure: Mark video as generated (called from pipeline webhook)
CREATE PROCEDURE mark_video_generated(
  IN p_skill_tag VARCHAR(100),
  IN p_video_id VARCHAR(100),
  IN p_video_url VARCHAR(500)
)
BEGIN
  -- Update all matching struggle events
  UPDATE struggle_events
  SET video_generated = TRUE,
      video_id = p_video_id,
      generation_status = 'ready',
      generation_completed_at = NOW()
  WHERE JSON_CONTAINS(skill_tags, JSON_QUOTE(p_skill_tag))
    AND video_generated = FALSE;
    
  -- Update or insert into video catalog
  INSERT INTO video_catalog (
    skill_tag, video_id, video_url, is_active
  ) VALUES (
    p_skill_tag, p_video_id, p_video_url, TRUE
  )
  ON DUPLICATE KEY UPDATE
    video_id = VALUES(video_id),
    video_url = VALUES(video_url),
    is_active = TRUE,
    updated_at = NOW();
END$$

DELIMITER ;

-- Grants for Lambda function user (adjust as needed)
-- CREATE USER IF NOT EXISTS 'lambda_user'@'%' IDENTIFIED BY 'secure_password';
-- GRANT SELECT, INSERT, UPDATE ON brunnr_analytics.* TO 'lambda_user'@'%';
-- GRANT EXECUTE ON brunnr_analytics.* TO 'lambda_user'@'%';
-- FLUSH PRIVILEGES;
