import { describe, expect, it } from 'vitest';
import { getChatProviderConfig, getVisionProviderConfig } from './aiProvider';

describe('AI provider configuration', () => {
  it('prefers DeepSeek and applies its defaults', () => {
    expect(getChatProviderConfig({ DEEPSEEK_API_KEY: 'ds-test', OPENAI_API_KEY: 'oa-test' })).toEqual({
      name: 'deepseek',
      apiKey: 'ds-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    });
  });

  it('keeps the existing OpenAI-compatible text fallback', () => {
    expect(getChatProviderConfig({ OPENAI_API_KEY: 'oa-test', OPENAI_MODEL: 'custom-model' })).toEqual({
      name: 'openai',
      apiKey: 'oa-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'custom-model',
    });
  });

  it('does not treat a DeepSeek text key as vision capability', () => {
    expect(getVisionProviderConfig({ DEEPSEEK_API_KEY: 'ds-test' })).toBeNull();
    expect(getVisionProviderConfig({ VISION_API_KEY: 'vision-test', VISION_MODEL: 'vision-model' })).toEqual({
      apiKey: 'vision-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'vision-model',
    });
  });
});
