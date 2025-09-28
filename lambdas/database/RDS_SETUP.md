# RDS Setup Guide for Brunnr Analytics

## Overview

The Lambda functions can operate with or without RDS. Without RDS, they log events to CloudWatch. With RDS, they persist all analytics data for reporting and analysis.

## Architecture Options

### Option 1: CloudWatch Logs Only (Default)
- No database setup required
- Events logged to CloudWatch
- Can query with CloudWatch Insights
- Good for development and low volume

### Option 2: RDS MySQL/Aurora
- Persistent storage
- Rich querying capabilities
- Better for production
- Supports complex analytics

## RDS Setup Steps

### 1. Create RDS Instance

#### Using AWS Console:
1. Go to RDS Console
2. Create database
3. Choose MySQL 8.0 or Aurora MySQL
4. Settings:
   - DB instance identifier: `brunnr-analytics`
   - Master username: `admin`
   - Master password: (secure password)
   - DB instance class: `db.t3.micro` (free tier) or `db.t4g.small` (production)
   - Storage: 20 GB minimum
   - Enable automated backups

#### Using AWS CLI:
```bash
aws rds create-db-instance \
  --db-instance-identifier brunnr-analytics \
  --db-instance-class db.t3.micro \
  --engine mysql \
  --engine-version 8.0.35 \
  --master-username admin \
  --master-user-password <secure-password> \
  --allocated-storage 20 \
  --vpc-security-group-ids <security-group-id> \
  --backup-retention-period 7 \
  --publicly-accessible false
```

### 2. Configure VPC and Security

#### Create Lambda Security Group:
```bash
aws ec2 create-security-group \
  --group-name lambda-rds-sg \
  --description "Security group for Lambda to RDS access"
```

#### Configure RDS Security Group:
- Allow inbound MySQL (3306) from Lambda security group
- No public access needed

### 3. Set Up Database

Connect to RDS instance and run the schema:
```bash
mysql -h <rds-endpoint> -u admin -p < database/schema.sql
```

### 4. Create Lambda User

```sql
CREATE USER 'lambda_user'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT, INSERT, UPDATE ON brunnr_analytics.* TO 'lambda_user'@'%';
GRANT EXECUTE ON brunnr_analytics.* TO 'lambda_user'@'%';
FLUSH PRIVILEGES;
```

### 5. Configure Lambda Functions

Update `.env` with RDS details:
```env
RDS_HOST=your-instance.region.rds.amazonaws.com
RDS_PORT=3306
RDS_USER=lambda_user
RDS_PASSWORD=secure_password
RDS_DATABASE=brunnr_analytics

# VPC Configuration
LAMBDA_SECURITY_GROUP=sg-xxxxxxxxx
LAMBDA_SUBNET_1=subnet-xxxxxxxxx
LAMBDA_SUBNET_2=subnet-yyyyyyyyy
```

### 6. Deploy with VPC Configuration

Uncomment VPC configuration in `serverless.yml`:
```yaml
provider:
  vpc:
    securityGroupIds:
      - ${env:LAMBDA_SECURITY_GROUP}
    subnetIds:
      - ${env:LAMBDA_SUBNET_1}
      - ${env:LAMBDA_SUBNET_2}
```

Deploy:
```bash
npm run deploy
```

## Connection Pooling

Lambda functions reuse connections across invocations in the same container. The database module implements:
- Connection pool with size 1 (Lambda is single-threaded)
- Automatic reconnection on failure
- Connection reuse across warm starts

## Monitoring

### CloudWatch Metrics to Watch:
- Lambda invocations and errors
- Lambda duration
- RDS connections
- RDS CPU and memory
- RDS storage

### Set Up Alarms:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name high-db-connections \
  --alarm-description "Alert when RDS connections are high" \
  --metric-name DatabaseConnections \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold
```

## Cost Optimization

### Development:
- Use `db.t3.micro` (free tier eligible)
- Stop RDS instance when not in use
- Use CloudWatch Logs only

### Production:
- Use Aurora Serverless v2 for auto-scaling
- Or use `db.t4g.small` for consistent workload
- Enable RDS Proxy for connection pooling at scale

### Estimated Costs:
- **Development**: ~$0/month (free tier)
- **Small Production**: ~$15-30/month
- **Aurora Serverless**: ~$50-100/month (scales with usage)

## Backup and Recovery

### Automated Backups:
- Enabled by default
- 7-day retention recommended
- Point-in-time recovery available

### Manual Snapshots:
```bash
aws rds create-db-snapshot \
  --db-instance-identifier brunnr-analytics \
  --db-snapshot-identifier brunnr-analytics-$(date +%Y%m%d)
```

## Troubleshooting

### Lambda Can't Connect to RDS:
1. Check VPC configuration
2. Verify security groups
3. Check RDS is in same VPC
4. Ensure Lambda has VPC permissions

### Connection Pool Exhausted:
1. Increase connection limit in RDS
2. Consider RDS Proxy
3. Check for connection leaks

### High Latency:
1. Ensure Lambda and RDS in same AZ
2. Check RDS instance size
3. Optimize queries with indexes

## Migration from CloudWatch to RDS

If starting with CloudWatch logs and later adding RDS:

1. Export CloudWatch logs to S3
2. Parse JSON events
3. Import into RDS using batch inserts
4. Update Lambda environment variables
5. Deploy updated functions

## Sample Queries

### Daily Active Users:
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(DISTINCT user_email) as active_users
FROM engagement_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Lesson Performance:
```sql
SELECT 
  l.title,
  COUNT(DISTINCT p.user_email) as students,
  AVG(p.performance_score) as avg_score,
  AVG(p.video_completion_percentage) as avg_video_completion
FROM performance_metrics p
JOIN lesson_metadata l ON p.lesson_id = l.lesson_id
WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY l.lesson_id, l.title
ORDER BY students DESC;
```

### User Progress:
```sql
SELECT 
  user_email,
  COUNT(DISTINCT lesson_id) as lessons_completed,
  AVG(performance_score) as avg_score,
  SUM(time_on_lesson) / 60 as total_minutes
FROM performance_metrics
WHERE completion_status = 'completed'
GROUP BY user_email
ORDER BY lessons_completed DESC;
```
