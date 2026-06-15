export interface ProviderRequest {
  model: string;
  systemPrompt: string | null;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface ProviderResponse {
  output: string;
  inputTokens: number;
  outputTokens: number;
}

export interface IntelligenceProvider {
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}
