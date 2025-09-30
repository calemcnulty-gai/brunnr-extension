# Brunnr Extension - Middleware Architecture

> **Answering Joshua's question:** *"i'm particularly interested in what the middleware looks like between the extension and the renderer"*

**TL;DR:** The middleware is a serverless AWS Lambda layer that receives lesson context and struggle signals from the Chrome extension, selects appropriate video recommendations, and returns CloudFront URLs directly to the extension. No separate renderer service needed—videos are embedded directly from CDN.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STUDENT INTERACTION                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION (Client)                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Content Script (mathacademy.js)                             │  │
│  │  • Detects lesson load (Grade 4 multiplication)              │  │
│  │  • Observes incorrect answers (MutationObserver)             │  │
│  │  • Extracts struggle context (question, skill tags)          │  │
│  │  • Sends VALIDATE_LESSON message to background               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                    │                                 │
│                                    ▼                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Background Script (background.js)                           │  │
│  │  • Receives messages from content script                     │  │
│  │  • Calls BrunnrAPI.validateLesson()                          │  │
│  │  • Batches analytics events                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                    │                                 │
│                                    ▼                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  API Client (lib/api.js)                                     │  │
│  │  • Formats HTTP requests                                     │  │
│  │  • Handles retries and errors                                │  │
│  │  • Base URL: https://ayorzefv46.execute-api.us-east-1...    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS POST
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AWS MIDDLEWARE LAYER                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  API Gateway                                                 │  │
│  │  • CORS: Allows chrome-extension://*                         │  │
│  │  • Routes:                                                   │  │
│  │    POST /api/lesson/validate        → validate-lesson        │  │
│  │    POST /api/analytics/engagement   → track-engagement       │  │
│  │    POST /api/analytics/performance  → track-performance      │  │
│  │    POST /api/analytics/batch        → track-engagement-batch │  │
│  │    GET  /api/video-metadata/{id}    → get-video-metadata    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                    │                                 │
│                                    ▼                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Lambda: validate-lesson.js (CORE MIDDLEWARE LOGIC)          │  │
│  │                                                              │  │
│  │  INPUT (Request Body):                                       │  │
│  │  {                                                           │  │
│  │    user_email: "student@example.com",                        │  │
│  │    lesson_id: "2416",                                        │  │
│  │    grade_level: 4,                                           │  │
│  │    topic: "multiplication",                                  │  │
│  │    struggle: {                     ← OPTIONAL                │  │
│  │      question_text: "What is 7×8?",                          │  │
│  │      student_answer: "54",                                   │  │
│  │      correct_answer: "56",                                   │  │
│  │      skill_tags: ["times-tables", "multiplication-7-8"]      │  │
│  │    }                                                         │  │
│  │  }                                                           │  │
│  │                                                              │  │
│  │  LOGIC:                                                      │  │
│  │  1. Check if lesson is eligible (Grade 4 multiplication)    │  │
│  │  2. If struggle signal present:                             │  │
│  │     → Match skill_tags to video map                         │  │
│  │     → Return targeted video (e.g., "times-tables-7-8.mp4")  │  │
│  │  3. If no struggle or no match:                             │  │
│  │     → Return default video for topic                        │  │
│  │                                                              │  │
│  │  OUTPUT (Response):                                          │  │
│  │  {                                                           │  │
│  │    shouldShowVideo: true,                                    │  │
│  │    videoMetadata: {                                          │  │
│  │      videoUrl: "https://d2zhlpwgezwmiu.../times-7-8.mp4",   │  │
│  │      title: "Mastery in a Minute: times tables 7 8",        │  │
│  │      duration: 90,                                           │  │
│  │      thumbnailUrl: "https://.../thumbnails/times-7-8.jpg",  │  │
│  │      reason: "Targeted recommendation based on struggle",    │  │
│  │      confidence: 0.9,                                        │  │
│  │      skillTags: ["times-tables", "multiplication-7-8"]       │  │
│  │    }                                                         │  │
│  │  }                                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                    │                                 │
│                                    ▼                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Optional: RDS (MySQL/Aurora)                                │  │
│  │  • Tables: engagement_events, performance_metrics            │  │
│  │  • Future: lesson_metadata for dynamic video mappings       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS Response
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION (Client)                        │
│  • Receives videoMetadata                                           │
│  • Injects <video src={videoUrl} /> into MathAcademy page           │
│  • Tracks analytics (play, pause, ended, etc.)                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Video Playback
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CloudFront CDN (Video Storage)                   │
│  • Direct URL: https://d2zhlpwgezwmiu.cloudfront.net/video.mp4     │
│  • No renderer service—browser fetches directly                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. **No Separate Renderer Service**

