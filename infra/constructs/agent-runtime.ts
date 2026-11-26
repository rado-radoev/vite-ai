import { fileURLToPath } from 'node:url';
import { ArnFormat, Stack } from 'aws-cdk-lib';
import {
  AgentRuntimeArtifact,
  ProtocolType,
  Runtime,
  RuntimeAuthorizerConfiguration,
  RuntimeNetworkConfiguration,
} from 'aws-cdk-lib/aws-bedrockagentcore';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import type { ModelConfig } from '../../shared/model-config';

export interface AgentRuntimeProps {
  readonly model: ModelConfig;
  /** Exact backing foundation-model ARNs in every destination Region; no AWS lookups. */
  readonly inferenceProfileModelArns?: string[];
}

/** The Docker runtime and its execution/caller permissions, without application state. */
export class AgentRuntime extends Construct {
  readonly runtime: Runtime;
  readonly callerPolicy: PolicyDocument;

  constructor(scope: Construct, id: string, props: AgentRuntimeProps) {
    super(scope, id);
    const { region, modelId } = props.model;
    const profileArn = /^arn:[a-z-]+:bedrock:[a-z0-9-]+:\d{12}:(?:application-)?inference-profile\/[a-zA-Z0-9_.:-]+$/.test(modelId);
    const profileId = /^(us|eu|apac|ca|global)\.[a-zA-Z0-9_.:-]+$/.test(modelId);
    const isProfile = profileArn || profileId;
    if (!isProfile && !/^[a-z0-9-]+\.[a-zA-Z0-9_.:-]+$/.test(modelId)) {
      throw new Error('modelId must be an exact Bedrock model ID or inference profile ARN');
    }
    const backingModelArns = props.inferenceProfileModelArns ?? [];
    if (isProfile && (!backingModelArns.length || backingModelArns.some((arn) => !/^arn:[a-z-]+:bedrock:[a-z0-9-]+::foundation-model\/[a-zA-Z0-9_.:-]+$/.test(arn)))) {
      throw new Error('Inference profiles require exact inferenceProfileModelArns for every backing Region');
    }

    // Default is omitted from CDK logical IDs, preserving the existing Runtime resources.
    this.runtime = new Runtime(this, 'Default', {
      agentRuntimeArtifact: AgentRuntimeArtifact.fromAsset(fileURLToPath(new URL('../..', import.meta.url)), {
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

    const stack = Stack.of(this);
    const actions = ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'];
    if (isProfile) {
      const arn = profileArn ? modelId : stack.formatArn({
        service: 'bedrock', region, resource: 'inference-profile', resourceName: modelId,
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      });
      this.runtime.addToRolePolicy(new PolicyStatement({ actions, resources: [arn] }));
      this.runtime.addToRolePolicy(new PolicyStatement({
        actions,
        resources: backingModelArns,
        conditions: { StringEquals: { 'bedrock:InferenceProfileArn': arn } },
      }));
    } else {
      const arn = stack.formatArn({
        service: 'bedrock', region, account: '', resource: 'foundation-model', resourceName: modelId,
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      });
      this.runtime.addToRolePolicy(new PolicyStatement({ actions, resources: [arn] }));
    }

    this.callerPolicy = new PolicyDocument({
      statements: [new PolicyStatement({
        actions: ['bedrock-agentcore:InvokeAgentRuntime'],
        resources: [this.runtime.agentRuntimeArn, `${this.runtime.agentRuntimeArn}/runtime-endpoint/DEFAULT`],
      })],
    });
  }
}
