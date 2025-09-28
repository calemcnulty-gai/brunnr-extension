/**
 * Lambda function to get video metadata for a specific lesson
 */

const { success, error } = require('../shared/response');

/**
 * Get video metadata from database or S3
 */
async function fetchVideoMetadata(lessonId) {
  // In production, this would query DynamoDB or S3 for lesson-specific videos
  // For MVP, return mock data based on lesson ID
  
  const baseUrl = process.env.VIDEO_BASE_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
  // Mock different videos for different lesson IDs
  const videos = {
    'default': {
      url: `${baseUrl}/grade4-multiplication-intro.mp4`,
      title: 'Mastery in a Minute: Introduction',
      duration: 60
    },
    'multiplication-basics': {
      url: `${baseUrl}/multiplication-basics.mp4`,
      title: 'Mastery in a Minute: Multiplication Basics',
      duration: 90
    },
    'times-tables': {
      url: `${baseUrl}/times-tables.mp4`,
      title: 'Mastery in a Minute: Times Tables',
      duration: 120
    }
  };
  
  return videos[lessonId] || videos['default'];
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  try {
    console.log('Get video metadata request:', JSON.stringify(event, null, 2));
    
    // Extract lesson ID from path parameters
    const lessonId = event.pathParameters?.lessonId;
    
    if (!lessonId) {
      return error('Lesson ID is required', 400);
    }
    
    console.log(`Fetching video metadata for lesson: ${lessonId}`);
    
    // Fetch video metadata
    const videoData = await fetchVideoMetadata(lessonId);
    
    // Generate signed URL if using private S3 bucket
    // For now, we're using public CloudFront URLs
    
    const response = {
      video_url: videoData.url,
      title: videoData.title,
      duration: videoData.duration,
      lesson_id: lessonId,
      // Could include auth headers for CloudFront signed URLs
      auth_headers: {},
      timestamp: new Date().toISOString()
    };
    
    console.log('Returning video metadata:', response);
    
    return success(response);
    
  } catch (err) {
    console.error('Error getting video metadata:', err);
    return error('Failed to get video metadata', 500, err.message);
  }
};
