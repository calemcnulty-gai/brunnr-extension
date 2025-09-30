# Phase 8: Video Pipeline Integration & Feature Flag

## Context

**Team Directive (Sept 30, 2025):** Remove struggle condition - show default video to all students for now.

**Problem:** Phases 1-3 already implemented struggle-based video selection and it's working! Don't throw it away.

**Solution:** Add feature flag + database logging to support both:
- **Current pilot:** Default video only (struggle logic dormant)
- **Future pipeline:** Dynamic videos based on logged struggles

---

## Goals

1. ✅ Support team directive (default video for all)
2. ✅ Keep struggle detection working (log to database)
3. ✅ Prepare for video generation pipeline integration
4. ✅ Make switching between modes trivial (one env var)

---

## Architecture: Feature Flag Pattern

```javascript
// Environment variable controls behavior
ENABLE_STRUGGLE_SELECTION=false  // Pilot: always default video
ENABLE_STRUGGLE_SELECTION=true   // Future: targeted videos

// Struggle logging happens ALWAYS (feeds pipeline)
```

---

## Task 8.1: Add Feature Flag to validate-lesson.js

**File:** `lambdas/functions/validate-lesson.js`

**Changes:**

### 1. Add flag check to getVideoMetadata (line 39):

```javascript
function getVideoMetadata(lessonData, struggle) {
  const baseUrl = process.env.CLOUDFRONT_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
  // FEATURE FLAG: Check if struggle-based selection is enabled
  const enableStruggleSelection = process.env.ENABLE_STRUGGLE_SELECTION === 'true';
  
  if (!enableStruggleSelection) {
    console.log('[Feature Flag] Struggle selection disabled, returning default video');
    // Log struggle for analytics/pipeline but don't use for selection
    if (struggle && struggle.skill_tags) {
      console.log('[Pipeline Data] Struggle detected but not used:', struggle.skill_tags);
    }
    
    // Return default video for all students
    return {
      videoUrl: `${baseUrl}/grade4-multiplication-intro.mp4`,
      title: 'Mastery in a Minute: Multiplication',
      duration: 60,
      thumbnailUrl: `${baseUrl}/thumbnails/grade4-multiplication.jpg`,
      lessonId: lessonData.lesson_id,
      gradeLevel: lessonData.grade_level,
      topic: lessonData.topic,
      selectionMode: 'default' // Track which mode was used
    };
  }
  
  // ORIGINAL LOGIC: Struggle-based selection (when flag enabled)
  if (struggle && struggle.skill_tags && struggle.skill_tags.length > 0) {
    console.log('Matching video by skill tags:', struggle.skill_tags);
    
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
    selectionMode: 'default'
  };
}
```

### 2. Set the flag in sst.config.ts (line 13):

```typescript
const api = new sst.aws.ApiGatewayV2("ExtensionApi", {
  cors: true,
});

// Add default environment variables for all routes
api.defaults = {
  function: {
    environment: {
      ENABLE_STRUGGLE_SELECTION: "false", // DEFAULT: Disabled for pilot
    }
  }
};
```

**Testing:**
- Deploy with `ENABLE_STRUGGLE_SELECTION=false`
- Verify all students get same default video regardless of struggles
- Check logs show "[Feature Flag] Struggle selection disabled"
- Verify struggles still logged in CloudWatch (for pipeline later)

---

## Task 8.2: Add Database Schema for Pipeline

**File:** `lambdas/database/schema.sql`

**Add to existing schema** (append to end of file):

