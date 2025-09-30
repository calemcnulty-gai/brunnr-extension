/**
 * Test script for feature flag functionality
 * Run: node test-feature-flag.js
 */

// Mock the environment
process.env.CLOUDFRONT_URL = 'https://d2zhlpwgezwmiu.cloudfront.net';

// Test both flag states
const testCases = [
  {
    name: 'Flag OFF - with struggle',
    env: { ENABLE_STRUGGLE_SELECTION: 'false' },
    lessonData: { lesson_id: '2416', grade_level: 4, topic: 'multiplication' },
    struggle: { skill_tags: ['multiplication-7-8'], question_text: 'What is 7 × 8?' }
  },
  {
    name: 'Flag OFF - no struggle',
    env: { ENABLE_STRUGGLE_SELECTION: 'false' },
    lessonData: { lesson_id: '2416', grade_level: 4, topic: 'multiplication' },
    struggle: null
  },
  {
    name: 'Flag ON - with struggle',
    env: { ENABLE_STRUGGLE_SELECTION: 'true' },
    lessonData: { lesson_id: '2416', grade_level: 4, topic: 'multiplication' },
    struggle: { skill_tags: ['multiplication-7-8'], question_text: 'What is 7 × 8?' }
  },
  {
    name: 'Flag ON - no struggle',
    env: { ENABLE_STRUGGLE_SELECTION: 'true' },
    lessonData: { lesson_id: '2416', grade_level: 4, topic: 'multiplication' },
    struggle: null
  }
];

// Inline getVideoMetadata function (copy from validate-lesson.js)
function getVideoMetadata(lessonData, struggle) {
  const baseUrl = process.env.CLOUDFRONT_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
  const enableStruggleSelection = process.env.ENABLE_STRUGGLE_SELECTION === 'true';
  
  if (!enableStruggleSelection) {
    console.log('[Feature Flag] Struggle selection DISABLED');
    if (struggle && struggle.skill_tags && struggle.skill_tags.length > 0) {
      console.log('[Pipeline Data] Struggle detected but not used:', struggle.skill_tags);
    }
    return {
      videoUrl: `${baseUrl}/grade4-multiplication-intro.mp4`,
      title: 'Mastery in a Minute: Multiplication',
      selectionMode: 'default-only'
    };
  }
  
  console.log('[Feature Flag] Struggle selection ENABLED');
  
  if (struggle && struggle.skill_tags && struggle.skill_tags.length > 0) {
    const videoMap = {
      'multiplication-7-8': {
        video: 'times-tables-7-8.mp4',
        title: '7 and 8 Times Tables'
      }
    };
    
    for (const tag of struggle.skill_tags) {
      if (videoMap[tag]) {
        const match = videoMap[tag];
        return {
          videoUrl: `${baseUrl}/${match.video}`,
          title: `Mastery in a Minute: ${match.title}`,
          selectionMode: 'struggle-based'
        };
      }
    }
  }
  
  return {
    videoUrl: `${baseUrl}/grade4-multiplication-intro.mp4`,
    title: 'Mastery in a Minute',
    selectionMode: 'default-fallback'
  };
}

// Run tests
console.log('Testing Feature Flag Implementation\n');
console.log('====================================\n');

testCases.forEach(test => {
  console.log(`\nTest: ${test.name}`);
  console.log('-'.repeat(50));
  
  // Set environment
  Object.assign(process.env, test.env);
  
  // Run function
  const result = getVideoMetadata(test.lessonData, test.struggle);
  
  // Display results
  console.log('Result:');
  console.log(`  Video: ${result.videoUrl.split('/').pop()}`);
  console.log(`  Mode: ${result.selectionMode}`);
  console.log(`  Title: ${result.title}`);
});

console.log('\n====================================');
console.log('\nExpected Behavior:');
console.log('✅ Flag OFF (both tests): grade4-multiplication-intro.mp4, mode=default-only');
console.log('✅ Flag ON + struggle: times-tables-7-8.mp4, mode=struggle-based');
console.log('✅ Flag ON + no struggle: grade4-multiplication-intro.mp4, mode=default-fallback');
console.log('\nIf output matches above, feature flag is working correctly! 🎉\n');

