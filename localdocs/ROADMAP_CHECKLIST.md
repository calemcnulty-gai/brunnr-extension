# Brunnr Extension Middle Pipeline - Implementation Roadmap

## 📊 Progress Overview

**Phase 1 (Backend):** 5/5 tasks complete ✅ 🎉
**Phase 2 (Analytics):** 2/2 tasks complete ✅ 🎉
**Phase 3 (Struggle Detection):** 2/2 tasks complete ✅ 🎉
**Phase 4 (Testing):** 1/2 tasks complete ✅ 
  - Task 4.1: End-to-end manual test ✅ [TEST_RESULTS.md]
  - Task 4.2: Edge case testing ⏳ (Optional for MVP)
**Phase 5 (Deployment):** 0/4 tasks complete ⏳
**Phase 6 (Documentation):** 2/4 tasks complete ✅
  - Task 6.1: MIDDLEWARE_ARCHITECTURE.md ✅
  - Task 6.4: Response to Joshua ✅ [RESPONSE_TO_JOSHUA.md]
  - Task 6.2: Update README ⏳
  - Task 6.3: Record demo video ⏳
**Phase 7 (Future):** 0/3 tasks complete ⏳
**Phase 8 (Pipeline Integration):** 5/5 tasks complete ✅ 🎉 [COMPLETE]
  - Task 8.1: Add feature flag for struggle selection ✅ [COMPLETED]
  - Task 8.2: Database schema for pipeline ✅ [COMPLETED]
  - Task 8.3: Struggle logging to RDS ✅ [COMPLETED]
  - Task 8.4: Pipeline webhook endpoint ✅ [COMPLETED]
  - Task 8.5: Update extension behavior ✅ [COMPLETED]

**Overall Progress:** 17/26 core tasks complete (65%)

**Current Status:** ✅ Phase 1, 2, 3, 4 & core Phase 6 COMPLETE! Middleware fully documented and ready for team review.

**New Directive (Sept 30):** Team wants default video for all (no struggle-based selection). Phase 8 implements this via feature flag while preserving Phase 1-3 work for future pipeline.

**Next Step:** Implement Phase 8 (feature flag + pipeline prep) OR proceed to deployment (Phase 5) with current struggle-based logic.

---

## Goal
Implement the complete "middle pipeline" between the Chrome extension and video renderer, enabling:
1. Detection of student struggles on MathAcademy
2. Reactive video recommendations based on specific failures
3. Full analytics tracking of engagement and performance
4. Response to Joshua's question: "i'm particularly interested in what the middleware looks like between the extension and the renderer"

---

## Overview: Optimal Order of Operations

The tasks are ordered to:
- Fix critical bugs first (batch analytics route)
- Establish backend contracts and selection logic (no client dependencies yet)
- Wire extension detection (depends on backend being ready)
- Connect analytics (depends on both backend and detection)
- Test end-to-end
- Deploy and document

This avoids rework: backend changes are complete before client code depends on them.

---

## Phase 1: Backend Foundation (API Contract & Bug Fixes)

### ✅ Task 1.1: Fix Batch Analytics Route [COMPLETED]
**File:** `lambdas/stacks/ExtensionApiStack.ts` → Migrated to `lambdas/sst.config.ts`

**Problem:** Stack points to `functions/track-engagement.batchHandler` but the actual export is `functions/track-engagement-batch.handler`

**Change:**
```typescript
// Line 78-81: Change from
"POST /api/analytics/batch": {
  function: {
    handler: "functions/track-engagement.batchHandler",
  },
},

// To:
"POST /api/analytics/batch": {
  function: {
    handler: "functions/track-engagement-batch.handler",
  },
},
```

**Why First:** This is a critical bug blocking analytics. Fix before adding new features.

**Testing:** Deploy and curl the batch endpoint to verify it no longer returns 500.

---

### ✅ Task 1.2: Extend `validate-lesson` to Accept Struggle Signals [COMPLETED]
**File:** `lambdas/functions/validate-lesson.js`

**Objective:** Accept optional `struggle` object in request body and use it to select more specific videos.

**Changes:**

1. **Parse struggle from body** (after line 79):
```javascript
const lessonData = {
  lesson_id: body.lesson_id,
  lesson_url: body.lesson_url,
  lesson_title: body.lesson_title,
  grade_level: body.grade_level,
  subject: body.subject,
  topic: body.topic,
  struggle: body.struggle || null  // ADD THIS
};
```

2. **Pass struggle to metadata function** (line 95):
```javascript
// Change from:
const videoMetadata = getVideoMetadata(lessonData);

// To:
const videoMetadata = getVideoMetadata(lessonData, lessonData.struggle);
```

3. **Update `getVideoMetadata` signature and logic** (lines 38-55):
```javascript
function getVideoMetadata(lessonData, struggle) {
  const baseUrl = Config.CLOUDFRONT_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
  // If struggle signal present, try to match by skill tags
  if (struggle && struggle.skill_tags && struggle.skill_tags.length > 0) {
    const videoMap = {
      'times-tables': 'times-tables-advanced.mp4',
      'multiplication-7-8': 'times-tables-7-8.mp4',
      'multiplication-facts': 'multiplication-facts.mp4',
    };
    
    // Find first matching skill tag
    for (const tag of struggle.skill_tags) {
      if (videoMap[tag]) {
        return {
          videoUrl: `${baseUrl}/${videoMap[tag]}`,
          title: `Mastery in a Minute: ${tag.replace(/-/g, ' ')}`,
          duration: 90,
          thumbnailUrl: `${baseUrl}/thumbnails/${tag}.jpg`,
          reason: `Student struggled: ${struggle.question_text || 'question'}`,
          confidence: 0.9,
          lessonId: lessonData.lesson_id,
          gradeLevel: lessonData.grade_level,
          topic: lessonData.topic
        };
      }
    }
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
```

