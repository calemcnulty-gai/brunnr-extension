/**
 * Storage Management Module
 * Handles session and local storage for the extension
 */

class StorageManager {
  constructor() {
    this.sessionCache = {};
  }

  /**
   * Get data from chrome storage
   */
  async get(keys) {
    return new Promise((resolve) => {
      chrome.storage.session.get(keys, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * Set data in chrome storage
   */
  async set(data) {
    return new Promise((resolve) => {
      chrome.storage.session.set(data, () => {
        // Update local cache
        Object.assign(this.sessionCache, data);
        resolve();
      });
    });
  }

  /**
   * Remove data from chrome storage
   */
  async remove(keys) {
    return new Promise((resolve) => {
      chrome.storage.session.remove(keys, () => {
        // Remove from local cache
        if (Array.isArray(keys)) {
          keys.forEach(key => delete this.sessionCache[key]);
        } else {
          delete this.sessionCache[keys];
        }
        resolve();
      });
    });
  }

  /**
   * Clear all session storage
   */
  async clear() {
    return new Promise((resolve) => {
      chrome.storage.session.clear(() => {
        this.sessionCache = {};
        resolve();
      });
    });
  }

  /**
   * Get student ID from storage
   */
  async getStudentId() {
    const data = await this.get('studentId');
    return data.studentId || null;
  }

  /**
   * Set student ID in storage
   */
  async setStudentId(studentId) {
    await this.set({ studentId });
  }

  /**
   * Get session ID (create if doesn't exist)
   */
  async getSessionId() {
    let data = await this.get('sessionId');
    if (!data.sessionId) {
      const sessionId = this.generateSessionId();
      await this.set({ sessionId });
      return sessionId;
    }
    return data.sessionId;
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store video engagement data
   */
  async storeEngagementData(lessonId, data) {
    const key = `engagement_${lessonId}`;
    const existing = await this.get(key);
    const engagementData = existing[key] || {
      events: [],
      totalWatchTime: 0,
      completionPercentage: 0
    };

    // Add new event
    engagementData.events.push({
      ...data,
      timestamp: new Date().toISOString()
    });

    // Update metrics
    if (data.eventType === 'timeupdate') {
      engagementData.totalWatchTime = data.currentTime;
      engagementData.completionPercentage = (data.currentTime / data.duration) * 100;
    }

    await this.set({ [key]: engagementData });
    return engagementData;
  }

  /**
   * Get video engagement data
   */
  async getEngagementData(lessonId) {
    const key = `engagement_${lessonId}`;
    const data = await this.get(key);
    return data[key] || null;
  }

  /**
   * Store lesson performance data
   */
  async storeLessonPerformance(lessonId, performanceData) {
    const key = `performance_${lessonId}`;
    await this.set({ [key]: performanceData });
  }

  /**
   * Get lesson performance data
   */
  async getLessonPerformance(lessonId) {
    const key = `performance_${lessonId}`;
    const data = await this.get(key);
    return data[key] || null;
  }

  /**
   * Get all pending analytics events
   */
  async getPendingAnalytics() {
    const data = await this.get('pendingAnalytics');
    return data.pendingAnalytics || [];
  }

  /**
   * Add pending analytics event
   */
  async addPendingAnalytics(event) {
    const pending = await this.getPendingAnalytics();
    pending.push({
      ...event,
      timestamp: new Date().toISOString()
    });
    await this.set({ pendingAnalytics: pending });
  }

  /**
   * Clear pending analytics
   */
  async clearPendingAnalytics() {
    await this.remove('pendingAnalytics');
  }

  /**
   * Store auth token
   */
  async setAuthToken(token) {
    await this.set({ authToken: token });
  }

  /**
   * Get auth token
   */
  async getAuthToken() {
    const data = await this.get('authToken');
    return data.authToken || null;
  }
}

// Export singleton instance
export const storage = new StorageManager();
