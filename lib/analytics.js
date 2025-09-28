/**
 * Analytics Tracking Module
 * Handles video engagement and lesson performance tracking
 */

class AnalyticsTracker {
  constructor() {
    this.videoElement = null;
    this.lessonId = null;
    this.sessionId = null;
    this.videoUrl = null;
    this.engagementInterval = null;
    this.lastUpdateTime = 0;
    this.watchedSegments = [];
    this.eventQueue = [];
    this.isTracking = false;
  }

  /**
   * Initialize video analytics tracking
   */
  initVideoTracking(videoElement, lessonId, videoUrl, sessionId) {
    if (this.isTracking) {
      this.cleanup();
    }

    this.videoElement = videoElement;
    this.lessonId = lessonId;
    this.videoUrl = videoUrl;
    this.sessionId = sessionId;
    this.isTracking = true;

    // Attach event listeners
    this.attachVideoListeners();

    // Start periodic time updates
    this.startTimeTracking();

    // Track initial load
    this.trackEvent('video_loaded', {
      duration: videoElement.duration || 0
    });
  }

  /**
   * Attach video event listeners
   */
  attachVideoListeners() {
    if (!this.videoElement) return;

    // Play event
    this.videoElement.addEventListener('play', () => {
      this.trackEvent('play', {
        currentTime: this.videoElement.currentTime
      });
    });

    // Pause event
    this.videoElement.addEventListener('pause', () => {
      this.trackEvent('pause', {
        currentTime: this.videoElement.currentTime,
        duration: this.videoElement.duration
      });
    });

    // Ended event
    this.videoElement.addEventListener('ended', () => {
      this.trackEvent('ended', {
        currentTime: this.videoElement.currentTime,
        duration: this.videoElement.duration,
        completionPercentage: 100
      });
    });

    // Seek events
    let isSeeking = false;
    let seekStartTime = 0;

    this.videoElement.addEventListener('seeking', () => {
      isSeeking = true;
      seekStartTime = this.lastUpdateTime;
    });

    this.videoElement.addEventListener('seeked', () => {
      if (isSeeking) {
        this.trackEvent('seek', {
          from: seekStartTime,
          to: this.videoElement.currentTime,
          duration: this.videoElement.duration
        });
        isSeeking = false;
      }
    });

    // Volume change
    this.videoElement.addEventListener('volumechange', () => {
      this.trackEvent('volume_change', {
        volume: this.videoElement.volume,
        muted: this.videoElement.muted
      });
    });

    // Playback rate change
    this.videoElement.addEventListener('ratechange', () => {
      this.trackEvent('rate_change', {
        playbackRate: this.videoElement.playbackRate
      });
    });

    // Fullscreen change
    document.addEventListener('fullscreenchange', () => {
      const isFullscreen = document.fullscreenElement === this.videoElement;
      this.trackEvent('fullscreen_change', {
        fullscreen: isFullscreen
      });
    });

    // Error event
    this.videoElement.addEventListener('error', (e) => {
      this.trackEvent('error', {
        error: e.message || 'Unknown video error',
        currentTime: this.videoElement.currentTime
      });
    });
  }

  /**
   * Start periodic time tracking
   */
  startTimeTracking() {
    // Track time updates every 5 seconds
    this.engagementInterval = setInterval(() => {
      if (this.videoElement && !this.videoElement.paused) {
        const currentTime = this.videoElement.currentTime;
        const duration = this.videoElement.duration;

        // Track watched segments
        this.updateWatchedSegments(currentTime);

        // Track time update
        this.trackEvent('timeupdate', {
          currentTime: currentTime,
          duration: duration,
          completionPercentage: (currentTime / duration) * 100,
          watchedSegments: this.watchedSegments
        });

        this.lastUpdateTime = currentTime;
      }
    }, 5000);
  }

  /**
   * Update watched segments tracking
   */
  updateWatchedSegments(currentTime) {
    const segmentSize = 5; // 5-second segments
    const currentSegment = Math.floor(currentTime / segmentSize);
    
    if (!this.watchedSegments.includes(currentSegment)) {
      this.watchedSegments.push(currentSegment);
      this.watchedSegments.sort((a, b) => a - b);
    }
  }

  /**
   * Calculate actual watch time from segments
   */
  calculateActualWatchTime() {
    const segmentSize = 5;
    return this.watchedSegments.length * segmentSize;
  }

  /**
   * Track an analytics event
   */
  trackEvent(eventType, data = {}) {
    const event = {
      eventType,
      lessonId: this.lessonId,
      videoUrl: this.videoUrl,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
      ...data
    };

    // Add to queue
    this.eventQueue.push(event);

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      data: {
        category: 'video_engagement',
        event
      }
    });

    // Flush queue if it gets too large
    if (this.eventQueue.length >= 10) {
      this.flushEvents();
    }
  }

  /**
   * Track lesson performance metrics
   */
  trackLessonPerformance(performanceData) {
    const event = {
      lessonId: this.lessonId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
      videoWatched: this.isTracking,
      actualWatchTime: this.calculateActualWatchTime(),
      videoCompletionPercentage: this.calculateCompletionPercentage(),
      ...performanceData
    };

    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      data: {
        category: 'lesson_performance',
        event
      }
    });
  }

  /**
   * Calculate video completion percentage
   */
  calculateCompletionPercentage() {
    if (!this.videoElement || !this.videoElement.duration) return 0;
    
    const segmentSize = 5;
    const totalSegments = Math.ceil(this.videoElement.duration / segmentSize);
    return (this.watchedSegments.length / totalSegments) * 100;
  }

  /**
   * Flush queued events
   */
  flushEvents() {
    if (this.eventQueue.length === 0) return;

    chrome.runtime.sendMessage({
      type: 'ANALYTICS_BATCH',
      data: {
        events: [...this.eventQueue]
      }
    });

    this.eventQueue = [];
  }

  /**
   * Cleanup tracking
   */
  cleanup() {
    if (this.engagementInterval) {
      clearInterval(this.engagementInterval);
      this.engagementInterval = null;
    }

    // Flush any remaining events
    this.flushEvents();

    // Reset state
    this.videoElement = null;
    this.lessonId = null;
    this.sessionId = null;
    this.videoUrl = null;
    this.lastUpdateTime = 0;
    this.watchedSegments = [];
    this.isTracking = false;
  }

  /**
   * Track quiz attempt
   */
  trackQuizAttempt(quizData) {
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      data: {
        category: 'quiz_attempt',
        event: {
          lessonId: this.lessonId,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          pageUrl: window.location.href,
          ...quizData
        }
      }
    });
  }

  /**
   * Track example problem attempt
   */
  trackExampleAttempt(exampleData) {
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      data: {
        category: 'example_attempt',
        event: {
          lessonId: this.lessonId,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          pageUrl: window.location.href,
          ...exampleData
        }
      }
    });
  }
}

// Export singleton instance
export const analytics = new AnalyticsTracker();