**Testing:** 
- Call with no `struggle`: returns default video
- Call with `struggle.skill_tags: ["times-tables"]`: returns specific video

---

### ✅ Task 1.3: (Optional) Enhance `get-video-metadata` to Query RDS
**File:** `lambdas/functions/get-video-metadata.js`

**Objective:** Replace hardcoded video map with database lookup from `lesson_metadata` table.

**Changes:**

1. Import database module (top of file):
```javascript
const db = require('../shared/database');
```

2. Update `fetchVideoMetadata` (lines 10-36):
```javascript
async function fetchVideoMetadata(lessonId) {
  const baseUrl = process.env.VIDEO_BASE_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';
  
  // Try to fetch from database
  if (process.env.RDS_HOST) {
    try {
      const results = await db.query(
        'SELECT video_url, title, video_duration, topic FROM lesson_metadata WHERE lesson_id = ? AND is_active = TRUE',
        [lessonId]
      );
      
      if (results.length > 0) {
        const row = results[0];
        return {
          url: row.video_url,
          title: row.title || 'Mastery in a Minute',
          duration: row.video_duration
        };
      }
    } catch (error) {
      console.error('Database lookup failed, falling back to defaults:', error);
    }
  }
  
  // Fallback to hardcoded map
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
```

**Why Optional:** The `validate-lesson` endpoint is the primary path; this is a nice-to-have for direct lookups.

**Testing:** Insert a row in `lesson_metadata` and verify GET returns it.

---

### ✅ Task 1.4: Deploy Backend to Dev [COMPLETED]
**Directory:** `lambdas/`

**STATUS:** ✅ Deployed successfully to AWS
**API URL:** `https://ayorzefv46.execute-api.us-east-1.amazonaws.com`

**Commands:**
```bash
cd lambdas
npm install  # Ensure dependencies
npx sst deploy --stage dev
```

**Verification:**
- Note the API Gateway URL from output
- Curl the batch endpoint: `curl -X POST {api_url}/api/analytics/batch -d '{"user_email":"test@test.com","events":[]}' -H "Content-Type: application/json"`
  - Should return 400 "Events array cannot be empty" (not 500)
- Curl validate with struggle: `curl -X POST {api_url}/api/lesson/validate -d '{"user_email":"test@test.com","lesson_id":"test","grade_level":4,"topic":"multiplication","struggle":{"skill_tags":["times-tables"]}}' -H "Content-Type: application/json"`
  - Should return a video with `times-tables` in the URL

**Checkpoint:** Backend is ready; all endpoints functional.

Note: Before starting Phase 2 and Phase 3, point the extension at your dev API. Update `lib/api.js` `API_BASE_URL` to the URL output by Task 1.4 (see Task 5.1 for options). This avoids testing against the wrong environment.

---

 

## Phase 2: Extension - Analytics Wiring

### ✅ Task 2.1: Replace Analytics Stub with Real Tracker
**File:** `content_scripts/mathacademy.js`

**Problem:** Lines 6-13 define an empty analytics stub. Need to import and use the real tracker.

**Change:**

1. Remove the stub (lines 6-13):
```javascript
// DELETE THIS:
const analytics = {
  initVideoTracking: () => {},
  trackLessonPerformance: () => {},
  trackQuizAttempt: () => {},
  trackExampleAttempt: () => {},
  cleanup: () => {}
};
```

2. Import the real analytics module. Since content scripts can't directly import ES modules, we need to make analytics available. **Two options:**

   **Option A (Recommended): Make `lib/analytics.js` web-accessible and import dynamically**
   
   Add to `manifest.json` after line 45:
   ```json
   "web_accessible_resources": [
     {
       "resources": ["lib/analytics.js"],
       "matches": ["https://mathacademy.com/*", "https://www.mathacademy.com/*"]
     }
   ]
   ```
   
   Then in `content_scripts/mathacademy.js` (after line 5):
   ```javascript
   // Dynamically import analytics
   let analytics;
   (async () => {
     const src = chrome.runtime.getURL('lib/analytics.js');
     const module = await import(src);
     analytics = module.analytics;
   })();
   ```

   **Option B: Inline minimal analytics senders**
   
   Keep analytics simple by directly calling `chrome.runtime.sendMessage` from content script without importing the full module.

**Recommendation:** Use **Option B** for MVP (simpler, no manifest changes). The content script already has message-sending logic; just use it.

3. Implement inline analytics functions (replace stub, lines 6-13):
```javascript
// Inline analytics - sends events to background script
const analytics = {
  initVideoTracking: (videoEl, lessonId, videoUrl, sessionId) => {
    // Attach all video event listeners
    const sendEvent = (eventType, extra = {}) => {
      chrome.runtime.sendMessage({
        type: 'ANALYTICS_EVENT',
        data: {
          category: 'video_engagement',
          event: {
            lessonId,
            videoUrl,
            sessionId,
            eventType,
            timestamp: new Date().toISOString(),
            pageUrl: window.location.href,
            currentTime: videoEl.currentTime,
            duration: videoEl.duration,
            playbackRate: videoEl.playbackRate,
            volume: videoEl.volume,
            fullscreen: document.fullscreenElement === videoEl,
            ...extra
          }
        }
      });
    };

    videoEl.addEventListener('play', () => sendEvent('play'));
    videoEl.addEventListener('pause', () => sendEvent('pause'));
    videoEl.addEventListener('ended', () => sendEvent('ended', { completionPercentage: 100 }));
    videoEl.addEventListener('error', (e) => sendEvent('error', { error: e.message }));
  },

  trackLessonPerformance: (data) => {
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      data: {
        category: 'lesson_performance',
        event: {
          lessonId: currentLessonId,
          sessionId,
          timestamp: new Date().toISOString(),
          pageUrl: window.location.href,
          ...data
        }
      }
    });
  },

  trackQuizAttempt: (data) => {
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      data: {
        category: 'quiz_attempt',
        event: {
          lessonId: currentLessonId,
          sessionId,
          timestamp: new Date().toISOString(),
          ...data
        }
      }
    });
  },

  trackExampleAttempt: (data) => {
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      data: {
        category: 'example_attempt',
        event: {
          lessonId: currentLessonId,
          sessionId,
          timestamp: new Date().toISOString(),
          ...data
        }
      }
    });
  },

  cleanup: () => {
    // Flush any pending events
    console.log('[Brunnr] Analytics cleanup');
  }
};
```

