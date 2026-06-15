import Anthropic from '@anthropic-ai/sdk';
import type { IntelligenceProvider, ProviderRequest, ProviderResponse } from './provider.interface';

export class AnthropicProvider implements IntelligenceProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
      messages: [{ role: 'user', content: request.userPrompt }],
    });

    const block = response.content[0];
    const output = block.type === 'text' ? block.text : '';

    return {
      output,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
