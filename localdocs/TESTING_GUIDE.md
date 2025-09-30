# Brunnr Extension - Manual Testing Guide

## Prerequisites
- Chrome browser
- Access to mathacademy.com (with an account that can access Grade 4 multiplication lessons)
- Extension files in this directory

## Step 1: Load the Extension in Chrome

1. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - Or click the three dots menu → Extensions → Manage Extensions

2. **Enable Developer Mode:**
   - Toggle "Developer mode" switch in the top right corner

3. **Load the extension:**
   - Click "Load unpacked"
   - Navigate to this directory: `/Users/trevoralpert/MacBook Pro-Only Docs/Local Repo Destinations/BrainMaxxing/brunnr-extension/brunnr-extension`
   - Click "Select"

4. **Verify installation:**
   - You should see "Brunnr - Mastery in a Minute" in your extensions list
   - Extension ID will be shown (note this for debugging)
   - Icon should appear in Chrome toolbar

## Step 2: Open Developer Console (IMPORTANT!)

**Before navigating to MathAcademy:**
1. Press `Cmd+Option+J` (Mac) or `Ctrl+Shift+J` (Windows/Linux)
2. Keep the console open during all tests
3. Look for `[Brunnr]` prefixed log messages

## Step 3: Test Initial Video Injection

1. **Navigate to a Grade 4 multiplication lesson on MathAcademy:**
   - Example URL: `https://mathacademy.com/lesson/...` or `https://mathacademy.com/topic/...`
   - Make sure it's related to multiplication

2. **Check the console for:**
   ```
   [Brunnr] MathAcademy content script loaded
   [Brunnr] User email retrieved: <your-email>
   [Brunnr] Injecting video into lesson
   [Brunnr] Video analytics tracking initialized
   ```

3. **Verify on the page:**
   - A video player should appear at the top of the lesson content
   - Title: "Mastery in a Minute" (or similar)
   - Video controls should be visible
   - Video should be playable

4. **If you DON'T see the video:**
   - Check console for errors
   - Verify you're on a lesson page (not an assessment)
   - Check that the page content includes "multiplication" keywords

## Step 4: Test Video Analytics (Optional)

1. **Play the video**
2. **Check console for:**
   ```
   [Brunnr] Video loaded, duration: 60
   [Brunnr] Background received message: ANALYTICS_EVENT
   ```
3. **Try different actions:**
   - Play → should log `eventType: 'play'`
   - Pause → should log `eventType: 'pause'`
   - Let it finish → should log `eventType: 'ended'`

## Step 5: Test Struggle Detection (CORE FEATURE) 🎯

This is the main test for Phase 3!

### Option A: Find Real Quiz Questions

1. **Scroll through the MathAcademy lesson** looking for:
   - Quiz questions
   - Practice problems
   - Interactive exercises
   - Elements with submit buttons

2. **Answer a multiplication question INCORRECTLY:**
   - Example: If asked "What is 7 × 8?", enter "54" (wrong answer is 56)
   - Click Submit or Check Answer

3. **Watch the console immediately:**
   ```
   [Brunnr] Incorrect answer detected, requesting targeted video
   [Brunnr] Struggle context: {
     question_text: "What is 7 × 8?",
     student_answer: "54",
     skill_tags: ["multiplication", "times-tables", "multiplication-7-8"],
     ...
   }
   [Brunnr] Received targeted video recommendation: { ... }
   [Brunnr] Replacing existing video with new recommendation
   ```

4. **Verify on the page:**
   - The video at the top should **update/change**
   - New title might be: "Mastery in a Minute: multiplication 7 8" or "times tables 7 8"
   - Console should show the new video URL

### Option B: Simulate Quiz Elements (If No Real Quizzes)

If MathAcademy doesn't have interactive quizzes on the page you're testing:

1. **Open the browser console**
2. **Paste this test code** to simulate a quiz question:
   ```javascript
   // Create a fake quiz question
   const testQuiz = document.createElement('div');
   testQuiz.className = 'quiz-question';
   testQuiz.innerHTML = `
     <div class="question-text">What is 7 × 8?</div>
     <input type="radio" name="answer" value="54" checked> 54
     <input type="radio" name="answer" value="56"> 56
     <button type="submit" class="submit-btn">Submit</button>
     <div class="feedback" style="display:none;">Incorrect! The correct answer is 56.</div>
   `;
   document.body.appendChild(testQuiz);
   
   // Simulate incorrect submission
   setTimeout(() => {
     const submitBtn = testQuiz.querySelector('.submit-btn');
     submitBtn.click();
     setTimeout(() => {
       const feedback = testQuiz.querySelector('.feedback');
       feedback.style.display = 'block';
       feedback.className = 'feedback incorrect';
     }, 100);
   }, 1000);
   ```

