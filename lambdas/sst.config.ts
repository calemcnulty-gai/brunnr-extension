/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "brunnr-extension",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // API Gateway
    const api = new sst.aws.ApiGatewayV2("ExtensionApi", {
      cors: true,  // Simplified CORS - allow all for now
    });

    // Lesson validation endpoint (with environment variables)
    api.route("POST /api/lesson/validate", {
      handler: "functions/validate-lesson.handler",
      environment: {
        // FEATURE FLAG: Controls struggle-based video selection
        // false = default video only (TSA pilot mode)
        // true = struggle-based targeted videos (future mode)
        ENABLE_STRUGGLE_SELECTION: "false",
      }
    });

    // Video metadata endpoint  
    api.route("GET /api/video/metadata/{lessonId}", "functions/get-video-metadata.handler");

    // Engagement tracking endpoint
    api.route("POST /api/analytics/engagement", "functions/track-engagement.handler");

    // Batch analytics endpoint
    api.route("POST /api/analytics/batch", "functions/track-engagement-batch.handler");

    // Performance tracking endpoint
    api.route("POST /api/analytics/performance", "functions/track-performance.handler");

    // Pipeline webhook endpoint (Phase 8 Task 8.4)
    // Called by video generation pipeline when new video is ready
    api.route("POST /api/pipeline/video-ready", "functions/notify-video-ready.handler");

    return {
      api: api.url,
    };
  },
});