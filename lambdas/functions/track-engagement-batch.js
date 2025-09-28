/**
 * Lambda function to handle batch analytics events
 */

const { success, error, parseBody, getUserIdentifier } = require('../shared/response');

/**
 * Store multiple events in batch
 */
async function storeBatchEvents(events, userIdentifier) {
  // In production, this would use DynamoDB batch write or Kinesis
  console.log(`Storing ${events.length} events for user ${userIdentifier}`);
  
  const results = [];
  
  for (const event of events) {
    const enrichedEvent = {
      ...event,
      user: userIdentifier,
      received_at: new Date().toISOString()
    };
    
    console.log('Batch event:', {
      event_type: event.eventType || event.event_type,
      lesson_id: event.lessonId || event.lesson_id,
      timestamp: event.timestamp
    });
    
    results.push({
      event_id: `${event.sessionId || 'batch'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'stored'
    });
  }
  
  return results;
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  try {
    console.log('Batch analytics request received');
    
    const body = parseBody(event);
    const userIdentifier = getUserIdentifier(body);
    
    if (!userIdentifier) {
      return error('User identifier is required', 400);
    }
    
    if (!body.events || !Array.isArray(body.events)) {
      return error('Events array is required', 400);
    }
    
    if (body.events.length === 0) {
      return error('Events array cannot be empty', 400);
    }
    
    if (body.events.length > 100) {
      return error('Maximum 100 events per batch', 400);
    }
    
    console.log(`Processing ${body.events.length} events for user ${userIdentifier}`);
    
    // Store all events
    const results = await storeBatchEvents(body.events, userIdentifier);
    
    return success({
      success: true,
      message: `Successfully processed ${results.length} events`,
      results: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('Error processing batch analytics:', err);
    return error('Failed to process batch analytics', 500, err.message);
  }
};