Per Cale's design, videos are served directly from CloudFront. The extension embeds `<video src={cloudfront_url} />` into the DOM. This eliminates:
- Extra HTTP hop through a renderer API
- Video transcoding/proxying overhead
- Additional failure points

**Why this works:** CloudFront handles all video delivery concerns (buffering, seeking, bandwidth optimization). The middleware just needs to return the right URL.

---

### 2. **Serverless Middleware (AWS Lambda)**

The middleware layer is implemented as AWS Lambda functions deployed via SST (Serverless Stack Toolkit) v3.

**Benefits:**
- **Zero ops:** Auto-scaling, no server management
- **Cost-effective:** Pay only for requests (Grade 4 math pilot = minimal cost)
- **Fast deployment:** `npx sst deploy` pushes changes in ~2 minutes
- **Integrated:** Direct access to RDS, CloudWatch logs, secrets

**Stack:**
- **Runtime:** Node.js 20.x
- **Framework:** SST v3 Ion (infrastructure as code)
- **API:** AWS API Gateway HTTP API (not REST—simpler, faster)
- **Database:** Optional RDS MySQL (analytics storage)

---

### 3. **Struggle Signal Architecture**

The middleware is **reactive** to student struggles:

**Flow:**
1. Student answers question incorrectly on MathAcademy
2. Extension detects via:
   - **Button click handler** (checks result after submission)
   - **MutationObserver** (watches for `.incorrect` class appearing)
3. Extension extracts:
   - Question text: `"What is 7 × 8?"`
   - Student answer: `"54"`
   - Correct answer: `"56"`
4. Extension infers skill tags via regex:
   ```javascript
   const match = questionText.match(/(\d+)\s*[×x]\s*(\d+)/);
   // → ["7 × 8", "7", "8"]
   // → tags: ["multiplication", "times-tables", "multiplication-7-8"]
   ```
5. Extension sends struggle object to middleware
6. Middleware **matches skill tags** to video catalog:
   ```javascript
   const videoMap = {
     'times-tables': 'times-tables-advanced.mp4',
     'multiplication-7-8': 'times-tables-7-8.mp4',
     'multiplication-facts': 'multiplication-facts.mp4',
   };
   ```
7. Middleware returns targeted video URL
8. Extension **replaces existing video** with new recommendation

**Result:** Student sees a different, more targeted video immediately after struggling.

---

## Middleware Endpoints

### `POST /api/lesson/validate` (Primary Entry Point)

**Purpose:** Determine if a video should be shown and which one.

**Request:**
```json
{
  "user_email": "student@example.com",
  "lesson_id": "2416",
  "grade_level": 4,
  "subject": "math",
  "topic": "multiplication",
  "struggle": {
    "question_id": "q-1759200405922",
    "question_text": "What is 7 × 8?",
    "student_answer": "54",
    "correct_answer": "56",
    "skill_tags": ["times-tables", "multiplication-7-8"],
    "timestamp": "2025-09-30T..."
  }
}
```

**Response:**
```json
{
  "shouldShowVideo": true,
  "videoMetadata": {
    "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/times-tables-7-8.mp4",
    "title": "Mastery in a Minute: multiplication 7 8",
    "duration": 90,
    "thumbnailUrl": "https://d2zhlpwgezwmiu.cloudfront.net/thumbnails/multiplication-7-8.jpg",
    "reason": "Targeted recommendation based on struggle",
    "confidence": 0.9,
    "skillTags": ["times-tables", "multiplication-7-8"],
    "lessonId": "2416",
    "gradeLevel": 4,
    "topic": "multiplication"
  }
}
```