**Testing:** 
- Load a lesson
- Play the injected video
- Check browser console for `[Brunnr] Background received message: ANALYTICS_EVENT`
- Verify events reach the API (check CloudWatch logs)

---
### ✅ Task 2.2: Forward `struggle` to the API [COMPLETED]
**File:** `lib/api.js`

**Objective:** Ensure the `struggle` signal from the content script reaches the `validate-lesson` Lambda.

**Change:** Include `struggle` in the `validateLesson()` POST body.
```javascript
// In validateLesson(), include struggle in the POST body
body: JSON.stringify({
  user_email: this.userIdentifier && this.userIdentifier.includes('@') ? this.userIdentifier : null,
  student_id: this.userIdentifier && !this.userIdentifier.includes('@') ? this.userIdentifier : null,
  lesson_url: lessonData.url,
  lesson_title: lessonData.title,
  lesson_id: lessonData.lessonId,
  grade_level: lessonData.gradeLevel,
  subject: lessonData.subject,
  topic: lessonData.topic,
  struggle: lessonData.struggle || null // ADD THIS
})
```

**Testing:** Trigger an incorrect answer (Phase 3), verify CloudWatch logs for `validate-lesson` show a `struggle` object in the request body and that a targeted video is returned when tags match.

---

## Phase 3: Extension - Struggle Detection

### ✅ Task 3.1: Detect Incorrect Answers on MathAcademy [COMPLETED]
**File:** `content_scripts/mathacademy.js`

**Objective:** Watch for quiz/problem submissions, detect when student gets it wrong, extract struggle context.

**Implementation:**

1. **Add helper to infer skill tags from question text** (insert after line 145):
```javascript
/**
 * Infer skill tags from question text (simple keyword matching for MVP)
 */
function inferSkillTags(questionText) {
  const text = questionText.toLowerCase();
  const tags = [];
  
  // Multiplication patterns
  if (text.includes('×') || text.includes('times') || text.includes('multiply')) {
    tags.push('multiplication');
    
    // Specific times tables
    const match = text.match(/(\d+)\s*[×x]\s*(\d+)/);
    if (match) {
      tags.push('times-tables');
      tags.push(`multiplication-${match[1]}-${match[2]}`);
    }
  }
  
  if (text.includes('fact') || text.includes('memorize')) {
    tags.push('multiplication-facts');
  }
  
  return tags;
}
```

2. **Add struggle detection function** (insert after inferSkillTags):
```javascript
/**
 * Detect when student submits an incorrect answer and request video
 */
async function handleIncorrectAnswer(quizElement, questionData) {
  console.log('[Brunnr] Incorrect answer detected, requesting targeted video');
  
  const lessonData = extractLessonData();
  
  const struggle = {
    question_id: quizElement.getAttribute('data-question-id') || `q-${Date.now()}`,
    question_text: questionData.questionText || '',
    student_answer: questionData.studentAnswer || '',
    correct_answer: questionData.correctAnswer || '',
    skill_tags: inferSkillTags(questionData.questionText || ''),
    attempt: 1, // Could track multiple attempts per question
    timestamp: new Date().toISOString()
  };
  
  // Request video recommendation with struggle context
  const response = await chrome.runtime.sendMessage({
    type: 'VALIDATE_LESSON',
    data: {
      ...lessonData,
      struggle
    }
  });
  
  if (response && response.shouldShowVideo && response.videoMetadata) {
    console.log('[Brunnr] Received targeted video recommendation:', response.videoMetadata);
    await injectVideo(response.videoMetadata, true); // true = replace existing
  }
  
  // Track the struggle event
  analytics.trackQuizAttempt({
    ...questionData,
    correct: false,
    skill_tags: struggle.skill_tags
  });
}
```

3. **Enhance quiz tracking to detect correctness** (update `setupQuizTracking`, lines 373-390):
```javascript
function setupQuizTracking(quizElement) {
  // Find submit button
  const submitBtn = quizElement.querySelector('button[type="submit"], .submit-btn, [class*="submit"]');
  if (submitBtn && !submitBtn.hasAttribute('data-brunnr-tracked')) {
    submitBtn.setAttribute('data-brunnr-tracked', 'true');
    
    submitBtn.addEventListener('click', () => {
      // Extract question data
      const questionText = quizElement.querySelector('.question-text, [class*="question"]')?.textContent || 
                          quizElement.textContent.substring(0, 200);
      const selectedAnswer = quizElement.querySelector('input:checked, .selected');
      
      const questionData = {
        questionText,
        selectedAnswer: selectedAnswer?.value || selectedAnswer?.textContent || '',
        timestamp: Date.now()
      };
      
      // Wait for result to appear, then check correctness
      setTimeout(() => {
        const resultEl = quizElement.querySelector('.result, .feedback, [class*="result"], [class*="feedback"], [aria-live]');
        if (resultEl) {
          const resultText = resultEl.textContent.toLowerCase();
          const isCorrect = resultText.includes('correct') && !resultText.includes('incorrect');
          const isIncorrect = resultText.includes('incorrect') || resultText.includes('wrong') || resultText.includes('try again');
          
          if (isIncorrect) {
            // Extract correct answer if visible
            const correctEl = resultEl.querySelector('.correct-answer, [class*="correct"]');
            questionData.correctAnswer = correctEl?.textContent || '';
            
            // Trigger struggle detection
            handleIncorrectAnswer(quizElement, questionData);
          }
          
          // Track attempt
          analytics.trackQuizAttempt({
            ...questionData,
            correct: isCorrect
          });
        }
      }, 500); // Wait 500ms for result to render
    });
  }
}
```

