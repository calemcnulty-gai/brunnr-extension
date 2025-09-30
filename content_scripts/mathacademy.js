/**
 * MathAcademy Content Script
 * Injects "Mastery in a Minute" videos into Grade 4 multiplication lessons
 */

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
    
    console.log('[Brunnr] Video analytics tracking initialized');
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

let currentLessonId = null;
let sessionId = null;
let userEmail = null;
let videoInjected = false;
let lessonStartTime = Date.now();

/**
 * Initialize the content script
 */
async function init() {
  console.log('[Brunnr] MathAcademy content script loaded');

  // Get user email from Chrome profile
  try {
    const emailResponse = await chrome.runtime.sendMessage({
      type: 'GET_USER_EMAIL'
    });
    
    if (emailResponse && emailResponse.email) {
      userEmail = emailResponse.email;
      console.log('[Brunnr] User email retrieved:', userEmail);
    } else {
      console.log('[Brunnr] No user email available');
    }
  } catch (error) {
    console.error('[Brunnr] Error getting user email:', error);
  }

  // Get session ID and email from storage
  try {
    const storageData = await chrome.storage.session.get(['sessionId', 'userEmail']);
    if (storageData.userEmail) {
      userEmail = storageData.userEmail;
    }
    sessionId = storageData.sessionId || generateSessionId();

    if (!sessionId) {
      await chrome.storage.session.set({ sessionId });
    }
  } catch (error) {
    console.log('[Brunnr] Storage access limited, using fallback session ID');
    sessionId = generateSessionId();
  }

  // Check if we're on a lesson page
  console.log('[Brunnr] Checking if this is a lesson page...');
  console.log('[Brunnr] Current URL:', window.location.href);
  
  if (isLessonPage()) {
    console.log('[Brunnr] ✓ Detected as lesson page');
    const lessonData = extractLessonData();
    console.log('[Brunnr] Extracted lesson data:', lessonData);
    if (lessonData) {
      await handleLessonPage(lessonData);
    } else {
      console.log('[Brunnr] ✗ No lesson data extracted');
    }
  } else {
    console.log('[Brunnr] ✗ Not detected as a lesson page');
  }

  // Set up mutation observer for dynamic content
  setupMutationObserver();

  // Track lesson performance metrics
  setupPerformanceTracking();
}

/**
 * Generate a session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if current page is a lesson (not an assessment)
 */
function isLessonPage() {
  const url = window.location.href;
  const path = window.location.pathname;

  // Check URL patterns for lessons vs assessments
  const isAssessment = url.includes('/assessment') || 
                      url.includes('/test') || 
                      url.includes('/quiz') ||
                      path.includes('/assessment') ||
                      path.includes('/test');

  const isLesson = url.includes('/lesson') || 
                  url.includes('/topic') || 
                  url.includes('/module') ||
                  path.includes('/lesson') ||
                  path.includes('/topic');

  return isLesson && !isAssessment;
}

/**
 * Extract lesson data from the page
 */
function extractLessonData() {
  const data = {
    url: window.location.href,
    lessonId: null,
    title: '',
    gradeLevel: null,
    subject: '',
    topic: ''
  };

  // Try to extract lesson ID from URL
  const urlMatch = window.location.href.match(/lesson[/_-]?(\d+)/i);
  if (urlMatch) {
    data.lessonId = urlMatch[1];
  }

  // Try to extract from page content
  const titleElement = document.querySelector('h1, .lesson-title, .topic-title, [class*="title"]');
  if (titleElement) {
    data.title = titleElement.textContent.trim();
  }

  // Check for grade level indicators
  const pageContent = document.body.textContent.toLowerCase();
  if (pageContent.includes('grade 4') || pageContent.includes('4th grade') || pageContent.includes('fourth grade')) {
    data.gradeLevel = 4;
  }

  // Check for multiplication content
  if (pageContent.includes('multiplication') || pageContent.includes('multiply') || pageContent.includes('times')) {
    data.subject = 'math';
    data.topic = 'multiplication';
  }

  // Try to get more specific data from meta tags or structured data
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    const content = metaDescription.content.toLowerCase();
    if (content.includes('grade 4')) data.gradeLevel = 4;
    if (content.includes('multiplication')) data.topic = 'multiplication';
  }

  currentLessonId = data.lessonId || `lesson_${Date.now()}`;
  return data;
}

/**
 * Handle lesson page - check if video should be injected
 */
