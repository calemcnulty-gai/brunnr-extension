# Pipeline Query Reference

**Created:** 2025-09-30  
**Purpose:** SQL queries your video generation pipeline should use

---

## For Your Video Generation Pipeline

### 1. Get Top Priority Videos to Generate

Your pipeline should poll this view regularly (e.g., every 5 minutes):

```sql
-- Get top 10 videos to generate (ordered by priority)
SELECT 
  primary_skill_tag,
  skill_tags,
  struggle_count,
  first_requested,
  last_requested,
  grade_level,
  topic,
  subject,
  priority_score
FROM pending_video_requests
LIMIT 10;
```

**Output Example:**
```
primary_skill_tag    | struggle_count | priority_score
---------------------|----------------|---------------
multiplication-7-8   | 12             | 156
times-tables         | 8              | 104
multiplication-facts | 5              | 65
```

---

### 2. When Your Pipeline Generates a Video

After uploading to S3/CloudFront, call the stored procedure:

```sql
CALL mark_video_generated(
  'multiplication-7-8',                                    -- skill_tag
  'vid-mult-7-8-20250930',                                -- video_id
  'https://d2zhlpwgezwmiu.cloudfront.net/times-7-8.mp4'  -- video_url
);
```

This automatically:
- ✅ Marks all matching struggles as `video_generated = TRUE`
- ✅ Adds/updates video in `video_catalog`
- ✅ Sets `generation_status = 'ready'`

---

### 3. Alternative: Use the Middleware Webhook

Instead of direct SQL, your pipeline can call the middleware API:

```bash
POST https://ayorzefv46.execute-api.us-east-1.amazonaws.com/api/pipeline/video-ready

{
  "skill_tag": "multiplication-7-8",
  "video_url": "https://d2zhlpwgezwmiu.cloudfront.net/times-7-8.mp4",
  "video_id": "vid-mult-7-8-20250930",
  "title": "7 and 8 Times Tables",
  "duration": 90,
  "thumbnail_url": "https://d2zhlpwgezwmiu.cloudfront.net/thumbnails/mult-7-8.jpg"
}
```

The middleware will handle the database updates (see Task 8.4).

---

### 4. Check Which Videos Already Exist

Before generating, check if a video already exists:

```sql
SELECT 
  skill_tag,
  video_url,
  title,
  created_at
FROM video_catalog
WHERE skill_tag = 'multiplication-7-8'
  AND is_active = TRUE;
```

---

### 5. Get All Pending Struggles (Detailed)

If you need more context about what students are struggling with:

```sql
SELECT 
  question_text,
  student_answer,
  correct_answer,
  skill_tags,
  COUNT(*) as occurrence_count,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM struggle_events
WHERE video_generated = FALSE
  AND generation_status = 'pending'
  AND JSON_CONTAINS(skill_tags, '"multiplication-7-8"')
GROUP BY question_text, student_answer, correct_answer, skill_tags
ORDER BY occurrence_count DESC;
```

**Output Example:**
```
question_text     | student_answer | correct_answer | occurrence_count
------------------|----------------|----------------|------------------
What is 7 × 8?    | 54             | 56             | 8
7 times 8 equals? | 54             | 56             | 4
```

This helps you understand the specific questions students are getting wrong.

---

### 6. Monitor Pipeline Performance

```sql
-- See how fast videos are being generated
SELECT 
  generation_status,
  COUNT(*) as count,
  AVG(TIMESTAMPDIFF(MINUTE, generation_requested_at, generation_completed_at)) as avg_minutes_to_generate
FROM struggle_events
WHERE generation_requested_at IS NOT NULL
GROUP BY generation_status;
```

---

## Integration Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. Your Pipeline Polls                                  │
│     SELECT * FROM pending_video_requests LIMIT 10;       │
│                                                          │
│  2. Generate Video for Top Priority Skill               │
│     (Your rendering/generation logic)                    │
│                                                          │
│  3. Upload to S3/CloudFront                              │
│     video_url = "https://cloudfront.net/mult-7-8.mp4"   │
│                                                          │
│  4. Notify Middleware (Option A: Direct SQL)             │
│     CALL mark_video_generated(...)                       │
│                                                          │
│     OR (Option B: Webhook)                               │
│     POST /api/pipeline/video-ready                       │
│                                                          │
│  5. Middleware Updates Database                          │
│     - Marks struggles as resolved                        │
│     - Adds to video_catalog                              │
│                                                          │
│  6. Next Student with Same Struggle                      │
│     → Gets new video automatically!                      │
└─────────────────────────────────────────────────────────┘
```

---

## Example Python Pipeline Code

```python
import mysql.connector
import requests
import time

def poll_pending_videos(db):
    cursor = db.cursor(dictionary=True)
    cursor.execute("""
        SELECT * FROM pending_video_requests LIMIT 10
    """)
    return cursor.fetchall()

def generate_video(skill_tag, question_examples):
    # Your video generation logic here
    # Returns: video_url, video_id, duration
    pass

def notify_middleware(skill_tag, video_url, video_id):
    response = requests.post(
        'https://ayorzefv46.execute-api.us-east-1.amazonaws.com/api/pipeline/video-ready',
        json={
            'skill_tag': skill_tag,
            'video_url': video_url,
            'video_id': video_id,
            'title': f"Video for {skill_tag}",
            'duration': 90
        }
    )
    return response.json()

# Main pipeline loop
def pipeline_loop():
    db = mysql.connector.connect(
        host=RDS_HOST,
        user=RDS_USER,
        password=RDS_PASSWORD,
        database='brunnr_analytics'
    )
    
    while True:
        pending = poll_pending_videos(db)
        
        for request in pending:
            print(f"Generating video for: {request['primary_skill_tag']}")
            
            # Generate video
            video_url, video_id, duration = generate_video(
                request['primary_skill_tag'],
                request['skill_tags']
            )
            
            # Notify middleware
            notify_middleware(
                request['primary_skill_tag'],
                video_url,
                video_id
            )
            
            print(f"✅ Video ready: {video_url}")
        
        # Wait 5 minutes before next poll
        time.sleep(300)
```

---

## Threshold Logic

The schema includes automatic threshold detection:

**When 5+ students struggle with the same skill:**
- `generation_status` automatically changes from `'pending'` to `'generating'`
- `generation_requested_at` timestamp is set
- Your pipeline sees this and prioritizes it

This is handled by the `log_struggle_event` stored procedure (lines 346-393 in schema.sql).

---

## Questions?

- **When is RDS ready?** Ask Josh
- **How to run schema?** `mysql -h <rds-endpoint> -u admin -p < schema.sql`
- **Testing without RDS?** Struggles log to CloudWatch for now
- **Webhook not working?** Check Task 8.4 implementation

---

**Status:** Schema ready, waiting for RDS provisioning

