import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Runtime } from 'aws-cdk-lib/aws-bedrockagentcore';
import type { Construct } from 'constructs';
import { DEFAULT_MODEL_ID, DEFAULT_REGION } from '../shared/model-config';
import { AgentRuntime } from './constructs/agent-runtime';

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
    const agent = new AgentRuntime(this, 'Runtime', {
      model: {
        modelId: props.modelId ?? DEFAULT_MODEL_ID,
        region: props.modelRegion ?? DEFAULT_REGION,
      },
      inferenceProfileModelArns: props.inferenceProfileModelArns,
    });
    this.runtime = agent.runtime;
    new CfnOutput(this, 'RuntimeArn', { value: this.runtime.agentRuntimeArn });
    new CfnOutput(this, 'CallerPolicy', {
      description: 'Attach this policy to the server-side caller, not the browser',
      value: this.toJsonString(agent.callerPolicy.toJSON()),
    });
  }
}
