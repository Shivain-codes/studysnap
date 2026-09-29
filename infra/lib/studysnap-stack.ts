import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';

export interface StudySnapStackProps extends cdk.StackProps {
  /** Email to receive the $20 billing alarm. If omitted, topic is created without a subscription. */
  readonly alarmEmail?: string;
  /** Primary Bedrock model id (us. inference profile). Amazon Nova Lite by default. */
  readonly aiModelId: string;
  /** Model id for the Quiz-Me grading path (may differ from primary). */
  readonly quizModelId: string;
}

/**
 * StudySnap skeleton stack (Day-1 ship gate):
 *  - DynamoDB single table (PK/SK, on-demand)
 *  - S3 uploads bucket (browser CORS, private)
 *  - Cognito User Pool + client
 *  - API Gateway (REST) + GET /health (public)
 *  - $20 CloudWatch billing alarm -> SNS email
 * Feature Lambdas (uploads, processNotes, quizMe) are added in later tasks.
 */
export class StudySnapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StudySnapStackProps) {
    super(scope, id, props);

    // ---- Data: single DynamoDB table ------------------------------------
    const table = new dynamodb.Table(this, 'StudySnapTable', {
      tableName: 'StudySnap',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // hackathon: tear down cleanly
    });

    // ---- Storage: uploads bucket ----------------------------------------
    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // hackathon convenience
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'], // tightened to the Amplify domain in a later task
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
    });

    // ---- Auth: Cognito User Pool ----------------------------------------
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'studysnap-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      // userSrp: browser flow via Amplify Authenticator.
      // adminUserPassword: server-side flow for automated end-to-end auth tests.
      authFlows: { userSrp: true, adminUserPassword: true },
      preventUserExistenceErrors: true,
    });

    // ---- API Gateway (REST) ---------------------------------------------
    const api = new apigateway.RestApi(this, 'StudySnapApi', {
      restApiName: 'studysnap-api',
      description: 'StudySnap REST API',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // tightened later to Amplify domain
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // ---- Cognito authorizer (protects /uploads*) ------------------------
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // Shared env + a helper to keep feature Lambdas consistent.
    const commonEnv = {
      TABLE_NAME: table.tableName,
      UPLOADS_BUCKET: uploadsBucket.bucketName,
      AI_MODEL_ID: props.aiModelId,
      QUIZ_MODEL_ID: props.quizModelId,
    };
    const makeLogGroup = (name: string) =>
      new logs.LogGroup(this, `${name}LogGroup`, {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    // ---- /health Lambda (public, no auth) -------------------------------
    const healthLogGroup = new logs.LogGroup(this, 'HealthFnLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const healthFn = new lambdaNode.NodejsFunction(this, 'HealthFn', {
      entry: path.join(__dirname, '..', '..', 'services', 'src', 'health.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      logGroup: healthLogGroup,
      environment: {
        AI_MODEL_ID: props.aiModelId,
        TABLE_NAME: table.tableName,
      },
    });

    api.root.addResource('health').addMethod('GET', new apigateway.LambdaIntegration(healthFn));

    // ---- /uploads (auth-gated) ------------------------------------------
    const listUploadsFn = new lambdaNode.NodejsFunction(this, 'ListUploadsFn', {
      entry: path.join(__dirname, '..', '..', 'services', 'src', 'listUploads.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logGroup: makeLogGroup('ListUploadsFn'),
      environment: commonEnv,
    });
    table.grantReadData(listUploadsFn);

    const getUploadUrlFn = new lambdaNode.NodejsFunction(this, 'GetUploadUrlFn', {
      entry: path.join(__dirname, '..', '..', 'services', 'src', 'getUploadUrl.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logGroup: makeLogGroup('GetUploadUrlFn'),
      environment: commonEnv,
    });
    table.grantWriteData(getUploadUrlFn);
    uploadsBucket.grantPut(getUploadUrlFn);

    const uploads = api.root.addResource('uploads');
    const cognitoAuth = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };
    uploads.addMethod('GET', new apigateway.LambdaIntegration(listUploadsFn), cognitoAuth);
    uploads.addMethod('POST', new apigateway.LambdaIntegration(getUploadUrlFn), cognitoAuth);

    // GET /uploads/{uploadId}
    const getUploadFn = new lambdaNode.NodejsFunction(this, 'GetUploadFn', {
      entry: path.join(__dirname, '..', '..', 'services', 'src', 'getUpload.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logGroup: makeLogGroup('GetUploadFn'),
      environment: commonEnv,
    });
    table.grantReadData(getUploadFn);
    const uploadItem = uploads.addResource('{uploadId}');
    uploadItem.addMethod('GET', new apigateway.LambdaIntegration(getUploadFn), cognitoAuth);

    // ---- processNotes: S3-trigger -> Bedrock -> DynamoDB ----------------
    const processNotesFn = new lambdaNode.NodejsFunction(this, 'ProcessNotesFn', {
      entry: path.join(__dirname, '..', '..', 'services', 'src', 'processNotes.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 1024, // headroom for PDF parsing + base64 image
      timeout: cdk.Duration.minutes(2),
      logGroup: makeLogGroup('ProcessNotesFn'),
      environment: commonEnv,
      bundling: {
        // unpdf ships an ESM pdf.js build; keep it external and installed in the bundle.
        nodeModules: ['unpdf'],
      },
    });
    table.grantWriteData(processNotesFn);
    uploadsBucket.grantRead(processNotesFn);

    // Bedrock: allow InvokeModel on the primary (Amazon Nova) + Claude fallback,
    // on BOTH the inference-profile ARNs and the underlying foundation-model ARNs
    // (cross-region inference profiles require both).
    const usRegions = ['us-east-1', 'us-east-2', 'us-west-2'];
    const bedrockResources: string[] = [];
    const addModel = (vendor: string, slug: string) => {
      bedrockResources.push(
        `arn:aws:bedrock:*:${this.account}:inference-profile/us.${vendor}.${slug}`,
      );
      for (const r of usRegions) {
        bedrockResources.push(`arn:aws:bedrock:${r}::foundation-model/${vendor}.${slug}`);
      }
    };
    // Primary: Amazon Nova (Lite + Pro for the Quiz-Me path option).
    addModel('amazon', 'nova-lite-v1:0');
    addModel('amazon', 'nova-pro-v1:0');
    // Fallback: Anthropic Claude (kept so an env flip needs no IAM redeploy).
    addModel('anthropic', 'claude-haiku-4-5-20251001-v1:0');
    addModel('anthropic', 'claude-sonnet-4-5-20250929-v1:0');

    const bedrockPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: bedrockResources,
    });
    processNotesFn.addToRolePolicy(bedrockPolicy);

    // Trigger processNotes when a file is uploaded under uploads/.
    uploadsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processNotesFn),
      { prefix: 'uploads/' },
    );

    // ---- Quiz-Me: adaptive session (POST /uploads/{id}/quiz-me) ---------
    const quizMeFn = new lambdaNode.NodejsFunction(this, 'QuizMeFn', {
      entry: path.join(__dirname, '..', '..', 'services', 'src', 'quizMe.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup: makeLogGroup('QuizMeFn'),
      environment: commonEnv,
    });
    table.grantReadWriteData(quizMeFn);
    quizMeFn.addToRolePolicy(bedrockPolicy);

    const quizMe = uploadItem.addResource('quiz-me');
    quizMe.addMethod('POST', new apigateway.LambdaIntegration(quizMeFn), cognitoAuth);

    // ---- $20 billing alarm ----------------------------------------------
    const billingTopic = new sns.Topic(this, 'BillingAlarmTopic', {
      displayName: 'StudySnap billing alarm',
    });
    if (props.alarmEmail) {
      billingTopic.addSubscription(new snsSubs.EmailSubscription(props.alarmEmail));
    }

    // EstimatedCharges is published only in us-east-1.
    const billingMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: { Currency: 'USD' },
      statistic: 'Maximum',
      period: cdk.Duration.hours(6),
      region: 'us-east-1',
    });

    const billingAlarm = new cloudwatch.Alarm(this, 'BillingAlarm20USD', {
      alarmName: 'StudySnap-Billing-Over-20USD',
      alarmDescription: 'StudySnap estimated charges exceeded $20 USD',
      metric: billingMetric,
      threshold: 20,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    billingAlarm.addAlarmAction(new cwActions.SnsAction(billingTopic));

    // ---- Outputs --------------------------------------------------------
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url, description: 'REST API base URL' });
    new cdk.CfnOutput(this, 'HealthUrl', { value: `${api.url}health`, description: 'Health check' });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UploadsBucketName', { value: uploadsBucket.bucketName });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'Region', { value: this.region });
  }
}
