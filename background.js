/**
 * Background Service Worker
 * Handles API communication and message passing between content scripts
 */

import { brunnrAPI } from './lib/api.js';
import { storage } from './lib/storage.js';

// Initialize on installation
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Brunnr] Extension installed');
  
  // Clear any existing session data
  chrome.storage.session.clear();
  
  // Get user email from Chrome profile
  await getUserEmail();
});

/**
 * Get user email from Chrome profile
 */
async function getUserEmail() {
  try {
    // Get user info from Chrome identity API
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
      if (userInfo && userInfo.email) {
        console.log('[Brunnr] User email found:', userInfo.email);
        
        // Store email in session storage
        chrome.storage.session.set({ userEmail: userInfo.email });
        
        // Update API client
        brunnrAPI.setStudentId(userInfo.email);
      } else {
        console.log('[Brunnr] No user email available from Chrome profile');
      }
    });
  } catch (error) {
    console.error('[Brunnr] Error getting user email:', error);
  }
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Brunnr] Background received message:', request.type);

  switch (request.type) {
    case 'GET_USER_EMAIL':
      handleGetUserEmail(sendResponse);
      return true; // Will respond asynchronously

    case 'VALIDATE_LESSON':
      handleLessonValidation(request.data, sendResponse);
      return true; // Will respond asynchronously

    case 'GET_COOKIES':
      handleGetCookies(request.data, sender, sendResponse);
      return true; // Will respond asynchronously

    case 'ANALYTICS_EVENT':
      handleAnalyticsEvent(request.data, sendResponse);
      return true; // Will respond asynchronously

    case 'ANALYTICS_BATCH':
      handleAnalyticsBatch(request.data, sendResponse);
      return true; // Will respond asynchronously

    case 'GET_VIDEO_METADATA':
      handleGetVideoMetadata(request.data, sendResponse);
      return true; // Will respond asynchronously

    default:
      console.warn('[Brunnr] Unknown message type:', request.type);
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

/**
 * Handle get user email request
 */
async function handleGetUserEmail(sendResponse) {
  try {
    // First check if we already have it in storage
    const stored = await storage.get('userEmail');
    if (stored.userEmail) {
      sendResponse({ email: stored.userEmail });
      return;
    }
    
    // Try to get from Chrome profile
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, async (userInfo) => {
      if (userInfo && userInfo.email) {
        await storage.set({ userEmail: userInfo.email });
        brunnrAPI.setStudentId(userInfo.email);
        sendResponse({ email: userInfo.email });
      } else {
        sendResponse({ email: null });
      }
    });
  } catch (error) {
    console.error('[Brunnr] Error getting user email:', error);
    sendResponse({ error: error.message, email: null });
  }
}

/**
 * Handle lesson validation
 */
async function handleLessonValidation(data, sendResponse) {
  try {
    // Get user email from storage
    const emailData = await storage.get('userEmail');
    
    if (!emailData.userEmail) {
      // Try to get it from Chrome profile
      await getUserEmail();
      const updatedData = await storage.get('userEmail');
      if (updatedData.userEmail) {
        brunnrAPI.setStudentId(updatedData.userEmail);
      } else {
        console.warn('[Brunnr] No user email available for lesson validation');
      }
    } else {
      brunnrAPI.setStudentId(emailData.userEmail);
    }

    // For MVP, check if it's Grade 4 multiplication
    const isGrade4Multiplication = data.gradeLevel === 4 && 
                                  data.topic === 'multiplication';

    if (isGrade4Multiplication) {
      // Try to get video metadata from API
      let videoMetadata = null;
      
      try {
        const validationResult = await brunnrAPI.validateLesson(data);
        if (validationResult.shouldShowVideo) {
          videoMetadata = validationResult.videoMetadata;
        }
      } catch (error) {
        console.error('[Brunnr] API validation failed, using defaults:', error);
        // Use default video for MVP
        videoMetadata = {
          videoUrl: 'https://d2zhlpwgezwmiu.cloudfront.net/sample-video.mp4',
          title: 'Mastery in a Minute'
        };
      }

      sendResponse({
        shouldShowVideo: true,
        videoMetadata: videoMetadata || {
          videoUrl: 'https://d2zhlpwgezwmiu.cloudfront.net/sample-video.mp4',
          title: 'Mastery in a Minute'
        }
      });
    } else {
      sendResponse({
        shouldShowVideo: false,
        videoMetadata: null
      });
    }
  } catch (error) {
    console.error('[Brunnr] Error validating lesson:', error);
    sendResponse({
      shouldShowVideo: false,
      error: error.message
    });
  }
}

