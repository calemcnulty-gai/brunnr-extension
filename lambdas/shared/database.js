/**
 * Database connection utilities for RDS
 * Uses connection pooling optimized for Lambda
 */

const mysql = require('mysql2/promise');

let connectionPool = null;

/**
 * Get or create connection pool
 * Reuses connections across Lambda invocations in same container
 */
async function getConnectionPool() {
  if (!connectionPool) {
    connectionPool = mysql.createPool({
      host: process.env.RDS_HOST,
      port: process.env.RDS_PORT || 3306,
      user: process.env.RDS_USER,
      password: process.env.RDS_PASSWORD,
      database: process.env.RDS_DATABASE,
      
      // Lambda-optimized settings
      connectionLimit: 1,        // Lambda functions are single-threaded
      connectTimeout: 60000,     // 60 seconds
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      
      // Important for Lambda
      waitForConnections: true,
      queueLimit: 0,
      
      // Timezone
      timezone: '+00:00'
    });
    
    // Test connection
    try {
      const connection = await connectionPool.getConnection();
      await connection.ping();
      connection.release();
      console.log('Database connection pool established');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      connectionPool = null;
      throw error;
    }
  }
  
  return connectionPool;
}

/**
 * Execute a query with automatic connection management
 */
async function query(sql, params = []) {
  const pool = await getConnectionPool();
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Execute a transaction
 */
async function transaction(callback) {
  const pool = await getConnectionPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Store video engagement event
 */
async function storeEngagementEvent(event) {
  const sql = `
    INSERT INTO engagement_events (
      user_email,
      lesson_id,
      video_url,
      event_type,
      session_id,
      page_url,
      current_time,
      duration,
      playback_rate,
      volume,
      fullscreen,
      completion_percentage,
      ip_address,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;
  
  const params = [
    event.user,
    event.lesson_id,
    event.video_url,
    event.event_type,
    event.session_id,
    event.page_url,
    event.current_time || null,
    event.duration || null,
    event.playback_rate || 1.0,
    event.volume || 1.0,
    event.fullscreen || false,
    event.completion_percentage || 0,
    event.ip_address || null
  ];
  
  const result = await query(sql, params);
  return result.insertId;
}

/**
 * Store lesson performance metrics
 */
async function storePerformanceMetrics(metrics) {
  const sql = `
    INSERT INTO performance_metrics (
      user_email,
      lesson_id,
      session_id,
      time_on_lesson,
      completion_status,
      video_watched,
      video_completion_percentage,
      quiz_scores,
      quiz_attempts,
      example_attempts,
      performance_score,
      page_url,
      ip_address,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;
  
  const params = [
    metrics.user,
    metrics.lesson_id,
    metrics.session_id,
    metrics.time_on_lesson || 0,
    metrics.completion_status || 'started',
    metrics.video_watched || false,
    metrics.video_completion_percentage || 0,
    JSON.stringify(metrics.quiz_scores || []),
    metrics.quiz_attempts || 0,
    metrics.example_attempts || 0,
    metrics.performance_score || 0,
    metrics.page_url || null,
    metrics.ip_address || null
  ];
  
  const result = await query(sql, params);
  return result.insertId;
}

/**
 * Get user's lesson history
 */
async function getUserLessonHistory(userEmail, limit = 10) {
  const sql = `
    SELECT 
      lesson_id,
      MAX(completion_status) as status,
      MAX(video_completion_percentage) as video_progress,
      MAX(performance_score) as best_score,
      COUNT(DISTINCT session_id) as attempts,
      MAX(created_at) as last_accessed
    FROM performance_metrics
    WHERE user_email = ?
    GROUP BY lesson_id
    ORDER BY last_accessed DESC
    LIMIT ?
  `;
  
  return await query(sql, [userEmail, limit]);
}

/**
 * Get aggregated engagement stats for a lesson
 */
async function getLessonEngagementStats(lessonId) {
  const sql = `
    SELECT 
      COUNT(DISTINCT user_email) as unique_users,
      COUNT(DISTINCT session_id) as total_sessions,
      AVG(CASE WHEN event_type = 'ended' THEN completion_percentage ELSE NULL END) as avg_completion,
      COUNT(CASE WHEN event_type = 'play' THEN 1 ELSE NULL END) as play_count,
      COUNT(CASE WHEN event_type = 'ended' THEN 1 ELSE NULL END) as complete_count
    FROM engagement_events
    WHERE lesson_id = ?
    AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  `;
  
  const [stats] = await query(sql, [lessonId]);
  return stats;
}

/**
 * Batch insert events (more efficient for batch endpoint)
 */
async function batchInsertEvents(events, userEmail) {
  if (events.length === 0) return [];
  
  const sql = `
    INSERT INTO engagement_events (
      user_email,
      lesson_id,
      event_type,
      session_id,
      created_at
    ) VALUES ?
  `;
  
  const values = events.map(event => [
    userEmail,
    event.lessonId || event.lesson_id,
    event.eventType || event.event_type,
    event.sessionId || event.session_id,
    new Date(event.timestamp || Date.now())
  ]);
  
  const result = await query(sql, [values]);
  return result.affectedRows;
}

/**
 * Close connection pool (for Lambda container recycling)
 */
async function closeConnectionPool() {
  if (connectionPool) {
    await connectionPool.end();
    connectionPool = null;
    console.log('Database connection pool closed');
  }
}

module.exports = {
  getConnectionPool,
  query,
  transaction,
  storeEngagementEvent,
  storePerformanceMetrics,
  getUserLessonHistory,
  getLessonEngagementStats,
  batchInsertEvents,
  closeConnectionPool
};