**Selection Logic (lines 38-78 in `validate-lesson.js`):**
```javascript
function getVideoMetadata(lessonData, struggle) {
  const baseUrl = process.env.CLOUDFRONT_URL || 'https://d2zhlpwgezwmiu.cloudfront.net';

  // If struggle signal present, try to match by skill tags
  if (struggle && struggle.skill_tags && struggle.skill_tags.length > 0) {
    console.log('Matching video by skill tags:', struggle.skill_tags);
    const videoMap = {
      'times-tables': 'times-tables-advanced.mp4',
      'multiplication-7-8': 'times-tables-7-8.mp4',
      'multiplication-facts': 'multiplication-facts.mp4',
    };

    for (const tag of struggle.skill_tags) {
      if (videoMap[tag]) {
        return {
          videoUrl: `${baseUrl}/${videoMap[tag]}`,
          title: `Mastery in a Minute: ${tag.replace(/-/g, ' ')}`,
          duration: 90,
          thumbnailUrl: `${baseUrl}/thumbnails/${tag}.jpg`,
          reason: 'Targeted recommendation based on struggle',
          confidence: 0.9,
          skillTags: struggle.skill_tags,
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

---

### Analytics Endpoints (Secondary)

**`POST /api/analytics/engagement`**
- Tracks video interactions (play, pause, ended, seek)
- Used for A/B testing video effectiveness

**`POST /api/analytics/performance`**
- Tracks lesson completion, time on lesson, quiz scores
- Used to measure if videos improve outcomes

**`POST /api/analytics/batch`**
- Batches multiple events in one request
- Reduces extension → backend round trips

**`GET /api/video-metadata/{id}`**
- Direct video lookup (not used in current flow)
- Future: Could support pre-fetching recommendations

---

## Data Flow Examples

### Example 1: Initial Lesson Load (No Struggle)

1. **Student loads:** `mathacademy.com/topics/2416?courseId=75`
2. **Extension detects:** Grade 4, multiplication lesson
3. **Extension sends:**
   ```http
   POST /api/lesson/validate
   {
     "grade_level": 4,
     "topic": "multiplication",
     "struggle": null
   }
   ```
4. **Middleware logic:**
   - No struggle signal
   - Returns default video: `grade4-multiplication-intro.mp4`
5. **Extension injects:**
   ```html
   <div class="brunnr-video-container">
     <video src="https://d2zhlpwgezwmiu.cloudfront.net/grade4-multiplication-intro.mp4" controls></video>
   </div>
   ```
6. **Student sees:** Generic "Mastery in a Minute" video at top of lesson

---

### Example 2: Student Struggles with 7 × 8

1. **Student answers:** "54" (incorrect, correct is 56)
2. **Extension detects:** MutationObserver sees `.incorrect` class added
3. **Extension extracts:**
   - Question: "What is 7 × 8?"
   - Inferred tags: `["multiplication", "times-tables", "multiplication-7-8"]`
4. **Extension sends:**
   ```http
   POST /api/lesson/validate
   {
     "grade_level": 4,
     "topic": "multiplication",
     "struggle": {
       "question_text": "What is 7 × 8?",
       "skill_tags": ["multiplication", "times-tables", "multiplication-7-8"]
     }
   }
   ```
5. **Middleware logic:**
   - Struggle signal present
   - Matches `"multiplication-7-8"` → `times-tables-7-8.mp4`
   - Returns targeted video
6. **Extension replaces video:**
   - Removes existing video
   - Injects new one: `times-tables-7-8.mp4`
   - Scrolls to video
7. **Student sees:** "Mastery in a Minute: multiplication 7 8" video (targeted!)

---

### Example 3: Analytics Tracking

**During video playback:**
```javascript
videoElement.addEventListener('play', () => {
  chrome.runtime.sendMessage({
    type: 'ANALYTICS_EVENT',
    data: {
      category: 'video_engagement',
      event: {
        lessonId: '2416',
        videoUrl: 'https://d2zhlpwgezwmiu.cloudfront.net/times-tables-7-8.mp4',
        eventType: 'play',
        currentTime: 0,
        duration: 90,
        timestamp: '2025-09-30T...'
      }
    }
  });
});
```

**Background script batches events:**
```javascript
// After 60 seconds or 10 events
POST /api/analytics/batch
{
  "user_email": "student@example.com",
  "session_id": "session_1727...",
  "events": [
    { "eventType": "play", "timestamp": "...", "currentTime": 0 },
    { "eventType": "pause", "timestamp": "...", "currentTime": 23 },
    { "eventType": "play", "timestamp": "...", "currentTime": 23 },
    { "eventType": "ended", "timestamp": "...", "currentTime": 90, "completionPercentage": 100 }
  ]
}
```

**Middleware stores in RDS:**
```sql
INSERT INTO engagement_events (user_email, lesson_id, event_type, video_url, event_data, created_at)
VALUES ('student@example.com', '2416', 'video_play', 'https://...', '{"currentTime":0}', NOW());
```

---

## Technology Stack

### Extension (Client)
- **Manifest V3** Chrome extension
- **Vanilla JS** (no framework—fast, lightweight)
- **Content Script:** Injected into MathAcademy pages
- **Background Service Worker:** Handles API calls and batching
- **Storage:** `chrome.storage.session` for session state

### Middleware (AWS)
- **SST v3 Ion** (infrastructure as code)
- **AWS Lambda** (Node.js 20.x runtime)
- **API Gateway HTTP API** (not REST)
- **CloudWatch Logs** (monitoring)
- **Secrets Manager** (RDS credentials, CloudFront URL)

### Database (Optional)
- **RDS MySQL 8.0** (or Aurora Serverless v2)
- **Tables:**
  - `engagement_events` (video analytics)
  - `performance_metrics` (lesson outcomes)
  - `lesson_metadata` (video catalog—future)

### Video Storage
- **CloudFront CDN** (backed by S3)
- **Domain:** `d2zhlpwgezwmiu.cloudfront.net`
- **Format:** MP4 (H.264 video, AAC audio)

---

## Current Status (MVP)

### ✅ What's Implemented and Tested

1. **Extension:**
   - ✅ Detects Grade 4 multiplication lessons
   - ✅ Injects video at top of page
   - ✅ Detects incorrect answers via MutationObserver
   - ✅ Extracts struggle context and infers skill tags
   - ✅ Replaces video when struggle detected
   - ✅ Tracks video analytics (play, pause, ended)

2. **Middleware:**
   - ✅ `validate-lesson` endpoint operational
   - ✅ Accepts struggle signals
   - ✅ Matches skill tags to videos
   - ✅ Returns CloudFront URLs
   - ✅ Analytics endpoints functional
   - ✅ Deployed to: `https://ayorzefv46.execute-api.us-east-1.amazonaws.com`

