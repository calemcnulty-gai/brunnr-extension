/**
 * Lambda function to track video engagement analytics
 */

const { success, error, parseBody, getUserIdentifier } = require('../shared/response');
const db = require('../shared/database');

/**
 * Store engagement event
 */
async function storeEngagementEvent(event) {
  // Try to store in RDS if configured
  if (process.env.RDS_HOST) {
    try {
      const eventId = await db.storeEngagementEvent(event);
      console.log(`Event stored in RDS with ID: ${eventId}`);
      return { success: true, eventId };
    } catch (dbError) {
      console.error('Failed to store in RDS, falling back to logs:', dbError);
    }
  }
  
  // Fallback: log the event (can be picked up by CloudWatch)
  console.log('ENGAGEMENT_EVENT:', JSON.stringify({
    user: event.user,
    lesson_id: event.lesson_id,
    event_type: event.event_type,
    timestamp: event.timestamp,
    session_id: event.session_id,
    metadata: {
      current_time: event.current_time,
      duration: event.duration,
      completion_percentage: event.completion_percentage
    }
  }));
  
  return { success: true };
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  try {
    console.log('Track engagement request:', JSON.stringify(event, null, 2));
    
    const body = parseBody(event);
    const userIdentifier = getUserIdentifier(body);
    
    if (!userIdentifier) {
      return error('User identifier is required', 400);
    }
    
    // Validate required fields
    if (!body.lesson_id || !body.event_type) {
      return error('Missing required fields: lesson_id, event_type', 400);
    }
    
    // Create engagement event
    const engagementEvent = {
      user: userIdentifier,
      lesson_id: body.lesson_id,
      video_url: body.video_url,
      event_type: body.event_type,
      timestamp: body.timestamp || new Date().toISOString(),
      session_id: body.session_id,
      page_url: body.page_url,
      
      // Video-specific metrics
      current_time: body.current_time,
      duration: body.duration,
      playback_rate: body.playback_rate,
      volume: body.volume,
      fullscreen: body.fullscreen,
      
      // Calculated metrics
      completion_percentage: body.current_time && body.duration 
        ? (body.current_time / body.duration) * 100 
        : 0,
      
      // Additional metadata
      watched_segments: body.watched_segments,
      
      // System metadata
      received_at: new Date().toISOString(),
      ip_address: event.requestContext?.http?.sourceIp
    };
    
    // Store the event
    await storeEngagementEvent(engagementEvent);
    
    console.log(`Engagement event stored: ${body.event_type} for user ${userIdentifier}`);
    
    return success({
      success: true,
      message: 'Engagement event tracked successfully',
      event_id: `${body.session_id}_${Date.now()}`
    });
    
  } catch (err) {
    console.error('Error tracking engagement:', err);
    return error('Failed to track engagement', 500, err.message);
  }
};