3. **Watch the console** for struggle detection logs

## Step 6: Test MutationObserver Robustness

This tests if the extension catches struggles even when feedback loads asynchronously:

1. **Answer another question incorrectly**
2. **If the page adds a `.incorrect` or `.wrong` class dynamically:**
   - The MutationObserver should catch it
   - Check console for: `[Brunnr] Detected incorrect answer via mutation observer`

## Step 7: Test Edge Cases

### Test 7.1: Multiple Incorrect Answers
1. Answer 2-3 questions incorrectly in a row
2. Verify each triggers a new video recommendation
3. Check that videos are replaced, not duplicated

### Test 7.2: Correct Answer After Incorrect
1. Answer incorrectly → video should update
2. Answer correctly → no new video, but analytics should track `correct: true`

### Test 7.3: Page Navigation
1. With extension active, navigate to a different lesson
2. Verify new video is injected for the new lesson
3. Old video should be removed/replaced

### Test 7.4: Extension Reload
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Brunnr extension
3. Reload the MathAcademy page
4. Verify everything still works

## Step 8: Verify Backend Integration

1. **Check that API calls are working:**
   - Open Chrome DevTools → Network tab
   - Filter for: `execute-api.us-east-1.amazonaws.com`
   - You should see POST requests to `/api/lesson/validate`

2. **Inspect a request:**
   - Click on the request
   - Go to "Payload" tab
   - Verify it includes:
     ```json
     {
       "user_email": "...",
       "lesson_id": "...",
       "struggle": {
         "question_text": "...",
         "skill_tags": ["..."],
         ...
       }
     }
     ```

3. **Check the response:**
   - Go to "Response" tab
   - Should see:
     ```json
     {
       "shouldShowVideo": true,
       "videoMetadata": {
         "videoUrl": "https://d2zhlpwgezwmiu.cloudfront.net/...",
         "title": "Mastery in a Minute: ...",
         "reason": "Targeted recommendation based on struggle",
         "skillTags": ["times-tables"],
         ...
       }
     }
     ```

## Expected Results Summary

✅ **Initial Load:**
- Extension loads without errors
- Video appears on Grade 4 multiplication lessons
- Analytics tracks video interactions

✅ **Struggle Detection:**
- Incorrect answers trigger console logs
- Skill tags are inferred correctly
- New video recommendation is requested
- Video is replaced on the page

✅ **Backend Communication:**
- API calls succeed (200 status)
- Struggle object is sent in request body
- Targeted video is returned based on skill tags

✅ **Robustness:**
- MutationObserver catches async feedback
- Multiple struggles handled correctly
- No duplicate videos

## Common Issues & Fixes

### Issue: Video doesn't appear
**Fix:** 
- Check console for errors
- Verify you're on a lesson page (URL contains `/lesson/` or `/topic/`)
- Check that page mentions "multiplication" or "grade 4"
- Try refreshing the page

### Issue: Struggle detection doesn't work
**Fix:**
- Check console for `[Brunnr]` messages
- Verify MathAcademy uses classes like `.incorrect`, `.wrong`, `.result`, `.feedback`
- Try the simulation code from Option B above
- Check that the question contains multiplication keywords

### Issue: API calls fail (Network errors)
**Fix:**
- Check CORS configuration in `lambdas/sst.config.ts`
- Verify backend is still deployed: `cd lambdas && npx sst deploy`
- Check API endpoint in `lib/api.js` (should be: `https://ayorzefv46.execute-api.us-east-1.amazonaws.com`)

### Issue: Console shows "Invalid manifest"
**Fix:**
- Check `manifest.json` for syntax errors
- Verify all files referenced in manifest exist
- Reload extension in `chrome://extensions/`

### Issue: Background script errors
**Fix:**
- Check `background.js` console separately:
  - Go to `chrome://extensions/`
  - Click "service worker" or "background page" link under Brunnr extension
  - Check for errors in that console

## Test Report Template

After testing, document your findings:

```markdown
## Test Results - [Date]

### Environment
- Chrome Version: 
- MathAcademy Page: 
- Extension Version: 

### Tests Performed
- [ ] Initial video injection
- [ ] Video analytics
- [ ] Struggle detection (real quiz)
- [ ] MutationObserver
- [ ] Backend API calls
- [ ] Edge cases

### Issues Found
1. 
2. 

### Screenshots
[Attach screenshots of console, video player, etc.]

### Notes

```

---

**Ready to start?** Follow Step 1 and let me know what you see! 🚀
