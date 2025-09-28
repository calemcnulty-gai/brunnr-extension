/**
 * Lambda function to track lesson performance analytics
 */

const { success, error, parseBody, getUserIdentifier } = require('../shared/response');
const db = require('../shared/database');

/**
 * Store performance metrics
 */
async function storePerformanceMetrics(metrics) {
  // Calculate performance score
  const performanceScore = calculatePerformanceScore(metrics);
  metrics.performance_score = performanceScore;
  
  // Try to store in RDS if configured
  if (process.env.RDS_HOST) {
    try {
      const metricId = await db.storePerformanceMetrics(metrics);
      console.log(`Performance metrics stored in RDS with ID: ${metricId}`);
      
      // Update user profile
      await db.query(
        'CALL update_user_profile(?)',
        [metrics.user]
      );
      
      return {
        success: true,
        performance_score: performanceScore,
        metricId
      };
    } catch (dbError) {
      console.error('Failed to store in RDS, falling back to logs:', dbError);
    }
  }
  
  // Fallback: log the metrics
  console.log('PERFORMANCE_METRICS:', JSON.stringify({
    user: metrics.user,
    lesson_id: metrics.lesson_id,
    completion_status: metrics.completion_status,
    time_on_lesson: metrics.time_on_lesson,
    video_metrics: {
      watched: metrics.video_watched,
      completion: metrics.video_completion_percentage
    },
    quiz_performance: {
      scores: metrics.quiz_scores,
      attempts: metrics.quiz_attempts
    },
    performance_score: performanceScore
  }));
  
  return {
    success: true,
    performance_score: performanceScore
  };
}

/**
 * Calculate a performance score based on various metrics
 */
function calculatePerformanceScore(metrics) {
  let score = 0;
  let weights = 0;
  
  // Video completion (30% weight)
  if (metrics.video_completion_percentage !== undefined) {
    score += (metrics.video_completion_percentage / 100) * 30;
    weights += 30;
  }
  
  // Quiz scores (40% weight)
  if (metrics.quiz_scores && Array.isArray(metrics.quiz_scores)) {
    const avgQuizScore = metrics.quiz_scores.reduce((a, b) => a + b, 0) / metrics.quiz_scores.length;
    score += (avgQuizScore / 100) * 40;
    weights += 40;
  }
  
  // Time on lesson (10% weight - normalized to 10 minutes as optimal)
  if (metrics.time_on_lesson) {
    const optimalTime = 600; // 10 minutes in seconds
    const timeScore = Math.min(metrics.time_on_lesson / optimalTime, 1);
    score += timeScore * 10;
    weights += 10;
  }
  
  // Completion status (20% weight)
  if (metrics.completion_status === 'completed') {
    score += 20;
    weights += 20;
  } else if (metrics.completion_status === 'in_progress') {
    score += 10;
    weights += 20;
  }
  
  // Normalize score
  return weights > 0 ? Math.round((score / weights) * 100) : 0;
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  try {
    console.log('Track performance request:', JSON.stringify(event, null, 2));
    
    const body = parseBody(event);
    const userIdentifier = getUserIdentifier(body);
    
    if (!userIdentifier) {
      return error('User identifier is required', 400);
    }
    
    if (!body.lesson_id) {
      return error('Lesson ID is required', 400);
    }
    
    // Create performance metrics object
    const performanceMetrics = {
      user: userIdentifier,
      lesson_id: body.lesson_id,
      session_id: body.session_id,
      page_url: body.page_url,
      
      // Lesson metrics
      time_on_lesson: body.time_on_lesson,
      completion_status: body.completion_status,
      
      // Video metrics
      video_watched: body.video_watched,
      video_completion_percentage: body.video_completion_percentage,
      
      // Quiz/Example metrics
      quiz_scores: body.quiz_scores,
      quiz_attempts: body.quiz_attempts || (body.quiz_scores ? body.quiz_scores.length : 0),
      example_attempts: body.example_attempts,
      
      // Timestamps
      timestamp: body.timestamp || new Date().toISOString(),
      received_at: new Date().toISOString(),
      
      // System metadata
      ip_address: event.requestContext?.http?.sourceIp
    };
    
    // Store the metrics
    const result = await storePerformanceMetrics(performanceMetrics);
    
    console.log(`Performance metrics stored for user ${userIdentifier}, score: ${result.performance_score}`);
    
    return success({
      success: true,
      message: 'Performance metrics tracked successfully',
      performance_score: result.performance_score,
      metrics_id: `${body.session_id}_${body.lesson_id}_${Date.now()}`
    });
    
  } catch (err) {
    console.error('Error tracking performance:', err);
    return error('Failed to track performance', 500, err.message);
  }
};
