import { pathToFileURL } from 'node:url';
import { App } from 'aws-cdk-lib';
import { AgentStack } from './agent-stack.js';
import { DEFAULT_MODEL_ID, DEFAULT_REGION } from '../agent/runtime.js';

export function createCdkApp(env: { AWS_REGION?: string; BEDROCK_MODEL_ID?: string } = process.env): App {
  const app = new App();
  const region = env.AWS_REGION ?? DEFAULT_REGION;
  new AgentStack(app, 'AgentStack', {
    env: { region }, // Account remains a token: synth requires no credentials or lookups.
    modelRegion: region,
    modelId: env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID,
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createCdkApp().synth();
}
