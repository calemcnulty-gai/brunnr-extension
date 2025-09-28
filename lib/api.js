/**
 * API Service Module
 * Handles all communication with the Brunnr API
 */

const API_BASE_URL = 'https://api.brunnr.com';

class BrunnrAPI {
  constructor() {
    this.authToken = null;
    this.userIdentifier = null; // Can be email or student ID
  }

  /**
   * Set authentication token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Set current user identifier (email or student ID)
   */
  setStudentId(identifier) {
    this.userIdentifier = identifier;
  }
  
  /**
   * Set user email (preferred identifier)
   */
  setUserEmail(email) {
    this.userIdentifier = email;
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  /**
   * Validate if a lesson should show video
   */
  async validateLesson(lessonData) {
    try {
      const response = await this.request('/api/lesson/validate', {
        method: 'POST',
        body: JSON.stringify({
          user_email: this.userIdentifier && this.userIdentifier.includes('@') ? this.userIdentifier : null,
          student_id: this.userIdentifier && !this.userIdentifier.includes('@') ? this.userIdentifier : null,
          lesson_url: lessonData.url,
          lesson_title: lessonData.title,
          lesson_id: lessonData.lessonId,
          grade_level: lessonData.gradeLevel,
          subject: lessonData.subject,
          topic: lessonData.topic
        })
      });

      return {
        shouldShowVideo: response.should_show_video || false,
        videoMetadata: response.video_metadata || null
      };
    } catch (error) {
      console.error('Lesson validation failed:', error);
      // Default to not showing video on error
      return {
        shouldShowVideo: false,
        videoMetadata: null
      };
    }
  }

  /**
   * Get video metadata including URL and auth headers
   */
  async getVideoMetadata(lessonId) {
    try {
      const response = await this.request(`/api/video/metadata/${lessonId}`, {
        method: 'GET'
      });

      return {
        videoUrl: response.video_url,
        authHeaders: response.auth_headers || {},
        duration: response.duration,
        title: response.title || 'Mastery in a Minute'
      };
    } catch (error) {
      console.error('Failed to get video metadata:', error);
      return null;
    }
  }

  /**
   * Send video engagement analytics
   */
  async sendEngagementAnalytics(data) {
    try {
      await this.request('/api/analytics/engagement', {
        method: 'POST',
        body: JSON.stringify({
          user_email: this.userIdentifier && this.userIdentifier.includes('@') ? this.userIdentifier : null,
          student_id: this.userIdentifier && !this.userIdentifier.includes('@') ? this.userIdentifier : null,
          lesson_id: data.lessonId,
          video_url: data.videoUrl,
          event_type: data.eventType, // play, pause, seek, ended
          timestamp: data.timestamp,
          current_time: data.currentTime,
          duration: data.duration,
          playback_rate: data.playbackRate,
          volume: data.volume,
          fullscreen: data.fullscreen,
          session_id: data.sessionId,
          page_url: data.pageUrl
        })
      });
    } catch (error) {
      console.error('Failed to send engagement analytics:', error);
      // Don't throw - analytics failures shouldn't break the experience
    }
  }

  /**
   * Send lesson performance analytics
   */
  async sendPerformanceAnalytics(data) {
    try {
      await this.request('/api/analytics/performance', {
        method: 'POST',
        body: JSON.stringify({
          user_email: this.userIdentifier && this.userIdentifier.includes('@') ? this.userIdentifier : null,
          student_id: this.userIdentifier && !this.userIdentifier.includes('@') ? this.userIdentifier : null,
          lesson_id: data.lessonId,
          quiz_scores: data.quizScores,
          example_attempts: data.exampleAttempts,
          time_on_lesson: data.timeOnLesson,
          completion_status: data.completionStatus,
          video_watched: data.videoWatched,
          video_completion_percentage: data.videoCompletionPercentage,
          session_id: data.sessionId,
          page_url: data.pageUrl,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to send performance analytics:', error);
      // Don't throw - analytics failures shouldn't break the experience
    }
  }

  /**
   * Batch send analytics events
   */
  async sendBatchAnalytics(events) {
    try {
      await this.request('/api/analytics/batch', {
        method: 'POST',
        body: JSON.stringify({
          user_email: this.userIdentifier && this.userIdentifier.includes('@') ? this.userIdentifier : null,
          student_id: this.userIdentifier && !this.userIdentifier.includes('@') ? this.userIdentifier : null,
          events: events
        })
      });
    } catch (error) {
      console.error('Failed to send batch analytics:', error);
    }
  }
}

// Export singleton instance
export const brunnrAPI = new BrunnrAPI();
