# Brunnr Extension Middle Pipeline Contract

## Overview

The "middle pipeline" is the service layer between the Chrome extension (detecting student struggles) and the renderer (video content). It consists of:

1. **Extension → API**: Detection of failure events and requests for video recommendations
2. **API Logic**: Selection of appropriate video based on lesson context and struggle signals
3. **API → Extension**: Return video metadata with CloudFront URLs for direct embedding
4. **Analytics Flow**: Capture engagement and performance data back to the API

This document defines the exact request/response shapes and behavioral contract.

---

## 1. Lesson Validation & Video Selection

### Endpoint
```
POST /api/lesson/validate
```

### Purpose
- Determine if a lesson should show a video (initial page load)
- Recommend a specific video when student struggles (reactive recommendation)

### Request Schema

```typescript
{
  // User identification (at least one required)
  user_email?: string;           // "student@example.com"
  student_id?: string;            // Alternative identifier
  
  // Lesson context (required)
  lesson_id: string;              // "12345" or URL-derived
  lesson_url: string;             // "https://mathacademy.com/lesson/12345"
  lesson_title?: string;          // "Grade 4: Multiplication Basics"
  grade_level?: number;           // 4
  subject?: string;               // "math"
  topic?: string;                 // "multiplication"
  
  // Struggle signal (optional, triggers reactive recommendation)
  struggle?: {
    question_id?: string;         // "qa-abc123"
    question_text?: string;       // "What is 7 × 8?"
    student_answer?: string;      // "54"
    correct_answer?: string;      // "56"
    skill_tags?: string[];        // ["times-tables", "multiplication-7-8"]
    attempt?: number;             // 1, 2, 3...
    timestamp?: string;           // ISO 8601
  }
}
```

### Response Schema

```typescript
{
  should_show_video: boolean;
  
  // Only present if should_show_video is true
  video_metadata?: {
    videoUrl: string;             // "https://d2zhlpwgezwmiu.cloudfront.net/times-tables.mp4"
    title: string;                // "Mastery in a Minute: Times Tables"
    duration?: number;            // 120 (seconds)
    thumbnailUrl?: string;        // CloudFront thumbnail URL
    
    // Recommendation metadata
    reason?: string;              // "Mismatched 7×8 times table"
    confidence?: number;          // 0.0-1.0 recommendation confidence
    
    // Lesson context echo
    lessonId?: string;
    gradeLevel?: number;
    topic?: string;
  };
  
  // Optional: why video was not shown
  reason?: string;                // "Lesson does not meet criteria"
  
  user?: string;                  // Echo of user identifier
}
```

### Example 1: Initial Page Load (No Struggle)

**Request:**
```json
{
  "user_email": "student@tsa.org",
  "lesson_id": "ma-4-mult-001",
  "lesson_url": "https://mathacademy.com/lesson/multiplication-basics",
  "lesson_title": "Multiplication Facts 1-10",
  "grade_level": 4,
  "subject": "math",
  "topic": "multiplication"
}
```

**Response:**
```json
{
  "should_show_video": true,
  "video_metadata": {
    "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/grade4-multiplication-intro.mp4",
    "title": "Mastery in a Minute: Multiplication Basics",
    "duration": 60,
    "thumbnailUrl": "https://d2zhlpwgezwmiu.cloudfront.net/thumbnails/grade4-multiplication.jpg",
    "lessonId": "ma-4-mult-001",
    "gradeLevel": 4,
    "topic": "multiplication"
  },
  "user": "student@tsa.org"
}
```

### Example 2: Struggle Event (Reactive Recommendation)

**Request:**
```json
{
  "user_email": "student@tsa.org",
  "lesson_id": "ma-4-mult-001",
  "lesson_url": "https://mathacademy.com/lesson/multiplication-basics",
  "grade_level": 4,
  "topic": "multiplication",
  "struggle": {
    "question_id": "q-7x8",
    "question_text": "What is 7 × 8?",
    "student_answer": "54",
    "correct_answer": "56",
    "skill_tags": ["times-tables", "multiplication-7-8"],
    "attempt": 1,
    "timestamp": "2025-09-30T18:30:00Z"
  }
}
```

**Response:**
```json
{
  "should_show_video": true,
  "video_metadata": {
    "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/times-tables-7-8.mp4",
    "title": "Mastery in a Minute: 7 and 8 Times Tables",
    "duration": 90,
    "reason": "Student struggled with 7×8 (answered 54 instead of 56)",
    "confidence": 0.95,
    "skill_tags": ["times-tables", "multiplication-7-8"]
  },
  "user": "student@tsa.org"
}
```

### Example 3: Ineligible Lesson

**Request:**
```json
{
  "user_email": "student@tsa.org",
  "lesson_id": "ma-8-algebra-001",
  "grade_level": 8,
  "topic": "algebra"
}
```

**Response:**
```json
{
  "should_show_video": false,
  "reason": "Only Grade 4 multiplication is supported in this MVP"
}
```

