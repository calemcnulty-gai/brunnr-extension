# Deploying Feature Flag to AWS

## What Changed

✅ **Task 8.1 Complete:** Feature flag added to `validate-lesson.js`

**Files Modified:**
- `lambdas/functions/validate-lesson.js` - Added ENABLE_STRUGGLE_SELECTION check
- `lambdas/sst.config.ts` - Set default value to "false"
- `lambdas/test-feature-flag.js` - Test script (local only)

## Current Configuration

**Default Mode:** `ENABLE_STRUGGLE_SELECTION = "false"`
- All students get the same default video
- Struggles logged to CloudWatch but NOT used for video selection
- Meets team directive for TSA pilot

## Deployment Steps

### 1. Verify Local Tests Pass

```bash
cd lambdas
node test-feature-flag.js
```

Expected output:
```
✅ Flag OFF (both tests): grade4-multiplication-intro.mp4, mode=default-only
✅ Flag ON + struggle: times-tables-7-8.mp4, mode=struggle-based
✅ Flag ON + no struggle: grade4-multiplication-intro.mp4, mode=default-fallback
```

### 2. Deploy to Dev

```bash
cd lambdas
npx sst deploy --stage dev
```

This will:
- Deploy updated `validate-lesson` Lambda with feature flag
- Environment variable automatically set: `ENABLE_STRUGGLE_SELECTION=false`
- API Gateway routes remain unchanged

**Expected output:**
```
✔ Complete
   ExtensionApi: https://ayorzefv46.execute-api.us-east-1.amazonaws.com
```

### 3. Test Deployed Endpoint

#### Test A: No struggle (should return default video)
```bash
curl -X POST https://ayorzefv46.execute-api.us-east-1.amazonaws.com/api/lesson/validate \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "test@example.com",
    "lesson_id": "2416",
    "grade_level": 4,
    "topic": "multiplication"
  }'
```

**Expected response:**
```json
{
  "should_show_video": true,
  "video_metadata": {
    "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/grade4-multiplication-intro.mp4",
    "title": "Mastery in a Minute: Multiplication",
    "selectionMode": "default-only"
  }
}
```

#### Test B: With struggle (should STILL return default video - flag is OFF)
```bash
curl -X POST https://ayorzefv46.execute-api.us-east-1.amazonaws.com/api/lesson/validate \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "test@example.com",
    "lesson_id": "2416",
    "grade_level": 4,
    "topic": "multiplication",
    "struggle": {
      "skill_tags": ["multiplication-7-8"],
      "question_text": "What is 7 × 8?"
    }
  }'
```

**Expected response:**
```json
{
  "should_show_video": true,
  "video_metadata": {
    "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/grade4-multiplication-intro.mp4",
    "title": "Mastery in a Minute: Multiplication",
    "selectionMode": "default-only"
  }
}
```

**Key observation:** Same video in both cases, but `selectionMode: "default-only"` confirms flag is working.

### 4. Check CloudWatch Logs

```bash
# Open AWS Console → CloudWatch → Log Groups
# Find: /aws/lambda/brunnr-extension-dev-validate-lesson
```

Look for log entries:
```
[Feature Flag] Struggle selection DISABLED - returning default video for all students
[Pipeline Data] Struggle detected but not used for selection: ["multiplication-7-8"]
```

This confirms:
- ✅ Feature flag is being checked
- ✅ Struggles are detected and logged (for pipeline later)
- ✅ But not affecting video selection

### 5. Test with Extension

1. Load Chrome extension
2. Navigate to Grade 4 multiplication lesson
3. Verify default video appears
4. Answer question incorrectly
5. **Verify video does NOT change** (feature flag disabled)
6. Check background console for analytics events

## Changing the Flag (Future)

When you're ready to enable struggle-based selection:

### Option A: Update sst.config.ts (permanent change)

```typescript
// In sst.config.ts line 24
ENABLE_STRUGGLE_SELECTION: "true",  // Changed from "false"
```

Then redeploy:
```bash
npx sst deploy --stage dev
```

### Option B: Use SST Secrets (runtime change, no redeploy)

```bash
# Set the secret
npx sst secrets set ENABLE_STRUGGLE_SELECTION true --stage dev

# Redeploy to pick up secret
npx sst deploy --stage dev
```

### Option C: AWS Lambda Console (quick test, not recommended for prod)

1. Open AWS Console → Lambda → brunnr-extension-dev-validate-lesson
2. Configuration → Environment variables
3. Add: `ENABLE_STRUGGLE_SELECTION = true`
4. Save

## Verification After Enabling Flag

After setting flag to `true`, repeat Test B above. Expected response should now be:

```json
{
  "should_show_video": true,
  "video_metadata": {
    "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/times-tables-7-8.mp4",
    "title": "Mastery in a Minute: 7 and 8 Times Tables",
    "selectionMode": "struggle-based"  // Changed!
  }
}
```

## Rollback

If something goes wrong:

```bash
# Redeploy previous version
git checkout HEAD~1 lambdas/functions/validate-lesson.js lambdas/sst.config.ts
npx sst deploy --stage dev

# Or just flip flag back to false
npx sst secrets set ENABLE_STRUGGLE_SELECTION false --stage dev
npx sst deploy --stage dev
```

## Next Steps

After successful deployment:

1. ✅ **Task 8.1 Complete**
2. ⏳ **Task 8.2:** Add database schema (when RDS provisioned)
3. ⏳ **Task 8.3:** Add struggle logging to RDS
4. ⏳ **Task 8.4:** Create pipeline webhook endpoint
5. ⏳ **Task 8.5:** Update extension to not replace video

## Success Criteria

✅ Deployment successful if:
- API responds with `selectionMode: "default-only"` for all requests
- CloudWatch shows "[Feature Flag] Struggle selection DISABLED"
- Both struggle and non-struggle requests return same default video
- Extension shows default video, doesn't replace on incorrect answers

---

**Status:** Ready to deploy! 🚀
**Estimated Deploy Time:** ~2 minutes
**Risk Level:** Low (flag defaults to OFF, safe pilot behavior)