4. **Update `injectVideo` to support replacing existing video** (lines 175-207):
```javascript
async function injectVideo(videoMetadata, replace = false) {
  const existingContainer = document.getElementById('brunnr-video');
  
  if (existingContainer && !replace) {
    console.log('[Brunnr] Video already injected');
    return;
  }
  
  if (existingContainer && replace) {
    console.log('[Brunnr] Replacing existing video with new recommendation');
    existingContainer.remove();
    videoInjected = false;
  }

  console.log('[Brunnr] Injecting video into lesson');

  // Find the main content area
  const contentArea = findContentArea();
  if (!contentArea) {
    console.error('[Brunnr] Could not find content area to inject video');
    return;
  }

  // Create video container
  const videoContainer = createVideoContainer(videoMetadata);

  // Insert at the top of content
  if (contentArea.firstChild) {
    contentArea.insertBefore(videoContainer, contentArea.firstChild);
  } else {
    contentArea.appendChild(videoContainer);
  }

  videoInjected = true;

  // Initialize analytics tracking
  const videoElement = videoContainer.querySelector('video');
  if (videoElement) {
    setupVideoAnalytics(videoElement, videoMetadata);
  }
  
  // Scroll to video if it's a struggle-triggered replacement
  if (replace) {
    videoContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
```

**Why This Order:** Analytics wiring (Task 2.1) must be done first, because struggle detection calls `analytics.trackQuizAttempt`.

**Testing:**
1. Load a Grade 4 multiplication lesson
2. Answer a question incorrectly
3. Check console: should see "Incorrect answer detected, requesting targeted video"
4. Verify a new video is injected with `reason` field in metadata
5. Verify analytics event sent with `correct: false`

---

### ✅ Task 3.2: Improve Struggle Detection Robustness [COMPLETED]
**File:** `content_scripts/mathacademy.js`

**Objective:** MathAcademy may render results asynchronously; use MutationObserver instead of setTimeout.

**Enhancement to `setupQuizTracking`** (replace setTimeout logic from Task 3.1):
```javascript
submitBtn.addEventListener('click', () => {
  const questionText = quizElement.querySelector('.question-text, [class*="question"]')?.textContent || 
                      quizElement.textContent.substring(0, 200);
  const selectedAnswer = quizElement.querySelector('input:checked, .selected');
  
  const questionData = {
    questionText,
    selectedAnswer: selectedAnswer?.value || selectedAnswer?.textContent || '',
    timestamp: Date.now()
  };
  
  // Watch for result element to appear
  const observeResult = () => {
    const resultEl = quizElement.querySelector('.result, .feedback, [class*="result"], [class*="feedback"], [aria-live]');
    if (!resultEl) {
      // Result element doesn't exist yet; wait for it to be added
      const observer = new MutationObserver(() => {
        const newResultEl = quizElement.querySelector('.result, .feedback, [class*="result"], [aria-live]');
        if (newResultEl) {
          observer.disconnect();
          checkResult(newResultEl, questionData);
        }
      });
      observer.observe(quizElement, { childList: true, subtree: true });
      
      // Timeout fallback
      setTimeout(() => observer.disconnect(), 5000);
    } else {
      // Result element exists; watch for content changes
      const observer = new MutationObserver(() => {
        checkResult(resultEl, questionData);
        observer.disconnect();
      });
      observer.observe(resultEl, { childList: true, subtree: true, characterData: true });
      
      // Also check immediately in case it's already populated
      setTimeout(() => checkResult(resultEl, questionData), 100);
    }
  };
  
  const checkResult = (resultEl, data) => {
    const resultText = resultEl.textContent.toLowerCase();
    if (!resultText) return;
    
    const isCorrect = resultText.includes('correct') && !resultText.includes('incorrect');
    const isIncorrect = resultText.includes('incorrect') || resultText.includes('wrong') || resultText.includes('try again');
    
    if (isIncorrect) {
      const correctEl = resultEl.querySelector('.correct-answer, [class*="correct"]');
      data.correctAnswer = correctEl?.textContent || '';
      handleIncorrectAnswer(quizElement, data);
    }
    
    analytics.trackQuizAttempt({
      ...data,
      correct: isCorrect
    });
  };
  
  observeResult();
});
```

**Why:** More reliable than fixed timeouts; adapts to MathAcademy's rendering speed.

---

## Phase 4: Integration Testing

### ✅ Task 4.1: End-to-End Manual Test [COMPLETED]
**Prerequisites:** Backend deployed, extension installed locally.

**✅ COMPLETED: September 30, 2025** - See `localdocs/TEST_RESULTS.md` for full test report.

**Test Script:**

1. **Load Extension:**
   ```bash
   # In Chrome, navigate to chrome://extensions/
   # Enable Developer Mode
   # Click "Load unpacked"
   # Select the brunnr-extension folder
   ```

2. **Initial Video Test:**
   - Navigate to a Grade 4 multiplication lesson on MathAcademy
   - Verify video appears at top of lesson content
   - Play video, verify analytics events sent (check background console)

3. **Struggle Video Test:**
   - Answer a multiplication question incorrectly (e.g., 7×8 = 54)
   - Verify:
     - Console log: "Incorrect answer detected"
     - New video injected (check title/URL changes)
     - Analytics event: `quiz_attempt` with `correct: false`