/**
 * Handle cookie retrieval
 */
async function handleGetCookies(data, sender, sendResponse) {
  try {
    const { domain } = data;
    
    // Get cookies for the domain
    const cookies = await chrome.cookies.getAll({ domain });
    
    sendResponse({ cookies });
  } catch (error) {
    console.error('[Brunnr] Error getting cookies:', error);
    sendResponse({ error: error.message, cookies: [] });
  }
}

/**
 * Handle analytics event
 */
async function handleAnalyticsEvent(data, sendResponse) {
  try {
    const { category, event } = data;
    
    // Store event locally
    await storage.addPendingAnalytics({ category, ...event });
    
    // Get user email
    const emailData = await storage.get('userEmail');
    
    if (emailData.userEmail) {
      brunnrAPI.setStudentId(emailData.userEmail);
    }

    // Try to send to API
    try {
      if (category === 'video_engagement') {
        await brunnrAPI.sendEngagementAnalytics(event);
      } else if (category === 'lesson_performance') {
        await brunnrAPI.sendPerformanceAnalytics(event);
      }
      
      console.log(`[Brunnr] Analytics event sent: ${category}`);
    } catch (error) {
      console.error('[Brunnr] Failed to send analytics, will retry later:', error);
      // Event is already stored in pending analytics
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error('[Brunnr] Error handling analytics event:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle batch analytics
 */
async function handleAnalyticsBatch(data, sendResponse) {
  try {
    const { events } = data;
    
    // Get user email
    const emailData = await storage.get('userEmail');
    
    if (emailData.userEmail) {
      brunnrAPI.setStudentId(emailData.userEmail);
    }

    // Send batch to API
    try {
      await brunnrAPI.sendBatchAnalytics(events);
      console.log(`[Brunnr] Batch analytics sent: ${events.length} events`);
    } catch (error) {
      console.error('[Brunnr] Failed to send batch analytics:', error);
      // Store events for later retry
      for (const event of events) {
        await storage.addPendingAnalytics(event);
      }
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error('[Brunnr] Error handling batch analytics:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle get video metadata request
 */
async function handleGetVideoMetadata(data, sendResponse) {
  try {
    const { lessonId } = data;
    
    // Get video metadata from API
    const metadata = await brunnrAPI.getVideoMetadata(lessonId);
    
    sendResponse({ metadata });
  } catch (error) {
    console.error('[Brunnr] Error getting video metadata:', error);
    sendResponse({ 
      error: error.message,
      metadata: {
        videoUrl: 'https://d2zhlpwgezwmiu.cloudfront.net/sample-video.mp4',
        title: 'Mastery in a Minute'
      }
    });
  }
}

/**
 * Retry sending pending analytics periodically
 */
setInterval(async () => {
  try {
    const pendingEvents = await storage.getPendingAnalytics();
    
    if (pendingEvents.length > 0) {
      console.log(`[Brunnr] Retrying ${pendingEvents.length} pending analytics events`);
      
      // Get user email
      const emailData = await storage.get('userEmail');
      
      if (emailData.userEmail) {
        brunnrAPI.setStudentId(emailData.userEmail);
        
        // Try to send batch
        try {
          await brunnrAPI.sendBatchAnalytics(pendingEvents);
          await storage.clearPendingAnalytics();
          console.log('[Brunnr] Pending analytics sent successfully');
        } catch (error) {
          console.error('[Brunnr] Failed to send pending analytics:', error);
        }
      }
    }
  } catch (error) {
    console.error('[Brunnr] Error processing pending analytics:', error);
  }
}, 60000); // Every minute

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async (tab) => {
  // Log the current state
  const emailData = await storage.get('userEmail');
  const sessionId = await storage.getSessionId();
  
  console.log('[Brunnr] Extension state:', {
    userEmail: emailData.userEmail,
    sessionId,
    currentTab: tab.url
  });
});

console.log('[Brunnr] Background service worker loaded');

// Get user email on startup
getUserEmail();
