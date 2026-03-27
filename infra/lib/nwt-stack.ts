import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as path from "path";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
  HttpRoute,
  HttpRouteKey,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

export class NwtStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------
    // DynamoDB Table
    // ---------------------------------------------------------------
    const table = new dynamodb.Table(this, "NwtTable", {
      tableName: "nwt",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      deletionProtection: true,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------
    // Lambda Function
    // ---------------------------------------------------------------
    const fn = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "api")),
      environment: {
        TABLE_NAME: table.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    // Create a version alias "live"
    const version = fn.currentVersion;
    new lambda.Alias(this, "LiveAlias", {
      aliasName: "live",
      version,
    });

    // Grant DynamoDB read/write
    table.grantReadWriteData(fn);

    // ---------------------------------------------------------------
    // S3 Bucket (private, no public access)
    // ---------------------------------------------------------------
    const bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------------------------------------------------------------
    // Cognito User Pool
    // ---------------------------------------------------------------
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
    });

    // User Pool Domain
    const userPoolDomain = userPool.addDomain("Domain", {
      cognitoDomain: {
        domainPrefix: `nwt-auth-${cdk.Aws.ACCOUNT_ID}`,
      },
    });

    // Google Identity Provider — credentials from SSM Parameter Store
    const googleClientId = ssm.StringParameter.valueForStringParameter(
      this,
      "/nwt/google-client-id"
    );
    const googleClientSecret = ssm.StringParameter.valueForStringParameter(
      this,
      "/nwt/google-client-secret"
    );

    const googleIdp = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleIdP",
      {
        userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
        scopes: ["openid", "email", "profile"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      }
    );

    // ---------------------------------------------------------------
    // API Gateway HTTP API (declared early so CloudFront can reference it)
    // ---------------------------------------------------------------
    const httpApi = new HttpApi(this, "HttpApi", {
      apiName: "nwt-api",
      corsPreflight: {
        // Will be updated after CloudFront URL is known; use Fn.join
        allowOrigins: ["http://localhost:5173"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type", "Authorization"],
      },
      defaultAuthorizationScopes: [],
    });

    // Apply throttle settings via CfnStage
    const defaultStage = httpApi.defaultStage!.node
      .defaultChild as cdk.aws_apigatewayv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 100,
      throttlingRateLimit: 50,
    };

    // ---------------------------------------------------------------
    // CloudFront Distribution
    // ---------------------------------------------------------------
    // Extract API Gateway domain and stage from the URL
    // httpApi.apiEndpoint is like https://<id>.execute-api.<region>.amazonaws.com
    const apiDomainName = cdk.Fn.select(
      2,
      cdk.Fn.split("/", httpApi.apiEndpoint)
    );

    // Response Headers Policy with security headers
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "SecurityHeadersPolicy",
      {
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy: [
              "default-src 'self'",
              `connect-src 'self' https://api.frankfurter.app https://cognito-idp.us-east-1.amazonaws.com https://${userPoolDomain.domainName}.auth.us-east-1.amazoncognito.com`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
            ].join("; "),
            override: true,
          },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.seconds(63072000),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: { override: true },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      }
    );

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin:
          origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        responseHeadersPolicy,
      },
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(apiDomainName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy
              .ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          responseHeadersPolicy,
        },
      },
    });

    const cloudfrontUrl = `https://${distribution.distributionDomainName}`;

    // ---------------------------------------------------------------
    // Update API Gateway CORS with CloudFront URL
    // ---------------------------------------------------------------
    // We need to use an escape hatch to add the CloudFront origin to CORS
    const cfnApi = httpApi.node.defaultChild as cdk.aws_apigatewayv2.CfnApi;
    cfnApi.corsConfiguration = {
      allowOrigins: [cloudfrontUrl, "http://localhost:5173"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    };

    // ---------------------------------------------------------------
    // Cognito App Client (after CloudFront URL is known)
    // ---------------------------------------------------------------
    const appClient = userPool.addClient("AppClient", {
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [cloudfrontUrl, "http://localhost:5173"],
        logoutUrls: [cloudfrontUrl, "http://localhost:5173"],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(7),
    });

    // Ensure Google IdP is created before the app client
    appClient.node.addDependency(googleIdp);

    // ---------------------------------------------------------------
    // JWT Authorizer
    // ---------------------------------------------------------------
    const jwtAuthorizer = new HttpJwtAuthorizer(
      "CognitoAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [appClient.userPoolClientId],
      }
    );

    // ---------------------------------------------------------------
    // Lambda Integration
    // ---------------------------------------------------------------
    const lambdaIntegration = new HttpLambdaIntegration(
      "LambdaIntegration",
      fn
    );

    // ---------------------------------------------------------------
    // API Routes (all with JWT authorizer except telemetry)
    // ---------------------------------------------------------------
    const authorizedRoutes: Array<{ method: HttpMethod; path: string }> = [
      { method: HttpMethod.GET, path: "/api/state" },
      { method: HttpMethod.POST, path: "/api/items" },
      { method: HttpMethod.PUT, path: "/api/items/{id}" },
      { method: HttpMethod.DELETE, path: "/api/items/{id}" },
      { method: HttpMethod.POST, path: "/api/items/batch" },
      { method: HttpMethod.PUT, path: "/api/items/batch" },
      { method: HttpMethod.POST, path: "/api/categories" },
      { method: HttpMethod.PUT, path: "/api/categories/{id}" },
      { method: HttpMethod.DELETE, path: "/api/categories/{id}" },
      { method: HttpMethod.POST, path: "/api/snapshots" },
      { method: HttpMethod.GET, path: "/api/snapshots/{date}/items" },
      { method: HttpMethod.DELETE, path: "/api/snapshots/{date}" },
      { method: HttpMethod.PUT, path: "/api/settings" },
      { method: HttpMethod.POST, path: "/api/import" },
      { method: HttpMethod.GET, path: "/api/yahoo/{proxy+}" },
    ];

    for (const route of authorizedRoutes) {
      httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: lambdaIntegration,
        authorizer: jwtAuthorizer,
      });
    }

    // Telemetry route — public, no authorizer
    httpApi.addRoutes({
      path: "/api/telemetry",
      methods: [HttpMethod.POST],
      integration: lambdaIntegration,
    });

    // ---------------------------------------------------------------
    // SNS Topic for Alarms
    // ---------------------------------------------------------------
    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: "NWT Alarm Notifications",
    });

    // ---------------------------------------------------------------
    // CloudWatch Alarms
    // ---------------------------------------------------------------

    // 1. Lambda errors > 5 in 5 minutes
    const lambdaErrorsAlarm = new cloudwatch.Alarm(this, "LambdaErrorsAlarm", {
      alarmDescription: "Lambda errors > 5 in 5 minutes",
      metric: fn.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaErrorsAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    // 2. API Gateway 5xx > 5 in 5 minutes
    const api5xxAlarm = new cloudwatch.Alarm(this, "Api5xxAlarm", {
      alarmDescription: "API Gateway 5xx errors > 5 in 5 minutes",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApiGateway",
        metricName: "5xx",
        dimensionsMap: { ApiId: httpApi.httpApiId },
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api5xxAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    // 3. Lambda duration p99 > 5s for 10 minutes
    const lambdaDurationAlarm = new cloudwatch.Alarm(
      this,
      "LambdaDurationAlarm",
      {
        alarmDescription: "Lambda p99 duration > 5s for 10 minutes",
        metric: fn.metricDuration({
          period: cdk.Duration.minutes(5),
          statistic: "p99",
        }),
        threshold: 5000, // milliseconds
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    lambdaDurationAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    // 4. DynamoDB throttled requests > 0 for 5 minutes
    const dynamoThrottleAlarm = new cloudwatch.Alarm(
      this,
      "DynamoThrottleAlarm",
      {
        alarmDescription: "DynamoDB throttled requests > 0 for 5 minutes",
        metric: new cloudwatch.MathExpression({
          expression: "reads + writes",
          usingMetrics: {
            reads: table.metricThrottledRequestsForOperation("GetItem", {
              period: cdk.Duration.minutes(5),
              statistic: "Sum",
            }),
            writes: table.metricThrottledRequestsForOperation("PutItem", {
              period: cdk.Duration.minutes(5),
              statistic: "Sum",
            }),
          },
          period: cdk.Duration.minutes(5),
        }),
        threshold: 0,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    dynamoThrottleAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

    // ---------------------------------------------------------------
    // CloudWatch Dashboard
    // ---------------------------------------------------------------
    const dashboard = new cloudwatch.Dashboard(this, "NwtDashboard", {
      dashboardName: "NWT-Dashboard",
    });

    // Lambda widgets
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Lambda Invocations",
        left: [
          fn.metricInvocations({
            period: cdk.Duration.minutes(5),
            statistic: "Sum",
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: "Lambda Errors",
        left: [
          fn.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: "Sum",
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: "Lambda Duration (p50 / p99)",
        left: [
          fn.metricDuration({
            period: cdk.Duration.minutes(5),
            statistic: "p50",
            label: "p50",
          }),
          fn.metricDuration({
            period: cdk.Duration.minutes(5),
            statistic: "p99",
            label: "p99",
          }),
        ],
        width: 8,
      })
    );

    // API Gateway widgets
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "API Gateway Requests",
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/ApiGateway",
            metricName: "Count",
            dimensionsMap: { ApiId: httpApi.httpApiId },
            period: cdk.Duration.minutes(5),
            statistic: "Sum",
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway 4xx Rate",
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/ApiGateway",
            metricName: "4xx",
            dimensionsMap: { ApiId: httpApi.httpApiId },
            period: cdk.Duration.minutes(5),
            statistic: "Sum",
          }),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway 5xx Rate",
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/ApiGateway",
            metricName: "5xx",
            dimensionsMap: { ApiId: httpApi.httpApiId },
            period: cdk.Duration.minutes(5),
            statistic: "Sum",
          }),
        ],
        width: 8,
      })
    );

    // DynamoDB widget
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "DynamoDB Throttled Requests",
        left: [
          table.metricThrottledRequestsForOperation("GetItem", {
            period: cdk.Duration.minutes(5),
            statistic: "Sum",
            label: "GetItem Throttled",
          }),
          table.metricThrottledRequestsForOperation("PutItem", {
            period: cdk.Duration.minutes(5),
            statistic: "Sum",
            label: "PutItem Throttled",
          }),
        ],
        width: 24,
      })
    );

    // ---------------------------------------------------------------
    // Stack Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: cloudfrontUrl,
      description: "CloudFront distribution URL",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
      description: "CloudFront distribution ID",
    });

    new cdk.CfnOutput(this, "S3BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket name for frontend assets",
    });

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: httpApi.apiEndpoint,
      description: "API Gateway endpoint URL",
    });

    new cdk.CfnOutput(this, "CognitoUserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "CognitoAppClientId", {
      value: appClient.userPoolClientId,
      description: "Cognito App Client ID",
    });

    new cdk.CfnOutput(this, "CognitoDomain", {
      value: `${userPoolDomain.domainName}.auth.us-east-1.amazoncognito.com`,
      description: "Cognito hosted UI domain",
    });

    new cdk.CfnOutput(this, "DynamoDBTableName", {
      value: table.tableName,
      description: "DynamoDB table name",
    });
  }
}
