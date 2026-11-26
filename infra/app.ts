import { pathToFileURL } from 'node:url';
import { App } from 'aws-cdk-lib';
import { AgentStack } from './agent-stack';
import { resolveModelConfig, type ModelEnvironment } from '../shared/model-config';

export function createCdkApp(env: ModelEnvironment = process.env): App {
  const app = new App();
  const { region, modelId } = resolveModelConfig(env);
  new AgentStack(app, 'AgentStack', {
    env: { region }, // Account remains a token: synth requires no credentials or lookups.
    modelRegion: region,
    modelId,
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createCdkApp().synth();
}
