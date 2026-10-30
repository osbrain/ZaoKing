import { describe, expect, it } from 'vitest';
import { getChatProviderConfig, getVisionProviderConfig } from '@/lib/aiProvider';

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
  });

  it('defaults a dedicated vision key to Qwen3-VL-Plus on Alibaba Cloud Model Studio', () => {
    expect(getVisionProviderConfig({ VISION_API_KEY: ' vision-test ' })).toEqual({
      apiKey: 'vision-test',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen3-vl-plus',
    });
  });

  it('allows a dedicated vision endpoint and model override', () => {
    expect(getVisionProviderConfig({
      VISION_API_KEY: 'vision-test',
      VISION_BASE_URL: 'https://vision.example/v1/',
      VISION_MODEL: 'vision-model',
    })).toEqual({
      apiKey: 'vision-test',
      baseUrl: 'https://vision.example/v1',
      model: 'vision-model',
    });
  });

  it('keeps the OpenAI vision fallback when no dedicated vision key is configured', () => {
    expect(getVisionProviderConfig({ OPENAI_API_KEY: 'oa-test' })).toEqual({
      apiKey: 'oa-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });
  });
});
