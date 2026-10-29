export type AiProviderName = 'deepseek' | 'openai';

export interface AiProviderConfig {
  name: AiProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type VisionProviderConfig = Omit<AiProviderConfig, 'name'>;

type Env = Record<string, string | undefined>;

export function getChatProviderConfig(env: Env = process.env): AiProviderConfig | null {
  const deepseekKey = env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    const baseUrl = env.DEEPSEEK_BASE_URL?.trim();
    const model = env.DEEPSEEK_MODEL?.trim();
    return {
      name: 'deepseek',
      apiKey: deepseekKey,
      baseUrl: (baseUrl || 'https://api.deepseek.com').replace(/\/+$/, ''),
      model: model || 'deepseek-chat',
    };
  }

  const openAiKey = env.OPENAI_API_KEY?.trim();
  if (!openAiKey) return null;
  const baseUrl = env.OPENAI_BASE_URL?.trim();
  const model = env.OPENAI_MODEL?.trim();
  return {
    name: 'openai',
    apiKey: openAiKey,
    baseUrl: (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: model || 'gpt-4o-mini',
  };
}

export function getVisionProviderConfig(env: Env = process.env): VisionProviderConfig | null {
  const visionKey = env.VISION_API_KEY?.trim();
  const apiKey = visionKey || env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = env.VISION_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim();
  const model = env.VISION_MODEL?.trim() || env.OPENAI_MODEL?.trim();
  return {
    apiKey,
    baseUrl: (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: model || 'gpt-4o-mini',
  };
}