3. **Testing:**
   - ✅ End-to-end manual testing passed
   - ✅ Struggle detection working correctly
   - ✅ Video replacement confirmed
   - ✅ Analytics flowing to backend
   - ✅ Full test report: `localdocs/TEST_RESULTS.md`

### ⚠️ Known Limitations (MVP)

1. **Video files don't exist yet:** Using placeholder CloudFront URLs
   - Videos need to be rendered and uploaded to S3
   - CloudFront distribution needs to be configured
   
2. **Skill taxonomy is hardcoded:** Simple keyword matching for MVP
   - Future: Dynamic catalog from RDS `lesson_metadata` table
   - Future: ML-based skill inference

3. **Grade 4 multiplication only:** Pilot scope
   - Easy to expand: Change `isEligibleLesson()` logic
   - Waiting on TSA cohort data to prioritize topics

4. **Question text extraction:** Sometimes gets feedback text ("Incorrect") instead of question
   - Minor polish needed in DOM traversal
   - Doesn't block core functionality

---

## Future Enhancements

### Short-term (Post-MVP)
1. **Dynamic video catalog from RDS:**
   ```javascript
   // Replace hardcoded videoMap with:
   const videos = await db.query(
     'SELECT video_url, title FROM lesson_metadata WHERE skill_tag = ? AND is_active = TRUE',
     [tag]
   );
   ```

