/**
 * Shared response utilities for Lambda functions
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

/**
 * Create a successful response
 */
function success(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    },
    body: JSON.stringify(data)
  };
}

/**
 * Create an error response
 */
function error(message, statusCode = 500, details = null) {
  const body = {
    error: message,
    timestamp: new Date().toISOString()
  };
  
  if (details) {
    body.details = details;
  }
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    },
    body: JSON.stringify(body)
  };
}

/**
 * Parse request body safely
 */
function parseBody(event) {
  try {
    if (!event.body) return {};
    
    const body = typeof event.body === 'string' 
      ? JSON.parse(event.body) 
      : event.body;
      
    return body;
  } catch (err) {
    console.error('Failed to parse body:', err);
    return {};
  }
}

/**
 * Get user identifier from request
 */
function getUserIdentifier(body) {
  return body.user_email || body.student_id || null;
}

module.exports = {
  success,
  error,
  parseBody,
  getUserIdentifier,
  corsHeaders
};
