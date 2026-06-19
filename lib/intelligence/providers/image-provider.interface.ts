export interface ImageProviderRequest {
  prompt: string;
  count: number;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
}

export interface GeneratedImage {
  index: number;
  providerUrl: string;
  mimeType: string;
}

export interface ImageProviderResponse {
  images: GeneratedImage[];
  estimatedCostUsd: number;
}

export interface ImageIntelligenceProvider {
  generateImages(request: ImageProviderRequest): Promise<ImageProviderResponse>;
}