async function handleLessonPage(lessonData) {
  console.log('[Brunnr] handleLessonPage called with:', lessonData);
  
  // For MVP, inject video for all Grade 4 multiplication lessons
  const isGrade4Multiplication = lessonData.gradeLevel === 4 && 
                                lessonData.topic === 'multiplication';

  console.log('[Brunnr] Grade level:', lessonData.gradeLevel, '| Topic:', lessonData.topic);
  console.log('[Brunnr] Is Grade 4 multiplication?', isGrade4Multiplication);

  if (!isGrade4Multiplication) {
    console.log('[Brunnr] Not a Grade 4 multiplication lesson, skipping video injection');
    return;
  }

  // Request validation from background script
  console.log('[Brunnr] Requesting video validation from background...');
  const response = await chrome.runtime.sendMessage({
    type: 'VALIDATE_LESSON',
    data: lessonData
  });

  console.log('[Brunnr] Validation response:', response);

  if (response && response.shouldShowVideo) {
    await injectVideo(response.videoMetadata);
  } else {
    console.log('[Brunnr] ✗ Backend said not to show video');
  }
}

/**
 * Inject video into the lesson page
 */
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
}

/**
 * Find the main content area of the page
 */
function findContentArea() {
  // Try common selectors for MathAcademy content areas
  const selectors = [
    '.lesson-content',
    '.main-content',
    '.content-wrapper',
    '#content',
    'main',
    '[role="main"]',
    '.topic-content',
    '.module-content',
    'article',
    '.container'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  // Fallback to body if no specific content area found
  return document.body;
}

/**
 * Create the video container HTML structure
 */
function createVideoContainer(videoMetadata) {
  const container = document.createElement('div');
  container.className = 'brunnr-video-container';
  container.id = 'brunnr-video';

  // Default video URL if not provided
  const videoUrl = videoMetadata?.videoUrl || 'https://d2zhlpwgezwmiu.cloudfront.net/sample-video.mp4';
  const videoTitle = videoMetadata?.title || 'Mastery in a Minute';

  container.innerHTML = `
    <div class="brunnr-video-wrapper">
      <h2 class="brunnr-video-title">${videoTitle}</h2>
      <div class="brunnr-video-player">
        <video 
          controls 
          class="brunnr-video-element"
          preload="metadata"
          poster="">
          <source src="${videoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>
      <p class="brunnr-video-description">
        Watch this quick video summary before diving into the lesson
      </p>
    </div>
  `;

  return container;
}

/**
 * Setup video analytics tracking
 */
function setupVideoAnalytics(videoElement, videoMetadata) {
  // Initialize analytics tracking
  analytics.initVideoTracking(
    videoElement,
    currentLessonId,
    videoMetadata?.videoUrl || videoElement.src,
    sessionId
  );

  // Track when video is loaded
  videoElement.addEventListener('loadedmetadata', () => {
    console.log('[Brunnr] Video loaded, duration:', videoElement.duration);
  });

  // Handle video errors
  videoElement.addEventListener('error', (e) => {
    console.error('[Brunnr] Video error:', e);
  });
}

/**
 * Setup mutation observer for dynamic content
 */
function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    // Check if we've navigated to a new lesson
    const currentUrl = window.location.href;
    if (isLessonPage() && !videoInjected) {
      const lessonData = extractLessonData();
      if (lessonData) {
        handleLessonPage(lessonData);
      }
    }

    // Check for quiz/example elements being added
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          checkForQuizElements(node);
          checkForExampleElements(node);
          
          // Also check for feedback/result elements (for struggle detection)
          checkForFeedbackElements(node);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-correct', 'data-result'] // Watch for result attributes
  });
}

/**
 * Check for feedback/result elements that indicate incorrect answers
 */
function checkForFeedbackElements(element) {
  const feedbackSelectors = [
    '.incorrect',
    '.wrong',
    '.error',
    '[class*="incorrect"]',
    '[class*="wrong"]',
    '[data-correct="false"]',
    '[aria-invalid="true"]'
  ];
  
  feedbackSelectors.forEach(selector => {
    let feedbackElements = [];
    
    // Check if the element itself matches
    if (element.matches && element.matches(selector)) {
      feedbackElements.push(element);
    }
    
    // Check children
    if (element.querySelectorAll) {
      feedbackElements.push(...element.querySelectorAll(selector));
    }
    
    feedbackElements.forEach(feedbackEl => {
      // Find the parent quiz element
      const quizElement = feedbackEl.closest('.quiz-question, .assessment-item, [class*="quiz"], [class*="question"]');
      if (quizElement && !quizElement.hasAttribute('data-brunnr-struggle-detected')) {
        quizElement.setAttribute('data-brunnr-struggle-detected', 'true');
        
        // Extract question data from the quiz element
        const questionText = quizElement.querySelector('.question-text, [class*="question"]')?.textContent || 
                            quizElement.textContent.substring(0, 200);
        const selectedAnswer = quizElement.querySelector('input:checked, .selected')?.textContent || '';
        const correctAnswer = quizElement.querySelector('.correct-answer, [class*="correct"]')?.textContent || '';
        
        const questionData = {
          questionText,
          studentAnswer: selectedAnswer,
          correctAnswer,
          timestamp: Date.now()
        };
        
        console.log('[Brunnr] Detected incorrect answer via mutation observer');
        handleIncorrectAnswer(quizElement, questionData);
      }
    });
  });
}