```sql
-- ============================================
-- Phase 8: Video Generation Pipeline Tables
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
  subject VARCHAR(50),
  
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
  
  -- Indexes
  INDEX idx_skill_tags ((CAST(skill_tags AS CHAR(255) ARRAY))),
  INDEX idx_generation_status (generation_status),
  INDEX idx_pending (video_generated, generation_status),
  INDEX idx_grade_topic (grade_level, topic),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dynamic video catalog (replaces hardcoded videoMap)
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
  subject VARCHAR(50),
  difficulty_level ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
  
  -- Performance tracking
  is_active BOOLEAN DEFAULT TRUE,
  view_count INT DEFAULT 0,
  avg_completion_rate DECIMAL(5,2),
  avg_performance_improvement DECIMAL(5,2), -- % improvement after watching
  
  -- A/B testing
  ab_test_variant VARCHAR(50), -- 'A', 'B', 'control', etc.
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_viewed_at TIMESTAMP NULL,
  
  -- Indexes
  INDEX idx_skill_tag (skill_tag),
  INDEX idx_grade_topic (grade_level, topic),
  INDEX idx_active (is_active),
  INDEX idx_performance (avg_performance_improvement DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View: Pending video generation requests (for pipeline to consume)
CREATE OR REPLACE VIEW pending_video_requests AS
SELECT 
  skill_tags,
  COUNT(*) as struggle_count,
  MIN(created_at) as first_requested,
  MAX(created_at) as last_requested,
  grade_level,
  topic
FROM struggle_events
WHERE video_generated = FALSE 
  AND generation_status = 'pending'
GROUP BY skill_tags, grade_level, topic
ORDER BY struggle_count DESC, first_requested ASC;

-- Stored procedure: Log struggle event
DELIMITER $$
CREATE PROCEDURE log_struggle_event(
  IN p_user_email VARCHAR(255),
  IN p_lesson_id VARCHAR(100),
  IN p_question_text TEXT,
  IN p_student_answer VARCHAR(500),
  IN p_correct_answer VARCHAR(500),
  IN p_skill_tags JSON,
  IN p_grade_level INT,
  IN p_topic VARCHAR(100)
)
BEGIN
  -- Insert struggle event
  INSERT INTO struggle_events (
    user_email, lesson_id, question_text, student_answer, 
    correct_answer, skill_tags, grade_level, topic, 
    generation_status
  ) VALUES (
    p_user_email, p_lesson_id, p_question_text, p_student_answer,
    p_correct_answer, p_skill_tags, p_grade_level, p_topic,
    'pending'
  );
  
  -- Check if we should trigger video generation
  -- (e.g., if this skill tag has been struggled with 5+ times)
  DECLARE struggle_count INT;
  SELECT COUNT(*) INTO struggle_count
  FROM struggle_events
  WHERE JSON_CONTAINS(skill_tags, p_skill_tags)
    AND video_generated = FALSE;
  
  -- If threshold reached, mark for immediate generation
  IF struggle_count >= 5 THEN
    UPDATE struggle_events
    SET generation_status = 'generating',
        generation_requested_at = NOW()
    WHERE JSON_CONTAINS(skill_tags, p_skill_tags)
      AND generation_status = 'pending';
  END IF;
END$$
DELIMITER ;
```

**Deploy Schema:**
```bash
# Connect to RDS (or run this when you set up RDS)
mysql -h your-rds-endpoint.amazonaws.com -u admin -p < lambdas/database/schema.sql
```

---

## Task 8.3: Add Struggle Logging to validate-lesson.js

**File:** `lambdas/functions/validate-lesson.js`

**Add logging function** (after line 105, before handler):

```javascript
/**
 * Log struggle event to database for video generation pipeline
 * This runs ALWAYS, regardless of ENABLE_STRUGGLE_SELECTION flag
 */
async function logStruggleEvent(struggle, lessonData, userEmail) {
  if (!struggle || !struggle.skill_tags || struggle.skill_tags.length === 0) {
    return; // No struggle data to log
  }
  
  // Only log if RDS is configured
  if (!process.env.RDS_HOST) {
    console.log('[Pipeline] RDS not configured, struggle logged to CloudWatch only');
    console.log('[Pipeline Data]', JSON.stringify({
      skill_tags: struggle.skill_tags,
      question_text: struggle.question_text,
      grade_level: lessonData.grade_level,
      topic: lessonData.topic
    }));
    return;
  }
  
  try {
    const db = require('../shared/database');
    
    await db.query(`
      INSERT INTO struggle_events (
        user_email, lesson_id, question_id, question_text,
        student_answer, correct_answer, skill_tags,
        grade_level, topic, subject, page_url, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userEmail || 'anonymous',
      lessonData.lesson_id,
      struggle.question_id || null,
      struggle.question_text || '',
      struggle.student_answer || '',
      struggle.correct_answer || '',
      JSON.stringify(struggle.skill_tags),
      lessonData.grade_level,
      lessonData.topic,
      lessonData.subject || 'math',
      lessonData.lesson_url || '',
      struggle.session_id || null
    ]);
    
    console.log('[Pipeline] Struggle logged to database:', struggle.skill_tags);
  } catch (err) {
    console.error('[Pipeline] Failed to log struggle:', err);
    // Don't fail the request if logging fails
  }
}
```

**Update handler to call logging** (line 149, after struggle detection):

```javascript
// Get video metadata
const videoMetadata = getVideoMetadata(lessonData, lessonData.struggle);

