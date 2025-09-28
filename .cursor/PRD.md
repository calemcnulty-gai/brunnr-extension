# Brunnr Chrome Extension - Product Requirements Document

## Overview
Chrome extension that enhances MathAcademy.com with supplemental video content ("Mastery in a Minute") for Grade 4 multiplication lessons. The extension operates in a completely stateless manner, using the Chrome profile email for user identification.

## Core Functionality

### 1. Domain Integration
- **Primary Domain**: mathacademy.com (video injection and engagement tracking)
- **API Domain**: brunnr.com (validation, video metadata, analytics)
- **Stateless Operation**: No dependency on other domains or prior navigation

### 2. Video Injection
- **Target**: Grade 4 multiplication lessons on MathAcademy
- **Location**: Top of lesson content
- **Title**: "Mastery in a Minute"
- **Player**: Native browser HTML5 video player
- **Validation**: API endpoint validates if current lesson should display video

### 3. Data Collection & Analytics

#### User Identification
- Get email from Chrome profile using identity API
- No extraction or scraping required
- Consistent identification across all sessions

#### Engagement Metrics
- Video play/pause events
- Time watched (total and segments)
- Completion percentage
- Lesson quiz/example performance
- Correlation between video viewing and performance

### 4. Technical Architecture

#### Content Scripts
1. **mathacademy_content.js**
   - Detect lesson pages (exclude assessments)
   - Inject video container at top of lesson
   - Track lesson performance metrics
   - Send analytics events
   - Get user email from Chrome profile

#### Background Service Worker
- Manage API communication
- Store session data
- Coordinate between content scripts
- Handle authentication tokens

#### API Integration
- **Base URL**: https://api.brunnr.com
- **Video CDN**: CloudFront (URL TBD)
- **Authentication**: Bearer tokens from API
- **Endpoints**:
  - `GET /api/lesson/validate` - Check if lesson should show video
  - `GET /api/video/metadata` - Get video URL and auth headers
  - `POST /api/analytics/engagement` - Send engagement data
  - `POST /api/analytics/performance` - Send lesson performance data

## User Flow

1. Student is signed into Chrome with educational email
2. Student navigates directly to MathAcademy lesson
3. Extension gets email from Chrome profile
4. Extension checks if lesson is Grade 4 multiplication
5. API validates lesson eligibility
6. Video container injected at top of lesson
7. Video loads from CloudFront CDN
8. Extension tracks all engagement and performance
9. Data sent to API for analysis with email identifier

## Non-Functional Requirements

### Performance
- Video injection < 500ms after page load
- Minimal impact on page performance
- Async loading of video content

### Security
- HTTPS only for all API calls
- Email obtained from Chrome profile (user consented)
- Session data cleared on browser close
- No PII stored locally beyond session

### Browser Support
- Chrome 120+ (Manifest V3)
- Automatic updates via Chrome Web Store

### Error Handling
- Graceful degradation if API unavailable
- No video injection if offline
- Silent failures (no user-facing errors)

## Success Metrics
- Video completion rate
- Correlation between video viewing and quiz performance
- Lesson completion time with/without video
- Student engagement patterns

## Future Considerations
- Additional grade levels and subjects
- Interactive video elements
- Teacher dashboard integration
- Offline video caching
- A/B testing framework

## Development Phases

### Phase 1: MVP (Current)
- Basic video injection for Grade 4 multiplication
- Chrome profile email identification
- Core engagement tracking
- Stateless operation

### Phase 2: Enhanced Analytics
- Detailed performance correlation
- Advanced engagement metrics
- Backend dashboard

### Phase 3: Scale
- Additional content areas
- Teacher tools
- Performance optimizations
