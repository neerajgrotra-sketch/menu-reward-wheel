import type { IntelligenceProvider, ProviderRequest, ProviderResponse } from './provider.interface';

export class GeminiProvider implements IntelligenceProvider {
  async generate(_request: ProviderRequest): Promise<ProviderResponse> {
    throw new Error(
      'Gemini provider is not yet configured. Add GEMINI_API_KEY and install the @google/generative-ai package to enable.'
    );
  }
}