---

## 2. Video Metadata Lookup (Optional Alternative Endpoint)

### Endpoint
```
GET /api/video/metadata/{lessonId}
```

### Purpose
Direct lookup of video by lesson ID (used for cached/known lessons)

### Response Schema
```typescript
{
  video_url: string;
  title: string;
  duration?: number;
  lesson_id: string;
  auth_headers?: object;          // For signed URLs (future)
  timestamp: string;              // ISO 8601
}
```

### Note
This endpoint is currently implemented but may be superseded by the unified `validate` endpoint with struggle signals. Keep for backward compatibility.

---

## 3. Analytics: Engagement Tracking

### Endpoint
```
POST /api/analytics/engagement
```

### Purpose
Track individual video interaction events (play, pause, seek, ended, etc.)

### Request Schema

```typescript
{
  // User identification
  user_email?: string;
  student_id?: string;
  
  // Context
  lesson_id: string;
  video_url: string;
  session_id: string;             // Generated by extension
  page_url: string;
  
  // Event details
  event_type: string;             // "play" | "pause" | "seek" | "ended" | "error"
  timestamp: string;              // ISO 8601
  
  // Video state
  current_time?: number;          // Playback position (seconds)
  duration?: number;              // Total duration
  playback_rate?: number;         // 1.0, 1.5, 2.0, etc.
  volume?: number;                // 0.0-1.0
  fullscreen?: boolean;
  
  // Additional metadata
  watched_segments?: number[];    // Array of 5-second segment indices watched
}
```

### Response Schema
```typescript
{
  success: boolean;
  message: string;
  event_id: string;
}
```

### Example

**Request:**
```json
{
  "user_email": "student@tsa.org",
  "lesson_id": "ma-4-mult-001",
  "video_url": "https://d2zhlpwgezwmiu.cloudfront.net/times-tables.mp4",
  "session_id": "session_1727721000_abc123",
  "page_url": "https://mathacademy.com/lesson/multiplication-basics",
  "event_type": "ended",
  "timestamp": "2025-09-30T18:35:42Z",
  "current_time": 90,
  "duration": 90,
  "playback_rate": 1.0,
  "volume": 0.8,
  "fullscreen": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Engagement event tracked successfully",
  "event_id": "session_1727721000_abc123_1727721342000"
}
```

---

## 4. Analytics: Batch Events

### Endpoint
```
POST /api/analytics/batch
```

### Purpose
Send multiple analytics events in one request (more efficient, retry-friendly)

### Request Schema

```typescript
{
  user_email?: string;
  student_id?: string;
  
  events: Array<{
    // Same fields as individual engagement event
    lessonId: string;
    eventType: string;
    timestamp: string;
    sessionId: string;
    // ... video state fields
  }>;
}
```

### Response Schema
```typescript
{
  success: boolean;
  message: string;
  results: Array<{
    event_id: string;
    status: string;             // "stored"
  }>;
  timestamp: string;
}
```

### Constraints
- Maximum 100 events per batch
- Events array cannot be empty

---

## 5. Analytics: Performance Tracking

### Endpoint
```
POST /api/analytics/performance
```

### Purpose
Track overall lesson performance and completion metrics (quiz scores, time on lesson, etc.)

### Request Schema

```typescript
{
  // User identification
  user_email?: string;
  student_id?: string;
  
  // Context
  lesson_id: string;
  session_id: string;
  page_url: string;
  timestamp?: string;             // ISO 8601
  
  // Lesson metrics
  time_on_lesson?: number;        // Seconds
  completion_status?: string;     // "started" | "in_progress" | "completed" | "exited"
  
  // Video metrics
  video_watched?: boolean;
  video_completion_percentage?: number;  // 0-100
  
  // Quiz/Example metrics
  quiz_scores?: number[];         // [80, 90, 75]
  quiz_attempts?: number;
  example_attempts?: number;
}
```

### Response Schema
```typescript
{
  success: boolean;
  message: string;
  performance_score: number;      // 0-100 calculated score
  metrics_id: string;
}
```

### Example

**Request:**
```json
{
  "user_email": "student@tsa.org",
  "lesson_id": "ma-4-mult-001",
  "session_id": "session_1727721000_abc123",
  "page_url": "https://mathacademy.com/lesson/multiplication-basics",
  "time_on_lesson": 480,
  "completion_status": "completed",
  "video_watched": true,
  "video_completion_percentage": 100,
  "quiz_scores": [60, 80, 100],
  "quiz_attempts": 3,
  "example_attempts": 2
}
```

**Response:**
```json
{
  "success": true,
  "message": "Performance metrics tracked successfully",
  "performance_score": 82,
  "metrics_id": "session_1727721000_abc123_ma-4-mult-001_1727721480"
}
```

---

## Extension → Backend Message Flow

### Chrome Extension Architecture

