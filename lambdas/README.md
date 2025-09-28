# Brunnr Extension API - SST Stack

This backend can be deployed as a standalone SST stack OR composed with your main Brunnr project's SST stack.

## Quick Start

### Standalone Deployment
```bash
cd lambdas
npm install
npx sst deploy --stage dev
```

### Composed with Main Project
See `COMPOSITION.md` for detailed integration patterns.

## Why SST?

- **Composable**: Multiple stacks can share resources
- **Type-Safe**: Full TypeScript support with autocompletion
- **Live Development**: `sst dev` for local testing with real AWS services
- **Better DX**: Simpler than raw CloudFormation/SAM

## Project Structure

```
lambdas/
├── sst.config.ts           # SST configuration
├── stacks/
│   └── ExtensionApiStack.ts # Stack definition
├── functions/              # Lambda functions
│   ├── validate-lesson.js
│   ├── get-video-metadata.js
│   ├── track-engagement.js
│   └── track-performance.js
└── shared/                 # Shared utilities
    ├── response.js
    └── database.js
```

## Commands

```bash
# Start development mode (live Lambda)
npm run dev

# Deploy to AWS
npm run deploy              # dev stage
npm run deploy:prod         # production

# Open SST console
npm run console

# Remove from AWS
npm run remove

# Type checking
npm run typecheck

# Local testing (without AWS)
npm run test:local
```

## Configuration

### Secrets (Sensitive values)
```bash
npx sst secrets set CLOUDFRONT_URL https://your-cdn.cloudfront.net
npx sst secrets set RDS_HOST your-db.region.rds.amazonaws.com
npx sst secrets set RDS_PASSWORD your-password
```

### Parameters (Non-sensitive config)
```typescript
// In stack definition
new Config.Parameter(stack, "GRADE_LEVELS", {
  value: "4,5,6"
});
```

## Composition Patterns

### 1. Share RDS from Main Stack
```typescript
// Main project stack
export function DatabaseStack({ stack }: StackContext) {
  const rds = new RDS(stack, "Database", {...});
  return { rds };
}

// Extension stack
import { use } from "sst/constructs";
export function ExtensionApiStack({ stack }: StackContext) {
  const { rds } = use(DatabaseStack);
  // Use shared RDS
}
```

### 2. Share Secrets Across Stacks
```typescript
// Root sst.config.ts
app.setDefaultFunctionProps({
  bind: [SHARED_SECRET],
});
```

### 3. Independent but Coordinated
Deploy separately but reference outputs:
```typescript
const mainApiUrl = Fn.importValue("MainApiUrl");
```

## Development Workflow

### Local Development with Real AWS
```bash
npm run dev
# - Deploys stub Lambdas to AWS
# - Runs functions locally
# - Hot reloads on changes
# - Real AWS services (RDS, S3, etc.)
```

### Testing
```bash
# Unit tests
npm test

# Integration test with local functions
npm run test:local

# Test against deployed stack
curl https://your-api.execute-api.region.amazonaws.com/api/lesson/validate
```

## Monitoring

### CloudWatch Dashboard
SST automatically creates CloudWatch dashboards:
- Function invocations
- Error rates
- Duration metrics
- Cost tracking

### Logs
```bash
# View logs in terminal
npx sst console

# Or use AWS CLI
aws logs tail /aws/lambda/dev-brunnr-extension-ExtensionApi-validateLesson
```

## Cost Optimization

### Development
- Use `sst dev` instead of deploying
- Remove stacks when not in use
- Share RDS with main project

### Production
- Enable X-Ray sampling (not 100%)
- Use Parameter Store instead of Secrets Manager for non-sensitive config
- Consider Lambda reserved concurrency

## Troubleshooting

### SST Dev not working
```bash
# Clear cache
rm -rf .sst
npm run dev
```

### Cannot find module errors
```bash
# Ensure dependencies are in package.json
npm install
npm run build
```

### Timeout errors
Check VPC configuration if using RDS:
- Lambda needs to be in same VPC
- Security groups must allow connection

## Migration from Serverless Framework

1. Keep existing functions as-is (JS is fine)
2. Create SST stack definition
3. Update environment variable references
4. Deploy with SST
5. Remove serverless.yml

## Benefits Over Serverless Framework

- **Type Safety**: Full TypeScript IDE support
- **Composition**: Easy to share resources between stacks
- **Live Dev**: Better local development experience
- **Simpler Config**: Less YAML, more TypeScript
- **Built-in Best Practices**: Automatic CloudWatch dashboards, X-Ray tracing

## Next Steps

1. Set up secrets: `npx sst secrets set CLOUDFRONT_URL your-url`
2. Deploy: `npm run deploy`
3. Test API endpoints
4. Integrate with main project (if using SST)
