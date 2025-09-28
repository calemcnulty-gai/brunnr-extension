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

-- Grants for Lambda function user (adjust as needed)
-- CREATE USER IF NOT EXISTS 'lambda_user'@'%' IDENTIFIED BY 'secure_password';
-- GRANT SELECT, INSERT, UPDATE ON brunnr_analytics.* TO 'lambda_user'@'%';
-- GRANT EXECUTE ON brunnr_analytics.* TO 'lambda_user'@'%';
-- FLUSH PRIVILEGES;
