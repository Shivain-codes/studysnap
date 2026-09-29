import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GithubOidcStackProps extends cdk.StackProps {
  /** GitHub org/user that owns the repo, e.g. "Shivain-codes". */
  readonly githubOwner: string;
  /** Repository name, e.g. "studysnap". */
  readonly githubRepo: string;
}

/**
 * Creates (or reuses) the GitHub Actions OIDC identity provider and a deploy
 * role that only the given repo's workflows can assume — no long-lived secrets.
 * The role can deploy the StudySnap CDK stack and trigger Amplify deployments.
 */
export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const subject = `repo:${props.githubOwner}/${props.githubRepo}:*`;

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'studysnap-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': subject,
        },
      }),
      description: 'GitHub Actions deploy role for StudySnap (OIDC)',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Permissions to run `cdk deploy` (assume the CDK bootstrap roles) and
    // trigger Amplify frontend deployments.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AmplifyDeploy',
        actions: [
          'amplify:CreateDeployment',
          'amplify:StartDeployment',
          'amplify:GetJob',
          'amplify:GetApp',
          'amplify:GetBranch',
        ],
        resources: ['*'],
      }),
    );
    // Read CloudFormation state (cdk diff/deploy inspects stacks).
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CfnRead',
        actions: ['cloudformation:DescribeStacks', 'cloudformation:GetTemplate'],
        resources: ['*'],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Set this as the GitHub repo variable AWS_DEPLOY_ROLE_ARN',
    });
  }
}
