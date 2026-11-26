export const DEFAULT_MODEL_ID = "amazon.nova-lite-v1:0";
export const DEFAULT_REGION = "us-east-1";

export interface ModelConfig {
  region: string;
  modelId: string;
}

export interface ModelEnvironment {
  AWS_REGION?: string;
  BEDROCK_MODEL_ID?: string;
}

export function resolveModelConfig(env: ModelEnvironment = process.env): ModelConfig {
  return {
    region: env.AWS_REGION ?? DEFAULT_REGION,
    modelId: env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID,
  };
}
