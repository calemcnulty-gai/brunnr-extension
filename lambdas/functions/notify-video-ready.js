/**
 * Pipeline webhook endpoint - notifies middleware when video is ready
 * Called by video generation pipeline after uploading to S3/CloudFront
 * 
 * Phase 8 Task 8.4
 */

import { success, error, parseBody } from '../shared/response.js';

// Database module - imported dynamically to handle CommonJS/ES6 mix
let db = null;
async function getDb() {
  if (!db) {
    db = await import('../shared/database.js');
  }
  return db;
}

/**
 * Lambda handler
 */
export async function handler(event) {
  try {
    console.log('[Pipeline Webhook] Video ready notification:', JSON.stringify(event, null, 2));
    
    const body = parseBody(event);
    
    // Validate required fields
    if (!body.skill_tag || !body.video_url) {
      console.error('[Pipeline Webhook] Missing required fields');
      return error('Missing required fields: skill_tag and video_url are required', 400);
    }
    
    const {
      skill_tag,
      video_url,
      video_id,
      title,
      description,
      duration,
      thumbnail_url,
      grade_level,
      topic,
      subject
    } = body;
    
    console.log(`[Pipeline Webhook] Processing video for skill: ${skill_tag}`);
    
    // Check if RDS is configured
    if (!process.env.RDS_HOST) {
      console.warn('[Pipeline Webhook] RDS not configured - cannot update video catalog');
      return error('RDS not configured - video catalog updates not available', 503);
    }
    
    // Update video catalog and mark struggles as resolved
    try {
      const database = await getDb();
      
      // Insert or update video in catalog
      console.log(`[Pipeline Webhook] Adding video to catalog: ${skill_tag}`);
      await database.query(`
        INSERT INTO video_catalog (
          skill_tag, video_url, video_id, title, description,
          duration, thumbnail_url, grade_level, topic, subject, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        ON DUPLICATE KEY UPDATE
          video_url = VALUES(video_url),
          video_id = VALUES(video_id),
          title = VALUES(title),
          description = VALUES(description),
          duration = VALUES(duration),
          thumbnail_url = VALUES(thumbnail_url),
          grade_level = VALUES(grade_level),
          topic = VALUES(topic),
          subject = VALUES(subject),
          is_active = TRUE,
          updated_at = NOW()
      `, [
        skill_tag,
        video_url,
        video_id || `vid-${skill_tag}-${Date.now()}`,
        title || `Video for ${skill_tag}`,
        description || null,
        duration || 90,
        thumbnail_url || null,
        grade_level || null,
        topic || null,
        subject || 'math'
      ]);
      
      console.log(`[Pipeline Webhook] ✓ Video added to catalog`);
      
      // Mark all pending struggles with this skill tag as resolved
      console.log(`[Pipeline Webhook] Marking struggles as resolved for: ${skill_tag}`);
      const result = await database.query(`
        UPDATE struggle_events
        SET video_generated = TRUE,
            video_id = ?,
            generation_status = 'ready',
            generation_completed_at = NOW()
        WHERE JSON_CONTAINS(skill_tags, ?)
          AND video_generated = FALSE
      `, [
        video_id || skill_tag,
        JSON.stringify(skill_tag)
      ]);
      
      const strugglesResolved = result.affectedRows || 0;
      console.log(`[Pipeline Webhook] ✓ Marked ${strugglesResolved} struggles as resolved`);
      
      // Query updated video catalog entry for response
      const [catalogEntry] = await database.query(`
        SELECT 
          skill_tag, video_url, video_id, title, duration,
          view_count, is_active, created_at, updated_at
        FROM video_catalog
        WHERE skill_tag = ?
      `, [skill_tag]);
      
      return success({
        message: 'Video catalog updated successfully',
        skill_tag,
        video_url,
        struggles_resolved: strugglesResolved,
        catalog_entry: catalogEntry || null
      });
      
    } catch (err) {
      console.error('[Pipeline Webhook] Database error:', err);
      return error('Failed to update video catalog', 500, err.message);
    }
    
  } catch (err) {
    console.error('[Pipeline Webhook] Error processing video notification:', err);
    return error('Failed to process video notification', 500, err.message);
  }
}

