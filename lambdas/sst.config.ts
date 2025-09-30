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

    // Lesson validation endpoint
    api.route("POST /api/lesson/validate", "functions/validate-lesson.handler");

    // Video metadata endpoint  
    api.route("GET /api/video/metadata/{lessonId}", "functions/get-video-metadata.handler");

    // Engagement tracking endpoint
    api.route("POST /api/analytics/engagement", "functions/track-engagement.handler");

    // Batch analytics endpoint
    api.route("POST /api/analytics/batch", "functions/track-engagement-batch.handler");

    // Performance tracking endpoint
    api.route("POST /api/analytics/performance", "functions/track-performance.handler");

    return {
      api: api.url,
    };
  },
});