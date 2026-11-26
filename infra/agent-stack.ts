import { fileURLToPath } from 'node:url';
import { ArnFormat, CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { AgentRuntimeArtifact, ProtocolType, Runtime, RuntimeAuthorizerConfiguration, RuntimeNetworkConfiguration } from 'aws-cdk-lib/aws-bedrockagentcore';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { DEFAULT_MODEL_ID, DEFAULT_REGION } from '../agent/runtime.js';

export interface AgentStackProps extends StackProps {
  readonly modelId?: string;
  readonly modelRegion?: string;
  /** Exact backing foundation-model ARNs in every destination Region; no AWS lookups. */
  readonly inferenceProfileModelArns?: string[];
}

export class AgentStack extends Stack {
  readonly runtime: Runtime;

  constructor(scope: Construct, id: string, props: AgentStackProps = {}) {
    super(scope, id, props);
    const modelId = props.modelId ?? DEFAULT_MODEL_ID;
    const region = props.modelRegion ?? DEFAULT_REGION;
    const profileArn = /^arn:[a-z-]+:bedrock:[a-z0-9-]+:\d{12}:(?:application-)?inference-profile\/[a-zA-Z0-9_.:-]+$/.test(modelId);
    const profileId = /^(us|eu|apac|ca|global)\.[a-zA-Z0-9_.:-]+$/.test(modelId);
    const isProfile = profileArn || profileId;
    if (!isProfile && !/^[a-z0-9-]+\.[a-zA-Z0-9_.:-]+$/.test(modelId)) throw new Error('modelId must be an exact Bedrock model ID or inference profile ARN');
    if (isProfile && (!props.inferenceProfileModelArns?.length || props.inferenceProfileModelArns.some((arn) => !/^arn:[a-z-]+:bedrock:[a-z0-9-]*::foundation-model\/[a-zA-Z0-9_.:-]+$/.test(arn)))) {
      throw new Error('Inference profiles require exact inferenceProfileModelArns for every backing Region');
    }
    this.runtime = new Runtime(this, 'Runtime', {
      agentRuntimeArtifact: AgentRuntimeArtifact.fromAsset(fileURLToPath(new URL('..', import.meta.url)), {
        file: 'agent/Dockerfile',
        platform: Platform.LINUX_ARM64,
        exclude: ['node_modules', '.git', 'build', 'dist', 'cdk.out', 'cdk.out.*', '.env', '.env.*', '**/.env', '**/.env.*', '.aws', '**/.aws', 'coverage', 'playwright-report', 'test-results'],
      }),
      networkConfiguration: RuntimeNetworkConfiguration.usingPublicNetwork(),
      authorizerConfiguration: RuntimeAuthorizerConfiguration.usingIAM(),
      protocolConfiguration: ProtocolType.HTTP,
      environmentVariables: {
        AWS_REGION: region,
        BEDROCK_MODEL_ID: modelId,
      },
    });
    const actions = ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'];
    if (isProfile) {
      const arn = profileArn ? modelId : this.formatArn({ service: 'bedrock', region, resource: 'inference-profile', resourceName: modelId, arnFormat: ArnFormat.SLASH_RESOURCE_NAME });
      this.runtime.addToRolePolicy(new PolicyStatement({ actions, resources: [arn] }));
      this.runtime.addToRolePolicy(new PolicyStatement({ actions, resources: props.inferenceProfileModelArns, conditions: { StringEquals: { 'bedrock:InferenceProfileArn': arn } } }));
    } else {
      this.runtime.addToRolePolicy(new PolicyStatement({ actions, resources: [this.formatArn({ service: 'bedrock', region, account: '', resource: 'foundation-model', resourceName: modelId, arnFormat: ArnFormat.SLASH_RESOURCE_NAME })] }));
    }
    new CfnOutput(this, 'RuntimeArn', { value: this.runtime.agentRuntimeArn });
    new CfnOutput(this, 'CallerPolicy', {
      description: 'Attach this policy to the server-side caller, not the browser',
      value: this.toJsonString({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Action: 'bedrock-agentcore:InvokeAgentRuntime', Resource: [this.runtime.agentRuntimeArn, `${this.runtime.agentRuntimeArn}/runtime-endpoint/DEFAULT`] }],
      }),
    });
  }
}
