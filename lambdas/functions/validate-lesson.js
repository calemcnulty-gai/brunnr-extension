/**
 * Lambda function to validate if a lesson should show video
 * Updated: 2025-09-30
 * 
 * Phase 8: Now includes struggle logging to RDS for video pipeline integration
 */

import { success, error, parseBody, getUserIdentifier } from '../shared/response.js';

// Database module - imported dynamically to handle CommonJS/ES6 mix
let db = null;
async function getDb() {
  if (!db) {
    db = await import('../shared/database.js');
  }
  return db;
}

/**
 * Check if lesson is eligible for video
 */
function isEligibleLesson(lessonData) {
  const supportedGrades = (process.env.GRADE_LEVELS || '4').split(',').map(g => parseInt(g.trim()));
  const supportedTopics = (process.env.TOPICS || 'multiplication').toLowerCase().split(',').map(t => t.trim());
  
  // Check grade level
  if (lessonData.grade_level && !supportedGrades.includes(lessonData.grade_level)) {
    return false;
  }
  
  // Check topic
  if (lessonData.topic) {
    const topic = lessonData.topic.toLowerCase();
    const isSupported = supportedTopics.some(t => topic.includes(t));
    if (!isSupported) {
      return false;
    }
  }
  
  // Additional validation logic can go here
  // For example, check against a database of whitelisted lessons
  
  return true;
}

/**
 * Get video metadata for the lesson
 * If struggle signal is present, attempt to select a more specific video
 * 
 * FEATURE FLAG: ENABLE_STRUGGLE_SELECTION controls whether struggles affect video selection
 * - false (default): Always return default video (pilot mode)
 * - true: Use struggle-based selection (future mode)
 */
function getVideoMetadata(lessonData, struggle) {
  const baseUrl = process.env.CLOUDFRONT_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
  // FEATURE FLAG: Check if struggle-based selection is enabled
  const enableStruggleSelection = process.env.ENABLE_STRUGGLE_SELECTION === 'true';
  
  if (!enableStruggleSelection) {
    console.log('[Feature Flag] Struggle selection DISABLED - returning default video for all students');
    
    // Log struggle for analytics/pipeline but don't use for selection
    if (struggle && struggle.skill_tags && struggle.skill_tags.length > 0) {
      console.log('[Pipeline Data] Struggle detected but not used for selection:', struggle.skill_tags);
    }
    
    // Return default video for all students (TSA pilot mode)
    return {
      videoUrl: `${baseUrl}/grade4-multiplication-intro.mp4`,
      title: 'Mastery in a Minute: Multiplication',
      duration: 60,
      thumbnailUrl: `${baseUrl}/thumbnails/grade4-multiplication.jpg`,
      lessonId: lessonData.lesson_id,
      gradeLevel: lessonData.grade_level,
      topic: lessonData.topic,
      selectionMode: 'default-only' // Track which mode was used
    };
  }
  
  // STRUGGLE-BASED SELECTION ENABLED (feature flag ON)
  console.log('[Feature Flag] Struggle selection ENABLED - attempting targeted video matching');
  
  // If struggle signal present, try to match by skill tags
  if (struggle && struggle.skill_tags && struggle.skill_tags.length > 0) {
    console.log('Matching video by skill tags:', struggle.skill_tags);
    
    // Video mapping by skill tag (MVP: hardcoded)
    const videoMap = {
      'times-tables': {
        video: 'times-tables-advanced.mp4',
        title: 'Times Tables Mastery',
        duration: 90
      },
      'multiplication-7-8': {
        video: 'times-tables-7-8.mp4',
        title: '7 and 8 Times Tables',
        duration: 90
      },
      'multiplication-facts': {
        video: 'multiplication-facts.mp4',
        title: 'Multiplication Facts',
        duration: 120
      },
      'multiplication': {
        video: 'grade4-multiplication-intro.mp4',
        title: 'Multiplication Basics',
        duration: 60
      }
    };
    
    // Find first matching skill tag
    for (const tag of struggle.skill_tags) {
      if (videoMap[tag]) {
        const match = videoMap[tag];
        console.log(`Matched skill tag '${tag}' to video: ${match.video}`);
        return {
          videoUrl: `${baseUrl}/${match.video}`,
          title: `Mastery in a Minute: ${match.title}`,
          duration: match.duration,
          thumbnailUrl: `${baseUrl}/thumbnails/${tag}.jpg`,
          reason: struggle.question_text ? 
            `Student struggled: ${struggle.question_text.substring(0, 100)}` : 
            'Targeted recommendation based on struggle',
          confidence: 0.9,
          skillTags: struggle.skill_tags,
          lessonId: lessonData.lesson_id,
          gradeLevel: lessonData.grade_level,
          topic: lessonData.topic,
          selectionMode: 'struggle-based' // Track which mode was used
        };
      }
    }
    
    console.log('No exact match found for skill tags, using default video');
  }
  
  // Fall back to default topic-based video
  return {
    videoUrl: `${baseUrl}/grade4-multiplication-intro.mp4`,
    title: 'Mastery in a Minute',
    duration: 60,
    thumbnailUrl: `${baseUrl}/thumbnails/grade4-multiplication.jpg`,
    lessonId: lessonData.lesson_id,
    gradeLevel: lessonData.grade_level,
    topic: lessonData.topic,
    selectionMode: 'default-fallback' // Track which mode was used
  };
}

