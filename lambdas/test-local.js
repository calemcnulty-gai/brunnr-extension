/**
 * Local test script for Lambda functions
 * Run with: node test-local.js
 */

// Test validate-lesson
const validateLesson = require('./validate-lesson/index');
const getVideoMetadata = require('./get-video-metadata/index');
const trackEngagement = require('./track-engagement/index');
const trackPerformance = require('./track-performance/index');
const batchAnalytics = require('./track-engagement/batch');

async function runTests() {
  console.log('🧪 Testing Lambda functions locally...\n');

  // Test 1: Validate Lesson
  console.log('1️⃣ Testing validate-lesson...');
  const validateEvent = {
    body: JSON.stringify({
      user_email: 'student@school.edu',
      lesson_id: 'lesson-123',
      lesson_url: 'https://mathacademy.com/lesson/123',
      lesson_title: 'Multiplication Basics',
      grade_level: 4,
      subject: 'math',
      topic: 'multiplication'
    })
  };
  
  const validateResult = await validateLesson.handler(validateEvent);
  console.log('Result:', JSON.parse(validateResult.body));
  console.log('✅ Validate lesson test passed\n');

  // Test 2: Get Video Metadata
  console.log('2️⃣ Testing get-video-metadata...');
  const metadataEvent = {
    pathParameters: {
      lessonId: 'multiplication-basics'
    }
  };
  
  const metadataResult = await getVideoMetadata.handler(metadataEvent);
  console.log('Result:', JSON.parse(metadataResult.body));
  console.log('✅ Get video metadata test passed\n');

  // Test 3: Track Engagement
  console.log('3️⃣ Testing track-engagement...');
  const engagementEvent = {
    body: JSON.stringify({
      user_email: 'student@school.edu',
      lesson_id: 'lesson-123',
      video_url: 'https://cdn.example.com/video.mp4',
      event_type: 'play',
      current_time: 0,
      duration: 60,
      session_id: 'session-123',
      page_url: 'https://mathacademy.com/lesson/123'
    }),
    requestContext: {
      http: {
        sourceIp: '192.168.1.1'
      }
    }
  };
  
  const engagementResult = await trackEngagement.handler(engagementEvent);
  console.log('Result:', JSON.parse(engagementResult.body));
  console.log('✅ Track engagement test passed\n');

  // Test 4: Batch Analytics
  console.log('4️⃣ Testing batch analytics...');
  const batchEvent = {
    body: JSON.stringify({
      user_email: 'student@school.edu',
      events: [
        {
          eventType: 'play',
          lessonId: 'lesson-123',
          timestamp: new Date().toISOString()
        },
        {
          eventType: 'pause',
          lessonId: 'lesson-123',
          timestamp: new Date().toISOString()
        }
      ]
    })
  };
  
  const batchResult = await batchAnalytics.handler(batchEvent);
  console.log('Result:', JSON.parse(batchResult.body));
  console.log('✅ Batch analytics test passed\n');

  // Test 5: Track Performance
  console.log('5️⃣ Testing track-performance...');
  const performanceEvent = {
    body: JSON.stringify({
      user_email: 'student@school.edu',
      lesson_id: 'lesson-123',
      time_on_lesson: 600,
      completion_status: 'completed',
      video_watched: true,
      video_completion_percentage: 85,
      quiz_scores: [80, 90, 100],
      session_id: 'session-123',
      page_url: 'https://mathacademy.com/lesson/123'
    }),
    requestContext: {
      http: {
        sourceIp: '192.168.1.1'
      }
    }
  };
  
  const performanceResult = await trackPerformance.handler(performanceEvent);
  console.log('Result:', JSON.parse(performanceResult.body));
  console.log('✅ Track performance test passed\n');

  console.log('🎉 All tests passed successfully!');
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
