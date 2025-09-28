# SST Stack Composition Guide

## Overview

This extension backend is built as an SST stack that can be:
1. **Deployed standalone** - Independent API for the Chrome extension
2. **Composed with your main project** - Share resources like RDS, secrets, etc.

## Standalone Deployment

```bash
cd lambdas
npx sst deploy --stage prod
```

This creates:
- API Gateway for the extension
- Lambda functions
- Separate CloudFormation stack

## Composing with Main Project

### Option 1: Import Extension Stack into Main Project

In your main project's `sst.config.ts`:

```typescript
import { ExtensionApiStack } from "@brunnr/extension/stacks/ExtensionApiStack";

export default {
  config(_input) {
    return {
      name: "brunnr-main",
      region: "us-east-1",
    };
  },
  stacks(app) {
    // Your main stacks
    app.stack(DatabaseStack);
    app.stack(ApiStack);
    
    // Extension API stack
    app.stack(ExtensionApiStack);
  }
} satisfies SSTConfig;
```

### Option 2: Share Resources Between Stacks

```typescript
// In your main project's DatabaseStack.ts
export function DatabaseStack({ stack }: StackContext) {
  const rds = new RDS(stack, "Database", {
    engine: "mysql5.7",
    defaultDatabaseName: "brunnr",
    migrations: "path/to/migrations",
  });

  return { rds };
}

// In ExtensionApiStack.ts (modified)
import { use } from "sst/constructs";
import { DatabaseStack } from "../main-project/stacks/DatabaseStack";

export function ExtensionApiStack({ stack }: StackContext) {
  // Use the shared database
  const { rds } = use(DatabaseStack);
  
  const api = new Api(stack, "ExtensionApi", {
    defaults: {
      function: {
        environment: {
          RDS_HOST: rds.clusterEndpoint.hostname,
          RDS_PORT: rds.clusterEndpoint.port.toString(),
          RDS_DATABASE: rds.defaultDatabaseName,
        },
      },
    },
    // ... rest of API config
  });
}
```

### Option 3: Cross-Stack References

```typescript
// Deploy main stack first
// main-project/stacks/ApiStack.ts
export function ApiStack({ stack }: StackContext) {
  const api = new Api(stack, "MainApi", {
    // ... main API config
  });

  // Export values for other stacks
  new CfnOutput(stack, "MainApiUrl", {
    value: api.url,
    exportName: "MainApiUrl",
  });
}

// Reference in extension stack
// extension/stacks/ExtensionApiStack.ts
export function ExtensionApiStack({ stack }: StackContext) {
  const mainApiUrl = Fn.importValue("MainApiUrl");
  
  const api = new Api(stack, "ExtensionApi", {
    defaults: {
      function: {
        environment: {
          MAIN_API_URL: mainApiUrl,
        },
      },
    },
    // ... rest of config
  });
}
```

## Monorepo Structure

If using a monorepo:

```
brunnr/
├── packages/
│   ├── main-api/
│   │   └── sst.config.ts
│   ├── extension/
│   │   ├── chrome/        # Extension code
│   │   └── api/          # This SST stack
│   │       └── sst.config.ts
│   └── shared/
│       └── database/     # Shared schemas
├── sst.config.ts         # Root SST config
└── package.json
```

Root `sst.config.ts`:
```typescript
import { MainApiStack } from "./packages/main-api/stacks";
import { ExtensionApiStack } from "./packages/extension/api/stacks";

export default {
  config(_input) {
    return {
      name: "brunnr",
      region: "us-east-1",
    };
  },
  stacks(app) {
    // Deploy in order
    app.stack(DatabaseStack);     // Shared database
    app.stack(MainApiStack);       // Main API
    app.stack(ExtensionApiStack);  // Extension API
  }
} satisfies SSTConfig;
```

## Environment Variables

### Shared Secrets
```typescript
// In root stack
const secrets = {
  CLOUDFRONT_URL: new Config.Secret(stack, "CLOUDFRONT_URL"),
  RDS_PASSWORD: new Config.Secret(stack, "RDS_PASSWORD"),
};

// Pass to all functions
app.setDefaultFunctionProps({
  bind: Object.values(secrets),
});
```

### Stack-Specific Config
```typescript
// Extension stack only
const extensionConfig = {
  GRADE_LEVELS: "4,5",
  TOPICS: "multiplication,division",
};
```

## Deployment Strategies

### 1. Independent Deployments
```bash
# Deploy main project
cd main-project
npx sst deploy --stage prod

# Deploy extension
cd extension/api
npx sst deploy --stage prod
```

### 2. Coordinated Deployment
```bash
# From root with all stacks
npx sst deploy --stage prod
```

### 3. CI/CD Pipeline
```yaml
# GitHub Actions example
- name: Deploy Main API
  run: npx sst deploy --stage prod
  working-directory: ./packages/main-api

- name: Deploy Extension API
  run: npx sst deploy --stage prod
  working-directory: ./packages/extension/api
  needs: deploy-main
```

## Benefits of Composition

1. **Resource Sharing**: One RDS instance for all stacks
2. **Cost Optimization**: Shared NAT gateways, VPCs
3. **Unified Secrets**: Single source of truth for config
4. **Consistent Deployment**: Same stage across stacks
5. **Cross-Stack Communication**: Direct VPC peering

## Migration Path

Start with standalone, then compose:

1. Deploy extension standalone initially
2. When main project uses SST, import extension stack
3. Gradually share resources (RDS, secrets, etc.)
4. Eventually merge into monorepo if desired

## Example Commands

```bash
# Set secrets (shared across stacks)
npx sst secrets set CLOUDFRONT_URL https://cdn.example.com
npx sst secrets set RDS_PASSWORD secretpassword

# Deploy all stacks
npx sst deploy --stage prod

# Deploy single stack
npx sst deploy ExtensionApiStack --stage prod

# Remove stack
npx sst remove ExtensionApiStack --stage prod

# Debug
npx sst dev
```