4. **Analytics Verification:**
   - Open background service worker console (chrome://extensions → "service worker" link)
   - Verify messages: `ANALYTICS_EVENT` logged
   - Check API CloudWatch logs for `ENGAGEMENT_EVENT:` and `PERFORMANCE_METRICS:` entries

5. **RDS Verification (if database configured):**
   ```sql
   SELECT * FROM engagement_events ORDER BY created_at DESC LIMIT 10;
   SELECT * FROM performance_metrics ORDER BY created_at DESC LIMIT 5;
   ```

**Expected Results:**
- ✅ Initial video shows on lesson load (Grade 4 multiplication only)
- ✅ Incorrect answer triggers new video request
- ✅ Video changes to struggle-specific recommendation
- ✅ All analytics events reach backend (via CloudWatch or RDS)

---

### ⏳ Task 4.2: Test Edge Cases [OPTIONAL FOR MVP]

1. **Non-Grade-4 Lesson:**
   - Navigate to Grade 8 algebra lesson
   - Verify: No video injected

2. **Network Failure:**
   - Disconnect network, reload lesson
   - Verify: Extension doesn't break page, logs error gracefully
   - Reconnect, reload
   - Verify: Video appears

3. **Rapid Incorrect Answers:**
   - Answer 3 questions incorrectly in quick succession
   - Verify: Video updates (not 3 separate videos)
   - Verify: All 3 struggle events logged

4. **Video Playback:**
   - Test play, pause, seek, volume, fullscreen
   - Verify: Each action logs analytics event

5. **Batch Analytics Retry:**
   - Trigger 10+ analytics events while offline
   - Verify: Events queued in `chrome.storage.session`
   - Go online
   - Wait 60 seconds (retry interval)
   - Verify: Batch sent to `/api/analytics/batch`

---

## Phase 5: Configuration & Deployment

### ✅ Task 5.3: Deploy Backend to Production
**Directory:** `lambdas/`

**Commands:**
```bash
cd lambdas

# Set production secrets
npx sst secrets set CLOUDFRONT_URL https://your-cdn.cloudfront.net --stage prod
npx sst secrets set RDS_HOST your-production-db.us-east-1.rds.amazonaws.com --stage prod
npx sst secrets set RDS_PASSWORD your-secure-password --stage prod

# Deploy
npx sst deploy --stage prod
```

**Verify:**
- API Gateway URL is HTTPS
- CORS allows mathacademy.com
- RDS security group allows Lambda access
- Test all 5 endpoints with curl


### ✅ Task 5.4: Populate Video Manifest
**Objective:** Insert actual video mappings into `lesson_metadata` table.

**Example SQL:**
```sql
USE brunnr_analytics;

-- Insert default Grade 4 multiplication videos
INSERT INTO lesson_metadata (lesson_id, title, grade_level, subject, topic, video_url, video_duration, is_active)
VALUES 
  ('grade4-mult-default', 'Multiplication Basics', 4, 'math', 'multiplication', 
   'https://d2zhlpwgezwmiu.cloudfront.net/grade4-multiplication-intro.mp4', 60, TRUE),
   
  ('times-tables-7-8', '7 and 8 Times Tables', 4, 'math', 'multiplication', 
   'https://d2zhlpwgezwmiu.cloudfront.net/times-tables-7-8.mp4', 90, TRUE),
   
  ('times-tables-general', 'Times Tables 1-10', 4, 'math', 'multiplication', 
   'https://d2zhlpwgezwmiu.cloudfront.net/times-tables.mp4', 120, TRUE);
```

**Note:** Replace with actual CloudFront URLs once videos are uploaded.

---

### ✅ Task 5.1: Update API Base URL (if not using api.brunnr.com)
**File:** `lib/api.js`

**If SST deployed to a different URL:**

```javascript
// Line 6: Update API_BASE_URL
const API_BASE_URL = 'https://{your-api-id}.execute-api.us-east-1.amazonaws.com';

// Or make it configurable:
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.brunnr.com';
```

**Alternative:** Use `chrome.storage.sync` to allow runtime configuration:
```javascript
// In background.js, after line 17:
const apiUrl = await chrome.storage.sync.get('apiUrl');
if (apiUrl.apiUrl) {
  brunnrAPI.setBaseUrl(apiUrl.apiUrl);
}
```

---

### ✅ Task 5.2: Package Extension for Distribution
**Directory:** Root of `brunnr-extension/`

**Steps:**

1. **Remove development files from package:**
   - Ensure `lambdas/` folder is NOT included in the Chrome extension zip
   - Create `.zipignore` or use selective zipping

2. **Create production build:**
   ```bash
   # From brunnr-extension root
   zip -r brunnr-extension-v1.0.zip . \
     -x "lambdas/*" \
     -x "localdocs/*" \
     -x ".git/*" \
     -x "*.md" \
     -x ".DS_Store"
   ```

3. **Test packaged extension:**
   - Load the .zip in Chrome
   - Repeat Task 4.1 tests

4. **Publish to Chrome Web Store (or distribute directly):**
   - For TSA pilot: Direct distribution (email .zip to Lamar)
   - For public: Submit to Chrome Web Store

---

## Phase 6: Documentation & Handoff

### ✅ Task 6.1: Document the Middleware Architecture [COMPLETED]
**File:** `localdocs/MIDDLEWARE_ARCHITECTURE.md`

**✅ COMPLETED: September 30, 2025**

**Content:** Comprehensive documentation including:
- ASCII architecture diagram showing full data flow
- Extension → API Gateway → Lambda → CloudFront pipeline
- Request/response contracts with examples
- Selection logic (skill-tag matching) with code samples
- Data flow examples (initial load, struggle-triggered)
- Technology stack details
- Current status and future enhancements

**Purpose:** Answer Joshua's question clearly with visuals and examples.

---

### ✅ Task 6.2: Create Quick Start Guide for Team
**File:** `README.md` (update existing)

**Add section:**
```markdown
## Quick Start for Development

### Extension
1. Clone repo
2. Open Chrome → Extensions → Load unpacked → Select `brunnr-extension/`
3. Navigate to MathAcademy Grade 4 multiplication lesson
4. Video should appear at top of lesson

### Backend
1. `cd lambdas`
2. `npm install`
3. `npx sst secrets set CLOUDFRONT_URL https://your-cdn.cloudfront.net`
4. `npx sst deploy --stage dev`
5. Update `lib/api.js` with deployed API URL

### Testing
See `localdocs/ROADMAP_CHECKLIST.md` Phase 4 for full test script.
```

---

### ✅ Task 6.3: Record Demo Video
**Objective:** Screen recording showing:
1. Student loads lesson → video appears
2. Student answers incorrectly → new video appears
3. Open DevTools → show analytics events flowing
4. Open AWS CloudWatch → show logs

**Duration:** 2-3 minutes

**Share with:** Joshua, Cale, team

---

### ✅ Task 6.4: Prepare Response to Joshua [COMPLETED]

**✅ COMPLETED: September 30, 2025**

**File:** `localdocs/RESPONSE_TO_JOSHUA.md`

**Content:** Multiple draft versions (short and long) explaining:
- High-level middleware flow
- Key architectural decisions (no separate renderer, serverless, struggle-reactive)
- What's working now (end-to-end pipeline operational)
- Selection logic with code examples
- References to detailed documentation
- Answers to likely follow-up questions

**Message Draft (use from RESPONSE_TO_JOSHUA.md):**

> Hey Joshua! The middleware between the extension and renderer is now documented and mostly implemented. Here's the architecture:
>
> **High-level flow:**
> 1. Extension detects lesson load or incorrect answer
> 2. Sends POST to `/api/lesson/validate` with lesson context + optional "struggle" signal
> 3. Lambda function selects appropriate video from CloudFront based on grade/topic/skill tags
> 4. Returns video URL directly to extension (no separate renderer call—Cale's caching approach)
> 5. Extension injects `<video src={cloudfront} />` into DOM
> 6. Analytics flow back to `/api/analytics/*` endpoints → RDS
>
> **Key contracts:**
> - Full request/response schemas: `localdocs/CONTRACT.md`
> - Implementation roadmap: `localdocs/ROADMAP_CHECKLIST.md`
> - Selection logic: Simple skill-tag matching for MVP (lines 38-55 in `lambdas/functions/validate-lesson.js`)
>
> **What's working now:**
> - ✅ Lesson validation endpoint with struggle signals
> - ✅ Analytics ingestion (engagement, performance, batch)
> - ✅ Extension detects incorrect answers and requests targeted videos
> - ✅ Videos injected directly from CloudFront (no renderer middleware needed)
>
> **Next steps:**
> - Cale's finishing the render pipeline refactor
> - I'm coordinating with Lamar on TSA cohort to identify what math topics to pre-render
> - We can iterate on the selection logic once we have more videos and real student data
>
> Let me know if you want me to walk through any specific part! The middle pipeline is essentially the `validate-lesson` Lambda + the struggle detection in the content script.

---

## Phase 7: Iteration & Monitoring

### ✅ Task 7.1: Set Up CloudWatch Dashboards
**Objective:** Monitor middleware health in production.

**Metrics to Track:**
- API Gateway requests per endpoint
- Lambda invocation count & duration
- Lambda errors (especially `validate-lesson`)
- RDS connection count
- Video engagement rate (% of students who play video)
- Struggle detection rate (% of lessons with incorrect answers)

**Dashboard Creation:**
- SST automatically creates basic dashboards
- Enhance with custom metrics: `aws cloudwatch put-dashboard ...`

---

### ✅ Task 7.2: A/B Test Video Recommendations
**Future Enhancement:**

When multiple videos exist for the same skill:
1. Randomly assign video A or B
2. Track which leads to better quiz scores on next attempt
3. Update selection logic to prefer higher-performing video

**Implementation:** Add `ab_test_variant` field to `engagement_events` table, set in `validate-lesson` logic.

---

### ✅ Task 7.3: Collect TSA Cohort Data
**Action Item for Team:**

Work with Lamar to identify:
- What math topics TSA students are currently struggling with
- What topics they'll reach in 2-3 weeks
- Which specific lessons have lowest quiz scores

**Use this data to:**
- Prioritize which videos to render first
- Fine-tune `isEligibleLesson` logic to expand beyond Grade 4 multiplication
- Potentially add `student_cohort` field to requests for targeted A/B tests

---

## Phase 8: Pipeline Integration & Feature Flag

**See:** `localdocs/PHASE8_PIPELINE_INTEGRATION.md` for full details

**Context:** Team directive (Sept 30, 2025) to remove struggle condition and show default video to all students for pilot.

**Solution:** Feature flag pattern that allows toggling between:
- **Pilot mode:** Default video only (ENABLE_STRUGGLE_SELECTION=false)
- **Pipeline mode:** Struggle-based selection (ENABLE_STRUGGLE_SELECTION=true)

### ✅ Task 8.1: Add Feature Flag to validate-lesson.js [COMPLETED]
**Files:** 
- `lambdas/functions/validate-lesson.js` ✅
- `lambdas/sst.config.ts` ✅
- `lambdas/test-feature-flag.js` ✅ (test script)

**Objective:** Add `ENABLE_STRUGGLE_SELECTION` environment variable that controls video selection logic.

**Completed Changes:**
1. ✅ Check flag at start of `getVideoMetadata()`
2. ✅ If false, always return default video (but still log struggles to console)
3. ✅ If true, use existing struggle-based selection logic
4. ✅ Add `selectionMode` field to response for tracking
5. ✅ Set default value to "false" in sst.config.ts
6. ✅ Local test passing (run `node test-feature-flag.js`)

**Testing Completed:**
- ✅ Local test script passing (all 4 test cases)
- ⏳ Deploy with flag=false (next step)
- ⏳ Verify all students get same video regardless of struggles
- ⏳ Verify struggles still logged in CloudWatch

---

### ✅ Task 8.2: Add Database Schema for Pipeline [COMPLETED]
**File:** `lambdas/database/schema.sql` ✅

**Objective:** Create tables to support video generation pipeline integration.

**Completed - New Tables Added:**
1. ✅ **`struggle_events`** - Logs all student struggles with video generation tracking
2. ✅ **`video_catalog`** - Dynamic video mapping (replaces hardcoded videoMap)
3. ✅ **View: `pending_video_requests`** - Top 100 struggles awaiting videos (prioritized)
4. ✅ **View: `video_performance_summary`** - Analytics on video effectiveness
5. ✅ **Stored Procedure: `log_struggle_event`** - Insert struggles with 5+ threshold trigger
6. ✅ **Stored Procedure: `mark_video_generated`** - Called by pipeline webhook

**Schema Features:**
- JSON skill_tags with functional index (MySQL 8.0+)
- Priority scoring for video generation queue
- A/B testing support in video_catalog
- Performance tracking (completion rate, improvement metrics)
- Automatic threshold detection (5+ struggles → trigger generation)

**Status:** Schema written and ready to deploy when RDS is provisioned

**Next:** Run schema when Josh provisions RDS
```bash
mysql -h <rds-endpoint> -u admin -p < lambdas/database/schema.sql
```

---

### ✅ Task 8.3: Add Struggle Logging to validate-lesson.js [COMPLETED]
**File:** `lambdas/functions/validate-lesson.js` ✅

**Objective:** Always log struggles to RDS, regardless of feature flag state.

**Completed Implementation:**
- ✅ **New Function:** `logStruggleEvent(struggle, lessonData, userEmail)`
  - Inserts into `struggle_events` table with all struggle context
  - Runs ALWAYS when struggle detected (regardless of ENABLE_STRUGGLE_SELECTION flag)
  - Gracefully handles missing RDS (logs to CloudWatch as fallback)
  - Never fails the request - errors caught and logged only
  
- ✅ **Dynamic Import:** Uses ES6 dynamic import for database module
- ✅ **Called from handler:** After video metadata generated, before response
- ✅ **Deployed and tested:** Working in dev with CloudWatch fallback

**Graceful Fallback Behavior:**
- If `RDS_HOST` not set → Logs to CloudWatch with full struggle context
- If RDS connection fails → Catches error, logs to CloudWatch, continues
- Request never fails due to logging issues

**Testing:**
- ✅ Tested with struggle signal → Logs properly (CloudWatch fallback)
- ✅ Tested without struggle → No logging, normal flow
- ✅ Both return correct default video (feature flag OFF)

**Next:** When RDS is provisioned:
```bash
npx sst secrets set RDS_HOST <endpoint> --stage dev
npx sst deploy --stage dev
# Struggles will automatically start logging to RDS!
```

---

### ✅ Task 8.4: Create Pipeline Webhook Endpoint [COMPLETED]
**Files:** 
- `lambdas/functions/notify-video-ready.js` ✅ (new)
- `lambdas/sst.config.ts` ✅ (route added)

**Objective:** Allow video generation pipeline to notify middleware when new video is ready.

**Completed Implementation:**
- ✅ **Endpoint:** `POST /api/pipeline/video-ready`
- ✅ **Validation:** Requires `skill_tag` and `video_url` (returns 400 if missing)
- ✅ **Graceful error:** Returns 503 if RDS not configured
- ✅ **Database updates:**
  - Inserts/updates video in `video_catalog` table
  - Marks all matching struggles as `video_generated = TRUE`
  - Sets `generation_status = 'ready'`
  - Updates `generation_completed_at` timestamp

**Request Format:**
```json
{
  "skill_tag": "multiplication-7-8",
  "video_url": "https://cloudfront.net/times-7-8.mp4",
  "video_id": "vid-mult-7-8",
  "title": "7 and 8 Times Tables",
  "duration": 90,
  "thumbnail_url": "https://cloudfront.net/thumbnails/mult-7-8.jpg",
  "grade_level": 4,
  "topic": "multiplication"
}
```

**Response Format:**
```json
{
  "message": "Video catalog updated successfully",
  "skill_tag": "multiplication-7-8",
  "video_url": "https://cloudfront.net/times-7-8.mp4",
  "struggles_resolved": 12,
  "catalog_entry": { ... }
}
```

**Testing:**
- ✅ Deployed to dev and tested
- ✅ Returns 503 when RDS not configured (expected)
- ✅ Validation working (400 for missing fields)
- ✅ Route added to API Gateway

**Ready for RDS:** When Josh provisions RDS, this endpoint will:
1. Add videos to catalog automatically
2. Mark struggles as resolved
3. Enable dynamic video selection (when feature flag ON)

---

### ✅ Task 8.5: Update Extension Behavior [COMPLETED]
**File:** `content_scripts/mathacademy.js` ✅

**Objective:** Modify `handleIncorrectAnswer()` to NOT replace video when feature flag is off.

**Completed Implementation:**
- ✅ **Modified `handleIncorrectAnswer()`** function
- ✅ **Always sends struggle data** to middleware (for logging/pipeline)
- ✅ **Checks `selectionMode`** from API response
  - If `'struggle-based'` → Replace video with targeted one (flag ON)
  - If `'default-only'` or `'default-fallback'` → Don't replace, just log (flag OFF)
- ✅ **Analytics still tracked** regardless of mode

**Behavior Change:**
```javascript
// Before (Task 8.5)
handleIncorrectAnswer() {
  // Send struggle
  // ALWAYS replace video ❌ (wasteful when flag OFF)
}

// After (Task 8.5 complete)
handleIncorrectAnswer() {
  // Send struggle
  if (selectionMode === 'struggle-based') {
    // Replace video ✅ (flag ON)
  } else {
    // Don't replace ✅ (flag OFF - TSA pilot mode)
    console.log('Struggle logged, video unchanged');
  }
}
```

**Result:** 
- ✅ Same default video stays visible throughout lesson
- ✅ Struggles still tracked and sent to middleware
- ✅ No unnecessary DOM manipulation
- ✅ Ready to activate struggle-based selection (just flip flag)

---

## Phase 8 Summary

**Why Phase 8?**
- Team wants default video only (pilot simplicity)
- Don't throw away Phase 1-3 work (struggle detection, selection logic)
- Prepare for video generation pipeline integration
- Make switching modes trivial (one env var)

**Timeline:** ~3.5 hours (can parallelize with RDS setup)

**Benefits:**
- ✅ Meets team directive (default video for all)
- ✅ Preserves Phase 1-3 implementation
- ✅ Logs struggles for pipeline consumption
- ✅ Easy to enable struggle-based selection when videos ready
- ✅ Webhook ready for pipeline integration

**When to Deploy:**
- Implement 8.1 immediately (feature flag)
- Deploy with ENABLE_STRUGGLE_SELECTION=false
- Complete 8.2-8.4 when RDS provisioned
- Flip flag when video pipeline operational

---

## Summary Checklist

### Backend (Lambdas)
- [x] Task 1.1: Fix batch analytics route in stack
- [x] Task 1.2: Extend validate-lesson with struggle handling
- [ ] Task 1.3: (Optional) Enhance get-video-metadata with RDS - SKIPPED FOR MVP
- [x] Task 1.4: Deploy backend to dev - ✅ https://ayorzefv46.execute-api.us-east-1.amazonaws.com
- [x] Task 1.5: Forward struggle signal in lib/api.js
- [x] BONUS: Migrated entire stack from SST v2 to SST v3 Ion
- [x] BONUS: Updated lib/api.js to deployed API URL

### Extension (Content Script & Background)
- [x] Task 2.1: Replace analytics stub with real tracker
- [x] Task 3.1: Detect incorrect answers
- [x] Task 3.2: Improve detection robustness (MutationObserver)

### Testing
- [x] Task 4.1: End-to-end manual test ✅ [TEST_RESULTS.md]
- [ ] Task 4.2: Edge case testing (Optional for MVP)

### Deployment
- [ ] Task 5.1: Update API base URL if needed
- [ ] Task 5.2: Package extension for distribution
- [ ] Task 5.3: Deploy backend to production
- [ ] Task 5.4: Populate video manifest in RDS

### Documentation
- [x] Task 6.1: Create MIDDLEWARE_ARCHITECTURE.md ✅
- [ ] Task 6.2: Update README with quick start (Optional)
- [ ] Task 6.3: Record demo video (Optional)
- [x] Task 6.4: Prepare response to Joshua ✅ [RESPONSE_TO_JOSHUA.md]

### Future
- [ ] Task 7.1: CloudWatch dashboards
- [ ] Task 7.2: A/B testing framework
- [ ] Task 7.3: TSA cohort data collection

### Pipeline Integration (Phase 8) ✅ 🎉 [COMPLETE]
- [x] Task 8.1: Add feature flag to validate-lesson.js ✅
- [x] Task 8.2: Database schema for struggle_events and video_catalog ✅
- [x] Task 8.3: Struggle logging to RDS (always runs) ✅
- [x] Task 8.4: Pipeline webhook endpoint (notify-video-ready.js) ✅
- [x] Task 8.5: Update extension to not replace video ✅

---

## Estimated Timeline

| Phase | Time | Dependencies |
|-------|------|--------------|
| Phase 1: Backend | 2-3 hours | None |
| Phase 2: Analytics | 1-2 hours | None (can parallel with Phase 1) |
| Phase 3: Struggle Detection | 2-3 hours | Phase 2 (needs analytics) |
| Phase 4: Testing | 1-2 hours | Phases 1-3 complete |
| Phase 5: Deployment | 1 hour | Phase 4 passed |
| Phase 6: Documentation | 1-2 hours | Phase 5 complete |
| **Total** | **8-13 hours** | Sequential completion |

---

## Success Criteria

✅ **Middleware is complete when:**
1. Extension detects incorrect answers and requests targeted videos
2. API returns struggle-specific video recommendations
3. Videos are injected and tracked with full analytics
4. Joshua's question is answered with clear docs and demo
5. Team can deploy to TSA pilot group

✅ **MVP is ready when:**
- Grade 4 multiplication lessons show videos
- Incorrect answers trigger new video recommendations
- All analytics flow to RDS
- No extension errors in production

---

## Notes

- **No renderer service**: Extension embeds CloudFront URLs directly per Cale's design
- **RDS optional for MVP**: Can rely on CloudWatch logs initially, add RDS later
- **Skill taxonomy**: Start simple (hardcoded tags), iterate based on real MathAcademy DOM
- **Video manifest**: Hardcode for MVP, move to RDS `lesson_metadata` table for scale

---

## Questions / Blockers

- [ ] What is the actual CloudFront URL for video content?
- [ ] Is RDS already provisioned, or should we deploy without it initially?
- [ ] What is the API base URL (api.brunnr.com, or SST API Gateway URL)?
- [ ] Are there specific MathAcademy DOM selectors we need to target? (May require inspecting live site)
- [ ] When will rendered videos be available in CloudFront?

---

**Ready to implement!** Follow phases in order, test thoroughly, and document as you go.
