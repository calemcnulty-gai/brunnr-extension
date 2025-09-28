/**
 * MathAcademy Content Script
 * Injects "Mastery in a Minute" videos into Grade 4 multiplication lessons
 */

// Import analytics tracker
const analytics = {
  initVideoTracking: () => {},
  trackLessonPerformance: () => {},
  trackQuizAttempt: () => {},
  trackExampleAttempt: () => {},
  cleanup: () => {}
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
  const storageData = await chrome.storage.session.get(['sessionId', 'userEmail']);
  if (storageData.userEmail) {
    userEmail = storageData.userEmail;
  }
  sessionId = storageData.sessionId || generateSessionId();

  if (!sessionId) {
    await chrome.storage.session.set({ sessionId });
  }

  // Check if we're on a lesson page
  if (isLessonPage()) {
    const lessonData = extractLessonData();
    if (lessonData) {
      await handleLessonPage(lessonData);
    }
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
  // For MVP, inject video for all Grade 4 multiplication lessons
  const isGrade4Multiplication = lessonData.gradeLevel === 4 && 
                                lessonData.topic === 'multiplication';

  if (!isGrade4Multiplication) {
    console.log('[Brunnr] Not a Grade 4 multiplication lesson, skipping video injection');
    return;
  }

  // Request validation from background script
  const response = await chrome.runtime.sendMessage({
    type: 'VALIDATE_LESSON',
    data: lessonData
  });

  if (response && response.shouldShowVideo) {
    await injectVideo(response.videoMetadata);
  }
}

/**
 * Inject video into the lesson page
 */
async function injectVideo(videoMetadata) {
  if (videoInjected) {
    console.log('[Brunnr] Video already injected');
    return;
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
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
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
      const questionText = quizElement.textContent.substring(0, 200);
      const selectedAnswer = quizElement.querySelector('input:checked, .selected');
      
      analytics.trackQuizAttempt({
        questionText,
        selectedAnswer: selectedAnswer?.value || selectedAnswer?.textContent,
        timestamp: Date.now()
      });
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
 * Setup overall lesson performance tracking
 */
function setupPerformanceTracking() {
  // Track time on lesson
  setInterval(() => {
    const timeOnLesson = Math.floor((Date.now() - lessonStartTime) / 1000);
    
    // Store in session storage for later sending
    chrome.storage.session.set({
      [`lesson_${currentLessonId}_time`]: timeOnLesson
    });
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