```
content_scripts/mathacademy.js
    ↓ chrome.runtime.sendMessage()
background.js (service worker)
    ↓ fetch() to API
lambdas/functions/*.js (AWS Lambda)
    ↓ INSERT
RDS MySQL (brunnr_analytics)
```

### Background Script Message Types

The extension content script communicates with the background service worker via:

```typescript
chrome.runtime.sendMessage({
  type: "VALIDATE_LESSON",
  data: { /* lesson data + optional struggle */ }
});

chrome.runtime.sendMessage({
  type: "GET_VIDEO_METADATA",
  data: { lessonId: "..." }
});

chrome.runtime.sendMessage({
  type: "ANALYTICS_EVENT",
  data: {
    category: "video_engagement" | "lesson_performance",
    event: { /* event data */ }
  }
});

chrome.runtime.sendMessage({
  type: "ANALYTICS_BATCH",
  data: {
    events: [ /* array of events */ ]
  }
});
```

---

## Selection Logic (MVP)

### Phase 1: Simple Mapping
- Map `grade_level` + `topic` → default video
- If `struggle.skill_tags` present, try exact match in a hardcoded map
- Fall back to topic-level video

### Phase 2: Database-Driven
- Populate `lesson_metadata` table with lesson → video mappings
- Query by `lesson_id` or by skill tags
- Track video effectiveness (completion % after showing video)

### Phase 3: Adaptive
- Track which videos correlate with improved quiz scores
- A/B test different videos for same struggle
- Use RDS aggregate views to rank video effectiveness

---

## Error Handling

### Extension Behavior on API Failure
- If `validateLesson` fails: default to **not** showing video (silent degradation)
- If analytics submission fails: queue events in `chrome.storage.session` and retry every 60s
- Never block lesson flow waiting for API

### API Behavior
- Always return 200 with `should_show_video: false` rather than 4xx/5xx when possible
- Log all selection decisions to CloudWatch for debugging
- If RDS unavailable: fall back to CloudWatch logging only

---

## Security & Privacy

### User Identification
- Prefer `user_email` from Chrome identity API
- Never store PII beyond email in extension local storage
- All API requests over HTTPS

### Video URLs
- Public CloudFront URLs for MVP (no auth required)
- Future: signed URLs with short TTL for premium content

### CORS
- API allows:
  - `https://mathacademy.com`
  - `https://www.mathacademy.com`
  - `chrome-extension://*`

---

## Testing the Contract

### Manual Test: Initial Video
1. Load a Grade 4 multiplication lesson on MathAcademy
2. Extension should call `POST /api/lesson/validate` with lesson context
3. API returns `should_show_video: true` with CloudFront URL
4. Extension injects `<video>` at top of lesson content

### Manual Test: Struggle Video
1. Answer a multiplication question incorrectly
2. Extension detects failure, calls `POST /api/lesson/validate` with `struggle` payload
3. API returns targeted video based on skill tags
4. Extension injects new video (or replaces existing)

### Manual Test: Analytics Flow
1. Play the video, pause, seek, complete
2. Extension sends each event to `POST /api/analytics/engagement`
3. On page unload, extension sends performance summary to `POST /api/analytics/performance`
4. Verify events appear in RDS `engagement_events` and `performance_metrics` tables

### Automated Test
See `lambdas/test-local.js` for invoking Lambdas with sample payloads.

---

## Deployment URLs

### MVP
- API Base: `https://api.brunnr.com`
- CloudFront: `https://d2zhlpwgezwmiu.cloudfront.net`

### After SST Deployment
- API Base: Output of `npx sst deploy` (API Gateway URL)
- Update `lib/api.js` constant `API_BASE_URL` to match

---

## Open Questions / Future Work

1. **Skill taxonomy**: Should we define a canonical list of skill tags, or infer from MathAcademy DOM?
2. **Video manifest**: Store in RDS `lesson_metadata`, S3 JSON, or DynamoDB?
3. **Recommendation engine**: Simple tag match (MVP) vs. ML-based selection (future)?
4. **Multiple videos per lesson**: Show one initially, another on struggle, or replace?
5. **TSA cohort targeting**: Hard-code Grade 4 multiplication, or query which topics TSA students will reach in 2-3 weeks?

---

## Summary

| Component | Input | Output | Notes |
|-----------|-------|--------|-------|
| **validate-lesson** | Lesson context + optional struggle | `should_show_video` + `video_metadata` | Core recommendation logic |
| **get-video-metadata** | `lessonId` | CloudFront URL + metadata | Optional direct lookup |
| **track-engagement** | Single video event | Success confirmation | Individual event tracking |
| **track-engagement-batch** | Array of events | Batch confirmation | Efficient retry-friendly |
| **track-performance** | Lesson completion metrics | Performance score | Aggregated lesson outcome |

All endpoints accept `user_email` or `student_id` for identification.

All video URLs are direct CloudFront HTTPS URLs (no client-side auth required for MVP).

Extension embeds `<video src={cloudfront_url} />` directly in the DOM—**no calls to a separate renderer service**.
