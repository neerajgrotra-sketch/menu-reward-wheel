import type { IntelligenceProvider, ProviderRequest, ProviderResponse } from './provider.interface';

export class OpenAIProvider implements IntelligenceProvider {
  async generate(_request: ProviderRequest): Promise<ProviderResponse> {
    throw new Error(
      'OpenAI provider is not yet configured. Add OPENAI_API_KEY and install the openai package to enable.'
    );
  }
}