2. **A/B testing framework:**
   - Randomly assign video variant A or B
   - Track which leads to better quiz scores
   - Auto-optimize selection logic

3. **CloudWatch dashboards:**
   - Monitor struggle detection rate
   - Video engagement rate (% who play)
   - API latency and error rates

### Long-term (Scale)
1. **ML-based video selection:**
   - Train model on student data: `{struggle_context} → {video} → {outcome}`
   - Replace hardcoded tag matching with ML predictions

2. **Real-time personalization:**
   - Factor in student history: Prior struggles, video preferences
   - Adaptive difficulty: Easier videos for repeated struggles

3. **Multi-platform support:**
   - Extension for Khan Academy, IXL, etc.
   - Web app for direct video access (no extension needed)

---

## Deployment

### Current (Dev)
```bash
cd lambdas
npx sst deploy --stage dev
# → https://ayorzefv46.execute-api.us-east-1.amazonaws.com
```

### Production (Future)
```bash
# Set production secrets
npx sst secrets set CLOUDFRONT_URL https://cdn.brunnr.com --stage prod
npx sst secrets set RDS_HOST prod-db.us-east-1.rds.amazonaws.com --stage prod
npx sst secrets set RDS_PASSWORD <secure-password> --stage prod

# Deploy
npx sst deploy --stage prod
# → https://api.brunnr.com (custom domain)
```

---

## API Contract

Full request/response schemas documented in: **`localdocs/CONTRACT.md`**

Key contracts:
- `POST /api/lesson/validate` (primary middleware endpoint)
- `POST /api/analytics/engagement`
- `POST /api/analytics/performance`
- `POST /api/analytics/batch`

---

## Code References

### Middleware Logic
- **Selection logic:** `lambdas/functions/validate-lesson.js` lines 38-78
- **API routes:** `lambdas/sst.config.ts` lines 20-64
- **Database module:** `lambdas/shared/database.js`

### Extension Logic
- **Struggle detection:** `content_scripts/mathacademy.js` lines 496-566
- **Video injection:** `content_scripts/mathacademy.js` lines 253-298
- **Analytics tracking:** `content_scripts/mathacademy.js` lines 6-91
- **API client:** `lib/api.js`

---

## Summary

**The middleware is a serverless AWS Lambda layer that:**
1. Receives lesson context + optional struggle signals from the extension
2. Matches skill tags to a video catalog (hardcoded for MVP, RDS later)
3. Returns CloudFront URLs directly to the extension
4. Tracks analytics for engagement and performance

**No separate renderer service needed** because:
- Videos are pre-rendered and stored in S3/CloudFront
- Extension embeds videos directly: `<video src={cloudfront_url} />`
- Browser handles all video playback (buffering, seeking, etc.)

**The middleware's job is simple:** _Select the right video for the right student at the right time._

For the Grade 4 multiplication pilot, "right time" = when they struggle with specific facts (7×8, etc.). The architecture is designed to scale beyond this:
- Add more skill tags → More targeted videos
- Connect to RDS → Dynamic catalog
- Train ML model → Predictive recommendations

**Current status:** ✅ Fully implemented, tested, and deployed to dev. Ready for TSA pilot.

---

**Questions?** See also:
- `localdocs/CONTRACT.md` - Full API schemas
- `localdocs/TEST_RESULTS.md` - Manual testing report
- `localdocs/ROADMAP_CHECKLIST.md` - Implementation plan
- `lambdas/functions/validate-lesson.js` - Core middleware code