/**
 * Log struggle event to RDS for video generation pipeline
 * This runs ALWAYS, regardless of ENABLE_STRUGGLE_SELECTION flag
 * 
 * Graceful fallback: If RDS not configured or fails, logs to CloudWatch only
 */
async function logStruggleEvent(struggle, lessonData, userEmail) {
  // Validate struggle data
  if (!struggle || !struggle.skill_tags || struggle.skill_tags.length === 0) {
    console.log('[Pipeline] No struggle data to log');
    return;
  }
  
  // Check if RDS is configured
  if (!process.env.RDS_HOST) {
    console.log('[Pipeline] RDS not configured - struggle logged to CloudWatch only');
    console.log('[Pipeline Data]', JSON.stringify({
      user_email: userEmail || 'anonymous',
      lesson_id: lessonData.lesson_id,
      skill_tags: struggle.skill_tags,
      question_text: struggle.question_text,
      student_answer: struggle.student_answer,
      correct_answer: struggle.correct_answer,
      grade_level: lessonData.grade_level,
      topic: lessonData.topic
    }));
    return;
  }
  
  // Attempt to log to RDS
  try {
    console.log('[Pipeline] Logging struggle to RDS:', struggle.skill_tags);
    
    const database = await getDb();
    await database.query(`
      INSERT INTO struggle_events (
        user_email, lesson_id, question_id, question_text,
        student_answer, correct_answer, skill_tags,
        grade_level, topic, subject, page_url, session_id,
        generation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      userEmail || 'anonymous',
      lessonData.lesson_id || null,
      struggle.question_id || null,
      struggle.question_text || '',
      struggle.student_answer || '',
      struggle.correct_answer || '',
      JSON.stringify(struggle.skill_tags),
      lessonData.grade_level || null,
      lessonData.topic || null,
      lessonData.subject || 'math',
      lessonData.lesson_url || null,
      struggle.session_id || null
    ]);
    
    console.log('[Pipeline] ✓ Struggle logged to RDS successfully');
    
  } catch (err) {
    // Graceful degradation - don't fail the request if logging fails
    console.error('[Pipeline] Failed to log struggle to RDS (falling back to CloudWatch):', err.message);
    console.log('[Pipeline Data]', JSON.stringify({
      user_email: userEmail || 'anonymous',
      lesson_id: lessonData.lesson_id,
      skill_tags: struggle.skill_tags,
      question_text: struggle.question_text,
      error: err.message
    }));
  }
}

/**
 * Lambda handler
 */
export async function handler(event) {
  try {
    console.log('Validate lesson request:', JSON.stringify(event, null, 2));
    
    const body = parseBody(event);
    const userIdentifier = getUserIdentifier(body);
    
    if (!userIdentifier) {
      console.warn('No user identifier provided');
    }
    
    // Extract lesson data
    const lessonData = {
      lesson_id: body.lesson_id,
      lesson_url: body.lesson_url,
      lesson_title: body.lesson_title,
      grade_level: body.grade_level,
      subject: body.subject,
      topic: body.topic,
      struggle: body.struggle || null
    };
    
    console.log('Validating lesson:', lessonData);
    
    // Check if lesson is eligible
    const isEligible = isEligibleLesson(lessonData);
    
    if (!isEligible) {
      console.log('Lesson not eligible for video');
      return success({
        should_show_video: false,
        reason: 'Lesson does not meet criteria for video content'
      });
    }
    
    // Get video metadata
    const videoMetadata = getVideoMetadata(lessonData, lessonData.struggle);
    
    // ALWAYS log struggles to RDS/CloudWatch (regardless of feature flag)
    // This feeds the video generation pipeline
    if (lessonData.struggle) {
      console.log('Struggle signal detected:', JSON.stringify(lessonData.struggle));
      await logStruggleEvent(lessonData.struggle, lessonData, userIdentifier);
    }
    
    console.log('Lesson eligible, returning video metadata');
    
    return success({
      should_show_video: true,
      video_metadata: videoMetadata,
      user: userIdentifier
    });
    
  } catch (err) {
    console.error('Error validating lesson:', err);
    return error('Failed to validate lesson', 500, err.message);
  }
};