// ALWAYS log struggles to database (for pipeline), regardless of feature flag
if (lessonData.struggle) {
  console.log('Struggle signal detected:', JSON.stringify(lessonData.struggle));
  await logStruggleEvent(lessonData.struggle, lessonData, userIdentifier);
}

console.log('Lesson eligible, returning video metadata');
```

---

## Task 8.4: Create Pipeline Webhook Endpoint

**New File:** `lambdas/functions/notify-video-ready.js`

```javascript
/**
 * Webhook endpoint for video generation pipeline
 * Called when a new video is generated and ready
 */

import { success, error, parseBody } from '../shared/response.js';

/**
 * Lambda handler
 */
export async function handler(event) {
  try {
    console.log('[Pipeline Webhook] Video ready notification:', JSON.stringify(event, null, 2));
    
    const body = parseBody(event);
    
    // Validate required fields
    if (!body.skill_tag || !body.video_url) {
      return error('Missing required fields: skill_tag, video_url', 400);
    }
    
    const {
      skill_tag,
      video_url,
      video_id,
      title,
      duration,
      thumbnail_url,
      grade_level,
      topic
    } = body;
    
    // Update video catalog
    if (process.env.RDS_HOST) {
      const db = require('../shared/database');
      
      await db.query(`
        INSERT INTO video_catalog (
          skill_tag, video_url, video_id, title, duration,
          thumbnail_url, grade_level, topic, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        ON DUPLICATE KEY UPDATE
          video_url = VALUES(video_url),
          video_id = VALUES(video_id),
          title = VALUES(title),
          duration = VALUES(duration),
          thumbnail_url = VALUES(thumbnail_url),
          updated_at = NOW()
      `, [
        skill_tag,
        video_url,
        video_id || `vid-${Date.now()}`,
        title || `Video for ${skill_tag}`,
        duration || 90,
        thumbnail_url || '',
        grade_level || null,
        topic || null
      ]);
      
      // Mark all pending struggles with this skill tag as resolved
      await db.query(`
        UPDATE struggle_events
        SET video_generated = TRUE,
            video_id = ?,
            generation_status = 'ready',
            generation_completed_at = NOW()
        WHERE JSON_CONTAINS(skill_tags, ?)
          AND video_generated = FALSE
      `, [
        video_id || skill_tag,
        JSON.stringify(skill_tag)
      ]);
      
      console.log(`[Pipeline Webhook] Video catalog updated for skill: ${skill_tag}`);
    } else {
      console.warn('[Pipeline Webhook] RDS not configured, video catalog not updated');
    }
    
    return success({
      message: 'Video catalog updated successfully',
      skill_tag,
      video_url
    });
    
  } catch (err) {
    console.error('[Pipeline Webhook] Error processing video notification:', err);
    return error('Failed to process video notification', 500, err.message);
  }
}
```

**Add route in sst.config.ts** (after line 30):

```typescript
// Pipeline webhook endpoint
api.route("POST /api/pipeline/video-ready", "functions/notify-video-ready.handler");
```

---

## Task 8.5: Update Extension to NOT Replace Video

**File:** `content_scripts/mathacademy.js`

Since we're showing default video only (for now), modify struggle detection to NOT replace video:

```javascript
async function handleIncorrectAnswer(quizElement, questionData) {
  console.log('[Brunnr] Incorrect answer detected');
  
  const lessonData = extractLessonData();
  
  const struggle = {
    question_id: quizElement.getAttribute('data-question-id') || `q-${Date.now()}`,
    question_text: questionData.questionText || '',
    student_answer: questionData.studentAnswer || '',
    correct_answer: questionData.correctAnswer || '',
    skill_tags: inferSkillTags(questionData.questionText || ''),
    attempt: 1,
    timestamp: new Date().toISOString()
  };
  
  // Send struggle data to middleware (for logging/pipeline)
  // But DON'T replace video (feature flag is disabled)
  await chrome.runtime.sendMessage({
    type: 'VALIDATE_LESSON',
    data: {
      ...lessonData,
      struggle
    }
  });
  
  console.log('[Brunnr] Struggle logged, video unchanged (feature flag disabled)');
  
  // Track the struggle event
  analytics.trackQuizAttempt({
    ...questionData,
    correct: false,
    skill_tags: struggle.skill_tags
  });
}
```

---

## Deployment & Testing

### 1. Deploy with Feature Flag Disabled

```bash
cd lambdas

