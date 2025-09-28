/**
 * Lambda function to validate if a lesson should show video
 */

import { Config } from "sst/node/config";
const { success, error, parseBody, getUserIdentifier } = require('../shared/response');

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
 */
function getVideoMetadata(lessonData) {
  // In production, this could query a database or S3 for lesson-specific videos
  // For now, return a default video
  
  // Use SST Config to get CloudFront URL
  const baseUrl = Config.CLOUDFRONT_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
  return {
    videoUrl: `${baseUrl}/grade4-multiplication-intro.mp4`,
    title: 'Mastery in a Minute',
    duration: 60, // seconds
    thumbnailUrl: `${baseUrl}/thumbnails/grade4-multiplication.jpg`,
    // Could include lesson-specific metadata
    lessonId: lessonData.lesson_id,
    gradeLevel: lessonData.grade_level,
    topic: lessonData.topic
  };
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
      topic: body.topic
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
    const videoMetadata = getVideoMetadata(lessonData);
    
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
}