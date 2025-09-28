/**
 * Popup Script
 * Displays extension status and controls
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatus();
  
  // Setup clear data button
  document.getElementById('clear-data').addEventListener('click', clearSessionData);
});

/**
 * Load and display extension status
 */
async function loadStatus() {
  try {
    // Get data from storage
    const data = await chrome.storage.session.get(['userEmail', 'studentId', 'sessionId']);
    
    // Get tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if on supported domain
    const supportedDomains = [
      'mathacademy.com',
      'timebackeducation.com',
      'timeback.timeback.com'
    ];
    
    const isSupported = supportedDomains.some(domain => 
      tab.url && tab.url.includes(domain)
    );
    
    // Update UI
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
    
    // Extension status
    const statusEl = document.getElementById('extension-status');
    if (isSupported) {
      statusEl.textContent = 'Active';
      statusEl.className = 'status-value active';
    } else {
      statusEl.textContent = 'Inactive';
      statusEl.className = 'status-value inactive';
    }
    
    // User Email
    const userEmailEl = document.getElementById('user-email');
    if (data.userEmail) {
      userEmailEl.textContent = data.userEmail;
      userEmailEl.className = 'status-value active';
    } else {
      // Try to get from Chrome profile
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_USER_EMAIL' });
        if (response && response.email) {
          userEmailEl.textContent = response.email;
          userEmailEl.className = 'status-value active';
        } else {
          userEmailEl.textContent = 'Not signed in';
          userEmailEl.className = 'status-value inactive';
        }
      } catch (error) {
        userEmailEl.textContent = 'Not available';
        userEmailEl.className = 'status-value inactive';
      }
    }
    
    // Session ID
    const sessionIdEl = document.getElementById('session-id');
    if (data.sessionId) {
      // Show shortened version
      const shortId = data.sessionId.substring(0, 12) + '...';
      sessionIdEl.textContent = shortId;
      sessionIdEl.className = 'status-value active';
    } else {
      sessionIdEl.textContent = 'Not started';
      sessionIdEl.className = 'status-value inactive';
    }
    
    // Get video injection count
    const allData = await chrome.storage.session.get(null);
    const videoCount = Object.keys(allData).filter(key => 
      key.startsWith('engagement_')
    ).length;
    
    document.getElementById('video-count').textContent = videoCount.toString();
    document.getElementById('video-count').className = videoCount > 0 ? 'status-value active' : 'status-value';
    
  } catch (error) {
    console.error('Error loading status:', error);
    document.getElementById('loading').textContent = 'Error loading status';
  }
}

/**
 * Clear session data
 */
async function clearSessionData() {
  if (confirm('This will clear all session data including student ID and analytics. Continue?')) {
    try {
      await chrome.storage.session.clear();
      
      // Reload status
      await loadStatus();
      
      // Show confirmation
      const button = document.getElementById('clear-data');
      const originalText = button.textContent;
      button.textContent = 'Cleared!';
      button.disabled = true;
      
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
      
      // Re-fetch user email after clearing
      setTimeout(async () => {
        await chrome.runtime.sendMessage({ type: 'GET_USER_EMAIL' });
      }, 100);
      
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Failed to clear data');
    }
  }
}
