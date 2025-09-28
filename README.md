# Brunnr Chrome Extension

Educational video enhancement extension for MathAcademy.com that injects "Mastery in a Minute" videos into Grade 4 multiplication lessons.

## Repository Structure

```
brunnr-extension/
├── Chrome Extension (Frontend)
│   ├── manifest.json        # Extension configuration
│   ├── background.js        # Service worker
│   ├── content_scripts/     # Page injection scripts
│   ├── lib/                 # Shared utilities
│   └── assets/              # Icons
│
└── Lambda Functions (Backend)
    └── lambdas/
        ├── sst.config.ts    # SST configuration
        ├── stacks/          # Infrastructure as code
        └── functions/       # API endpoints
```

## Installation

### Development
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the extension directory

### Production (via Chrome Web Store)
*Coming soon - distributed through managed Google profile*

## Features

- **Video Injection**: Automatically adds supplemental videos to Grade 4 multiplication lessons on MathAcademy
- **User Identification**: Uses Chrome profile email for consistent user tracking
- **Engagement Analytics**: Tracks video viewing and lesson performance metrics
- **Stateless Operation**: No setup required - just visit MathAcademy and videos appear

## How It Works

1. **Sign into Chrome**: User must be signed into Chrome with their educational email
2. **Visit MathAcademy**: Navigate to any Grade 4 multiplication lesson
3. **Automatic Enhancement**: Videos are automatically injected at the top of qualifying lessons
4. **Analytics Tracking**: All engagement and performance data is tracked and sent to the API

The extension is completely stateless - there's no need to visit any other sites first. Simply being signed into Chrome and visiting MathAcademy is enough.

## Supported Domains

- `mathacademy.com` - Primary domain for video injection and analytics
- `api.brunnr.com` - Backend API for validation and data collection

## Configuration

The extension automatically configures itself based on:
- Chrome profile email (user identification)
- Current lesson content (Grade 4 multiplication detection)

No manual configuration required.

## API Endpoints

The backend is implemented as AWS Lambda functions (see `/lambdas` directory):

- Base URL: `https://api.brunnr.com` (API Gateway)
- Video CDN: CloudFront (configured server-side)

### Endpoints:
- `POST /api/lesson/validate` - Check if lesson should show video
- `GET /api/video/metadata/{lessonId}` - Get video URL and metadata
- `POST /api/analytics/engagement` - Track video engagement
- `POST /api/analytics/performance` - Track lesson performance
- `POST /api/analytics/batch` - Batch analytics events

## Development

### Project Structure
```
├── manifest.json           # Extension configuration
├── background.js          # Service worker for API communication
├── content_scripts/
│   ├── mathacademy.js    # MathAcademy video injection
│   └── styles.css        # Video container styling
├── lib/
│   ├── api.js           # API service module
│   ├── storage.js       # Session storage management
│   └── analytics.js     # Analytics tracking
├── assets/              # Icons and static resources
└── lambdas/             # Serverless backend functions
    ├── serverless.yml   # AWS Lambda configuration
    ├── validate-lesson/ # Lesson validation endpoint
    ├── get-video-metadata/ # Video metadata endpoint
    ├── track-engagement/   # Engagement tracking
    └── track-performance/  # Performance tracking
```

### Testing

#### Extension Testing
1. Ensure you're signed into Chrome with an educational email
2. Load extension in development mode
3. Visit a Grade 4 multiplication lesson on MathAcademy
4. Verify video appears at top of lesson
5. Check console for analytics events

#### Lambda Testing
```bash
cd lambdas
node test-local.js  # Test all functions locally
npm run offline     # Run local API server
```

## Privacy

- User email from Chrome profile used for identification
- Data stored in session storage only (cleared on browser close)
- No additional PII collected
- All data transmitted over HTTPS
- Complies with educational privacy standards

## Chrome Profile Requirements

- Users must be signed into Chrome with their educational email
- The extension uses Chrome's identity API to get the user's email
- This ensures consistent identification without any manual setup

## Quick Start

### Prerequisites
- Chrome browser
- Node.js 18+
- AWS account (for backend)
- User signed into Chrome with educational email

### Extension Setup
```bash
# Load in Chrome
1. Open chrome://extensions/
2. Enable Developer mode
3. Click "Load unpacked"
4. Select this directory
```

### Backend Setup
```bash
cd lambdas
npm install

# Configure AWS credentials
aws configure

# Deploy to AWS
npm run deploy

# Get API URL from output
# Update extension's api.js with the URL
```

## Key Features

### Extension
- 🎥 **Automatic Video Injection**: Detects Grade 4 multiplication lessons
- 👤 **Chrome Profile Integration**: Uses signed-in email for identification
- 📊 **Comprehensive Analytics**: Tracks engagement and performance
- 🔄 **Stateless Operation**: No setup required, just visit MathAcademy

### Backend (SST Lambda Functions)
- ⚡ **Serverless**: Auto-scaling, pay-per-use
- 🔗 **Composable**: Can integrate with main project's SST stack
- 💾 **Flexible Storage**: Works with CloudWatch or RDS
- 💰 **Cost Effective**: ~$0 for development, <$1/month production

## Documentation

- [Extension Details](./README.md) - This file
- [Lambda Functions](./lambdas/README.md) - Backend API documentation
- [Stack Composition](./lambdas/COMPOSITION.md) - How to integrate with main project
- [Database Setup](./lambdas/database/RDS_SETUP.md) - Optional RDS configuration
- [Project Changelog](./.cursor/changelog.md) - Development history

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## License

MIT

## Support

For issues or questions, contact the Brunnr development team.