# Set feature flag
npx sst secrets set ENABLE_STRUGGLE_SELECTION false --stage dev

# Deploy
npx sst deploy --stage dev
```

### 2. Test Default Video Behavior

1. Load Grade 4 multiplication lesson → Default video appears
2. Answer question incorrectly → Same video stays (no replacement)
3. Check CloudWatch logs → Should see "[Feature Flag] Struggle selection disabled"
4. Check struggle logged → Should see "[Pipeline Data] Struggle detected but not used"

### 3. Set Up RDS (Optional - Can Wait)

```bash
# When ready to enable database logging
npx sst secrets set RDS_HOST your-db-endpoint.amazonaws.com --stage dev
npx sst secrets set RDS_USER lambda_user --stage dev
npx sst secrets set RDS_PASSWORD your-password --stage dev

# Run schema
mysql -h your-db-endpoint.amazonaws.com -u admin -p < lambdas/database/schema.sql
```

### 4. Test Pipeline Webhook (When Video Pipeline Ready)

```bash
curl -X POST https://your-api.amazonaws.com/api/pipeline/video-ready \
  -H "Content-Type: application/json" \
  -d '{
    "skill_tag": "multiplication-7-8",
    "video_url": "https://d2zhlpwgezwmiu.cloudfront.net/times-7-8.mp4",
    "title": "7 and 8 Times Tables",
    "duration": 90
  }'
```

### 5. Enable Struggle Selection (Future)

When videos are ready:
```bash
# Flip the switch
npx sst secrets set ENABLE_STRUGGLE_SELECTION true --stage prod
npx sst deploy --stage prod
```

---

## Integration with Video Generation Pipeline

### Your Pipeline Should:

1. **Poll for pending struggles:**
   ```sql
   SELECT * FROM pending_video_requests LIMIT 10;
   ```

2. **Generate video for top skill_tags**

3. **Upload to CloudFront**

4. **Notify middleware:**
   ```bash
   POST /api/pipeline/video-ready
   {
     "skill_tag": "multiplication-7-8",
     "video_url": "https://cloudfront.net/times-7-8.mp4"
   }
   ```

5. **Middleware automatically:**
   - Adds video to catalog
   - Marks struggles as resolved
   - Next student with same struggle gets new video (if flag enabled)

---

## Summary

✅ **For TSA Pilot (Now):**
- Feature flag OFF → Default video only
- Struggles logged to CloudWatch/RDS
- No video replacement on incorrect answers

✅ **For Pipeline Development (Next Month):**
- Database captures all struggle events
- Webhook endpoint ready for pipeline
- Video catalog table ready

✅ **For Future (When Videos Ready):**
- Feature flag ON → Struggle-based selection
- Videos pulled from catalog dynamically
- Extension replaces videos on struggle

**Nothing is wasted** - All Phase 1-3 work remains valuable and will be activated when ready!

---

## Updated Timeline

| Task | Time | Can Start |
|------|------|-----------|
| 8.1: Add feature flag | 30 min | Immediately |
| 8.2: Database schema | 1 hour | When RDS provisioned |
| 8.3: Struggle logging | 45 min | After 8.1 |
| 8.4: Pipeline webhook | 1 hour | After 8.2 |
| 8.5: Update extension | 15 min | After 8.1 |
| **Total** | **3.5 hours** | Can parallelize with RDS setup |

---

## Next Steps

1. **Immediate:** Implement Task 8.1 (feature flag)
2. **This Week:** Deploy with flag=false, test pilot behavior
3. **Next Sprint:** Set up RDS, run schema (Tasks 8.2-8.4)
4. **When Pipeline Ready:** Connect webhook, test integration
5. **When Videos Ready:** Flip flag to true, enable struggle selection

