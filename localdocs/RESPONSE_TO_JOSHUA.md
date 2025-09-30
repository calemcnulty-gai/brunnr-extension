# Response to Joshua - Middleware Architecture

**Context:** Joshua asked: _"i'm particularly interested in what the middleware looks like between the extension and the renderer"_

---

## Draft Message

Hey Joshua! 

The middleware between the extension and renderer is now fully documented and implemented. Here's the architecture:

### High-Level Flow

```
Student struggles → Extension detects → Middleware selects video → Extension injects → CloudFront delivers
```

**1. Extension detects lesson load or incorrect answer**
   - Content script watches MathAcademy pages with MutationObserver
   - Detects when students answer multiplication questions incorrectly
   - Extracts struggle context (question text, student answer, skill tags)

**2. Sends POST to `/api/lesson/validate`** with:
   - Lesson context (grade level, topic, lesson ID)
   - Optional "struggle" signal (question text, inferred skill tags like `"multiplication-7-8"`)

**3. Lambda middleware selects appropriate video:**
   - If struggle present: Matches skill tags to video catalog
   - Example: `"multiplication-7-8"` → `times-tables-7-8.mp4`
   - If no struggle or no match: Returns default topic-based video
   - Selection logic is currently simple tag matching (lines 38-78 in `validate-lesson.js`)

**4. Returns CloudFront URL directly to extension:**
   ```json
   {
     "shouldShowVideo": true,
     "videoMetadata": {
       "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/times-tables-7-8.mp4",
       "reason": "Targeted recommendation based on struggle",
       "confidence": 0.9
     }
   }
   ```

