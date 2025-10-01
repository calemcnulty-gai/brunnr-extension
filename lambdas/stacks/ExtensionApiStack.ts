/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Extension API Stack
 * Can be deployed standalone or composed with main Brunnr stack
 */
export function ExtensionApiStack({ stack, app }: StackContext) {
  // Configuration - can be shared from main stack or defined here
  const CLOUDFRONT_URL = new Config.Secret(stack, "CLOUDFRONT_URL");
  
  // Optional: Reference RDS from main stack if it exists
  // const { database } = use(DatabaseStack);
  
  // Or define RDS config as secrets for this stack
  const RDS_HOST = new Config.Secret(stack, "RDS_HOST");
  const RDS_PORT = new Config.Secret(stack, "RDS_PORT");
  const RDS_USER = new Config.Secret(stack, "RDS_USER");
  const RDS_PASSWORD = new Config.Secret(stack, "RDS_PASSWORD");
  const RDS_DATABASE = new Config.Parameter(stack, "RDS_DATABASE", {
    value: "brunnr_analytics"
  });

  // Create the API
  const api = new Api(stack, "ExtensionApi", {
    cors: {
      allowOrigins: [
        "https://mathacademy.com",
        "https://www.mathacademy.com",
        "chrome-extension://*"
      ],
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    },
    defaults: {
      function: {
        runtime: "nodejs18.x",
        environment: {
          STAGE: app.stage,
          RDS_DATABASE: RDS_DATABASE.value,
        },
        bind: [
          CLOUDFRONT_URL,
          RDS_HOST,
          RDS_PORT,
          RDS_USER,
          RDS_PASSWORD,
        ],
      },
    },
    routes: {
      // Lesson validation
      "POST /api/lesson/validate": {
        function: {
          handler: "functions/validate-lesson.handler",
          environment: {
            GRADE_LEVELS: "4",
            TOPICS: "multiplication",
          },
        },
      },
      
      // Video metadata
      "GET /api/video/metadata/{lessonId}": {
        function: {
          handler: "functions/get-video-metadata.handler",
        },
      },
      
      // Engagement tracking
      "POST /api/analytics/engagement": {
        function: {
          handler: "functions/track-engagement.handler",
        },
      },
      
      // Batch analytics
      "POST /api/analytics/batch": {
        function: {
          handler: "functions/track-engagement-batch.handler",
        },
      },
      
      // Performance tracking
      "POST /api/analytics/performance": {
        function: {
          handler: "functions/track-performance.handler",
        },
      },
    },
  });

  // Output the API endpoint
  stack.addOutputs({
    ApiEndpoint: api.url,
    ApiId: api.httpApiId,
  });

  // Export for use in other stacks
  return {
    api,
    apiUrl: api.url,
  };
}

/**
 * Example: Composing with main Brunnr stack
 * 
 * In your main project's stack:
 * 
 * import { ExtensionApiStack } from "brunnr-extension/stacks/ExtensionApiStack";
 * 
 * export function ApiStack({ stack, app }: StackContext) {
 *   // Your main API
 *   const mainApi = new Api(stack, "MainApi", {...});
 *   
 *   // Extension API (shares the same AWS account/region)
 *   const { api: extensionApi } = use(ExtensionApiStack);
 *   
 *   // Or if you want to share resources:
 *   const database = new RDS(stack, "Database", {...});
 *   
 *   // Pass to extension stack via app.setDefaultFunctionProps
 *   app.setDefaultFunctionProps({
 *     environment: {
 *       RDS_HOST: database.clusterEndpoint.hostname,
 *     }
 *   });
 * }
 */
