import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

describe('AgentCore infrastructure', () => {
  it('creates a region-configured CDK app without account lookups', async () => {
    const { createCdkApp } = await import('../infra/app');
    const { AgentStack } = await import('../infra/agent-stack');
    const app = createCdkApp({ AWS_REGION: 'us-west-2', BEDROCK_MODEL_ID: 'amazon.nova-micro-v1:0' });
    const stack = app.node.findChild('AgentStack');
    if (!(stack instanceof AgentStack)) throw new Error('Expected AgentStack');
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::BedrockAgentCore::Runtime', { EnvironmentVariables: { AWS_REGION: 'us-west-2', BEDROCK_MODEL_ID: 'amazon.nova-micro-v1:0' } });
    expect(app.node.tryGetContext('aws:cdk:version')).toBeUndefined();
    expect(stack.region).toBe('us-west-2');
  });

  it('synthesizes a public IAM-authenticated HTTP Runtime with a root Docker image asset', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    const app = new App();
    const stack = new AgentStack(app, 'TestAgent');
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::BedrockAgentCore::Runtime', 1);
    template.hasResourceProperties('AWS::BedrockAgentCore::Runtime', {
      AgentRuntimeArtifact: { ContainerConfiguration: { ContainerUri: Match.anyValue() } },
      NetworkConfiguration: { NetworkMode: 'PUBLIC' },
      ProtocolConfiguration: 'HTTP',
      AuthorizerConfiguration: Match.absent(), // IAM is represented by omitting JWT configuration.
      EnvironmentVariables: { AWS_REGION: 'us-east-1', BEDROCK_MODEL_ID: 'amazon.nova-lite-v1:0' },
    });
  });

  it('preserves the existing Runtime and execution-role logical IDs', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    const template = Template.fromStack(new AgentStack(new App(), 'AgentStack'));
    expect(Object.keys(template.findResources('AWS::BedrockAgentCore::Runtime'))).toEqual(['Runtime99E3DDFA']);
    expect(Object.keys(template.findResources('AWS::IAM::Role'))).toEqual(['RuntimeExecutionRole304CF3D8']);
    expect(Object.keys(template.findResources('AWS::IAM::Policy'))).toEqual(['RuntimeExecutionRoleDefaultPolicy2B020CFC']);
    template.hasResourceProperties('AWS::BedrockAgentCore::Runtime', {
      AgentRuntimeName: 'AgentStackRuntime5437780A',
    });
  });

  it('stages an ARM64 root-context Docker artifact without local dependencies or secrets', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    const app = new App();
    new AgentStack(app, 'Asset');
    const assembly = app.synth();
    const manifest = JSON.parse(await readFile(join(assembly.directory, 'Asset.assets.json'), 'utf8'));
    const image = Object.values(manifest.dockerImages)[0] as { source: { directory: string; dockerFile: string; platform: string } };
    expect(image.source.platform).toBe('linux/arm64');
    expect(image.source.dockerFile).toBe('agent/Dockerfile');
    const root = join(assembly.directory, image.source.directory);
    await expect(access(join(root, 'package-lock.json'))).resolves.toBeUndefined();
    await expect(access(join(root, 'shared/chat.ts'))).resolves.toBeUndefined();
    await expect(access(join(root, 'shared/model-config.ts'))).resolves.toBeUndefined();
    await expect(access(join(root, 'agent/server.ts'))).resolves.toBeUndefined();
    for (const excluded of ['node_modules', '.git', '.aws', '.env', 'build', 'dist', 'cdk.out']) {
      await expect(access(join(root, excluded))).rejects.toThrow();
    }
  });

  it('allows only the selected foundation model for inference', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    const stack = new AgentStack(new App(), 'Permissions');
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([{
        Effect: 'Allow',
        Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        Resource: { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0']] },
      }]) },
    });
  });

  it('outputs the Runtime ARN and a caller-scoped InvokeAgentRuntime policy', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    const stack = new AgentStack(new App(), 'Outputs');
    const template = Template.fromStack(stack);
    template.hasOutput('RuntimeArn', { Value: Match.anyValue() });
    template.hasOutput('CallerPolicy', { Value: Match.anyValue() });
    const policyOutput = JSON.stringify(template.toJSON().Outputs.CallerPolicy);
    expect(policyOutput).toContain('bedrock-agentcore:InvokeAgentRuntime');
    expect(policyOutput).toContain('runtime-endpoint/DEFAULT');
  });

  it('scopes inference profiles to explicitly supplied backing model ARNs', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    const backing = ['arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0', 'arn:aws:bedrock:us-west-2::foundation-model/amazon.nova-lite-v1:0'];
    const stack = new AgentStack(new App(), 'Profile', {
      modelId: 'us.amazon.nova-lite-v1:0', inferenceProfileModelArns: backing,
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({
        Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        Resource: backing,
        Condition: { StringEquals: { 'bedrock:InferenceProfileArn': Match.anyValue() } },
      })]) },
    });
    expect(JSON.stringify(template.toJSON())).toContain('inference-profile/us.amazon.nova-lite-v1:0');
  });

  it('fails closed for inference profiles without explicit backing models', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    expect(() => new AgentStack(new App(), 'MissingBacking', { modelId: 'us.amazon.nova-lite-v1:0' })).toThrow('inferenceProfileModelArns');
  });

  it('rejects backing model ARNs without a destination Region', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    expect(() => new AgentStack(new App(), 'MissingRegion', {
      modelId: 'us.amazon.nova-lite-v1:0',
      inferenceProfileModelArns: ['arn:aws:bedrock:::foundation-model/amazon.nova-lite-v1:0'],
    })).toThrow('inferenceProfileModelArns');
  });

  it('rejects wildcard model grants', async () => {
    const { AgentStack } = await import('../infra/agent-stack');
    expect(() => new AgentStack(new App(), 'Wildcard', { modelId: 'amazon.*' })).toThrow('modelId');
  });
});

describe('Agent container', () => {
  it('runs compiled ESM on Node 22 as non-root using explicitly copied files', async () => {
    const docker = await readFile(new URL('../agent/Dockerfile', import.meta.url), 'utf8');
    expect(docker).toContain('FROM node:22-bookworm-slim AS build');
    expect(docker).toContain('COPY package.json package-lock.json');
    expect(docker).toContain('COPY shared/ ./shared/');
    expect(docker).toContain('tsc -p agent/tsconfig.json');
    expect(docker).toContain('USER node');
    expect(docker).toContain('EXPOSE 8080');
    expect(docker).toContain('CMD ["node", "dist/agent/server.js"]');
    expect(docker).not.toMatch(/COPY\s+\.\s/);
  });
});