**5. Extension injects `<video src={cloudfront} />` into DOM**
   - No separate renderer call needed (per Cale's caching approach)
   - Browser fetches video directly from CDN
   - Analytics flows back to `/api/analytics/*` endpoints → RDS

### Key Contracts

- **Full request/response schemas:** `localdocs/CONTRACT.md`
- **Architecture deep-dive:** `localdocs/MIDDLEWARE_ARCHITECTURE.md`
- **Implementation plan:** `localdocs/ROADMAP_CHECKLIST.md`
- **Test results:** `localdocs/TEST_RESULTS.md`

### What's Working Now

✅ **Lesson validation endpoint** with struggle signals  
✅ **Analytics ingestion** (engagement, performance, batch)  
✅ **Extension detects incorrect answers** and requests targeted videos  
✅ **Videos injected directly from CloudFront** (no renderer middleware needed)  
✅ **End-to-end testing passed** - Full pipeline operational  

**Deployed to:** `https://ayorzefv46.execute-api.us-east-1.amazonaws.com`

### The Middleware Layer

The middleware is essentially:
1. **API Gateway** (routes, CORS, rate limiting)
2. **`validate-lesson` Lambda** (core selection logic)
3. **Analytics Lambdas** (track engagement, performance, batch events)
4. **Optional RDS** (stores analytics, future: video catalog)

**No separate renderer service** because videos are pre-rendered and stored in S3/CloudFront. The middleware's job is just to _select the right video URL_ based on student context.

### Selection Logic (MVP)

Currently using simple skill-tag matching:
```javascript
const videoMap = {
  'times-tables': 'times-tables-advanced.mp4',
  'multiplication-7-8': 'times-tables-7-8.mp4',
  'multiplication-facts': 'multiplication-facts.mp4',
};

// Match first skill tag to video
for (const tag of struggle.skill_tags) {
  if (videoMap[tag]) return videoMap[tag];
}
```

**Future enhancement:** Move video catalog to RDS `lesson_metadata` table, add ML-based selection once we have student outcome data.

### Example: Student Struggles with 7 × 8

1. **Student answers "54"** (incorrect)
2. **Extension detects** via MutationObserver (watches for `.incorrect` class)
3. **Extension infers** skill tags: `["multiplication", "times-tables", "multiplication-7-8"]`
4. **Extension sends** struggle signal to middleware
5. **Middleware matches** `"multiplication-7-8"` → returns targeted video URL
6. **Extension replaces** existing video with new recommendation
7. **Student sees** "Mastery in a Minute: multiplication 7 8" (targeted for 7×8 facts)

### Next Steps

**Immediate:**
- ✅ Middleware fully implemented and tested
- 🎥 Waiting on rendered videos to populate CloudFront
- 📊 Coordinating with Lamar on TSA cohort topics

**Iteration:**
- Once we have more videos: Expand video catalog in RDS
- Once we have student data: Train ML model for better selection
- Once TSA pilot starts: A/B test different videos for same struggles

### Visual Overview

See `localdocs/MIDDLEWARE_ARCHITECTURE.md` for:
- Complete architecture diagram
- Data flow examples (with/without struggle)
- Code references
- Technology stack details
- Future enhancement roadmap

---

Let me know if you want me to walk through any specific part! The middle pipeline is essentially:
- **Client:** `content_scripts/mathacademy.js` (struggle detection)
- **Middleware:** `lambdas/functions/validate-lesson.js` (video selection)
- **Storage:** CloudFront (video delivery)

Happy to demo it live or answer any questions!

— Trevor

---

## Alternative: Shorter Version

Hey Joshua!

The middleware between extension and renderer is now documented and working. Quick summary:

**Architecture:**
- Extension detects struggles → Sends to AWS Lambda → Lambda selects video → Returns CloudFront URL → Extension embeds video
- No separate renderer service (per Cale's design)—videos served directly from CDN

**Core middleware:** `validate-lesson` Lambda function
- Input: Lesson context + optional struggle signal (skill tags)
- Logic: Match skill tags to video catalog (hardcoded for MVP, RDS later)
- Output: CloudFront video URL

**Full details:** `localdocs/MIDDLEWARE_ARCHITECTURE.md` (architecture diagrams, data flows, code refs)

**Status:** ✅ Implemented, tested, deployed. Ready for TSA pilot once videos are rendered.

Let me know if you want to see a demo or dive into any specific part!

— Trevor

---

## Key Files to Share

When responding to Joshua, attach or reference:

1. **`MIDDLEWARE_ARCHITECTURE.md`** (this doc) - Complete technical overview
2. **`CONTRACT.md`** - API request/response schemas
3. **`TEST_RESULTS.md`** - Proof that it works end-to-end
4. **`lambdas/functions/validate-lesson.js`** - Core middleware code (80 lines)

Optionally record a 2-minute screen share showing:
1. Student loads lesson → Video appears
2. Student answers incorrectly → New video appears
3. DevTools console → Show struggle detection logs
4. AWS CloudWatch → Show Lambda logs receiving requests

---

## Questions Joshua Might Ask

### Q: "How does it know which video to show?"

**A:** Simple skill-tag matching for MVP:
1. Extension parses question text: `"What is 7 × 8?"` → infers tags `["multiplication-7-8", "times-tables"]`
2. Middleware has hardcoded map: `{"multiplication-7-8": "times-tables-7-8.mp4"}`
3. Returns first match

Future: Dynamic catalog from RDS, ML-based selection.

---

### Q: "What if there are multiple videos for the same skill?"

**A:** Currently returns first match. Future enhancement: A/B testing
- Randomly assign video A or B
- Track which leads to better quiz scores on next attempt
- Auto-update selection logic to prefer higher-performing video

---

### Q: "How do you handle different platforms (Khan Academy, IXL)?"

**A:** Architecture is platform-agnostic:
- Content script is site-specific (currently `content_scripts/mathacademy.js`)
- Middleware is platform-independent (just receives skill tags)
- To add Khan Academy: Create `content_scripts/khanacademy.js` with different DOM selectors
- Same middleware, same API endpoints

---

### Q: "What's the latency?"

**A:** From manual testing:
- Struggle detection → API request: <500ms
- API processing (Lambda cold start): ~2 seconds
- API processing (Lambda warm): ~200ms
- Video replacement in DOM: <100ms

**Total:** ~2-3 seconds from incorrect answer to new video appearing (cold start), <1 second (warm)

---

### Q: "How does this scale?"

**A:** 
- **Lambda:** Auto-scales to 1000 concurrent requests by default (more with limits increase)
- **API Gateway:** Can handle millions of requests/day
- **CloudFront:** Global CDN, handles video delivery automatically
- **Cost:** For TSA pilot (100 students × 5 struggles/day × 30 days = 15k requests/month) → ~$0.20/month

---

### Q: "Can I see the code?"

**A:** Yes! Key files:
- **Middleware selection logic:** `lambdas/functions/validate-lesson.js` lines 38-78
- **Extension struggle detection:** `content_scripts/mathacademy.js` lines 496-566
- **Video injection:** `content_scripts/mathacademy.js` lines 253-298
- **Infrastructure:** `lambdas/sst.config.ts` (SST v3 Ion config)

All documented in `MIDDLEWARE_ARCHITECTURE.md`

---

### Q: "What's left to do?"

**A:** 
- ✅ Middleware: Complete and tested
- 🎥 Videos: Waiting on renders from Cale
- 📊 Data: Coordinating with Lamar on TSA cohort topics
- 📦 Package: Extension ready for distribution (Task 5.2)
- 🚀 Deploy: Backend ready for production (Task 5.3)

Blocker: Need rendered videos uploaded to CloudFront before TSA pilot can start.

---
