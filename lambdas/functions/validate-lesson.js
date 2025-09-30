/**
 * Lambda function to validate if a lesson should show video
 * Updated: 2025-09-30
 */

import { success, error, parseBody, getUserIdentifier } from '../shared/response.js';

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
 */
function getVideoMetadata(lessonData, struggle) {
  const baseUrl = process.env.CLOUDFRONT_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
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
          topic: lessonData.topic
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
    
    console.log('Lesson eligible, returning video metadata');
    if (lessonData.struggle) {
      console.log('Struggle signal detected:', JSON.stringify(lessonData.struggle));
    }
    
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