/**
 * Check for quiz elements and track attempts
 */
function checkForQuizElements(element) {
  const quizSelectors = [
    '.quiz-question',
    '.assessment-item',
    '[class*="quiz"]',
    '[class*="question"]'
  ];

  quizSelectors.forEach(selector => {
    const quizElements = element.querySelectorAll ? 
                        element.querySelectorAll(selector) : 
                        [];
    
    quizElements.forEach(quizEl => {
      setupQuizTracking(quizEl);
    });
  });
}

/**
 * Check for example problem elements
 */
function checkForExampleElements(element) {
  const exampleSelectors = [
    '.example-problem',
    '.practice-problem',
    '[class*="example"]',
    '[class*="practice"]'
  ];

  exampleSelectors.forEach(selector => {
    const exampleElements = element.querySelectorAll ? 
                          element.querySelectorAll(selector) : 
                          [];
    
    exampleElements.forEach(exampleEl => {
      setupExampleTracking(exampleEl);
    });
  });
}

/**
 * Setup quiz tracking
 */
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
        studentAnswer: selectedAnswer?.value || selectedAnswer?.textContent || '',
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

/**
 * Setup example problem tracking
 */
function setupExampleTracking(exampleElement) {
  // Find interaction elements
  const interactionElements = exampleElement.querySelectorAll('button, input[type="submit"]');
  
  interactionElements.forEach(element => {
    if (!element.hasAttribute('data-brunnr-tracked')) {
      element.setAttribute('data-brunnr-tracked', 'true');
      
      element.addEventListener('click', () => {
        const problemText = exampleElement.textContent.substring(0, 200);
        
        analytics.trackExampleAttempt({
          problemText,
          timestamp: Date.now()
        });
      });
    }
  });
}

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
      const [_, num1, num2] = match;
      tags.push('times-tables');
      
      // Check for 7s and 8s (harder multiplication facts)
      if (num1 === '7' || num1 === '8' || num2 === '7' || num2 === '8') {
        tags.push('multiplication-7-8');
      }
      
      tags.push(`multiplication-${num1}-${num2}`);
    }
  }
  
  if (text.includes('fact') || text.includes('memorize')) {
    tags.push('multiplication-facts');
  }
  
  return tags;
}

/**
 * Detect when student submits an incorrect answer and log to middleware
 * 
 * Phase 8: Modified for feature flag support
 * - Always sends struggle data to middleware (for logging/pipeline)
 * - Only replaces video if struggle-based selection is enabled
 * - Check selectionMode to determine behavior
 */
async function handleIncorrectAnswer(quizElement, questionData) {
  console.log('[Brunnr] Incorrect answer detected');
  
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
  
  console.log('[Brunnr] Struggle context:', struggle);
  
  // Send struggle data to middleware (for logging/pipeline)
  const response = await chrome.runtime.sendMessage({
    type: 'VALIDATE_LESSON',
    data: {
      ...lessonData,
      struggle
    }
  });
  
  if (response && response.shouldShowVideo && response.videoMetadata) {
    const selectionMode = response.videoMetadata.selectionMode;
    
    // Check if we should replace the video
    if (selectionMode === 'struggle-based') {
      // Feature flag ON - replace with targeted video
      console.log('[Brunnr] Feature flag ON - replacing with targeted video:', response.videoMetadata);
      await injectVideo(response.videoMetadata, true);
    } else {
      // Feature flag OFF - don't replace video, just log
      console.log('[Brunnr] Feature flag OFF - struggle logged, video unchanged');
      console.log('[Brunnr] Selection mode:', selectionMode);
    }
  }
  
  // Track the struggle event
  analytics.trackQuizAttempt({
    ...questionData,
    correct: false,
    skill_tags: struggle.skill_tags
  });
}

/**
 * Setup overall lesson performance tracking
 */
function setupPerformanceTracking() {
  // Track time on lesson
  setInterval(() => {
    const timeOnLesson = Math.floor((Date.now() - lessonStartTime) / 1000);
    
    // Store in session storage for later sending
    try {
      chrome.storage.session.set({
        [`lesson_${currentLessonId}_time`]: timeOnLesson
      });
    } catch (error) {
      // Silent fail if storage not available
    }
  }, 30000); // Every 30 seconds

  // Track when leaving the page
  window.addEventListener('beforeunload', () => {
    const timeOnLesson = Math.floor((Date.now() - lessonStartTime) / 1000);
    
    analytics.trackLessonPerformance({
      timeOnLesson,
      completionStatus: 'exited'
    });

    analytics.cleanup();
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
