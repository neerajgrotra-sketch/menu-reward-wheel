import type {
  ImageIntelligenceProvider,
  ImageProviderRequest,
  ImageProviderResponse,
  GeneratedImage,
} from './image-provider.interface';

const COST_PER_IMAGE_USD = 0.055;
const REPLICATE_MODEL = 'black-forest-labs/flux-pro';
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 20;

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

export class ReplicateImageProvider implements ImageIntelligenceProvider {
  private readonly apiToken: string;

  constructor() {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('REPLICATE_API_TOKEN is not configured.');
    this.apiToken = token;
  }

  async generateImages(request: ImageProviderRequest): Promise<ImageProviderResponse> {
    const count = Math.min(Math.max(request.count, 1), 4);

    // Flux Pro does not support batch generation — run count predictions in parallel.
    const predictionPromises = Array.from({ length: count }, (_, i) =>
      this.runSinglePrediction(request.prompt, i + 1),
    );

    const results = await Promise.all(predictionPromises);

    const images: GeneratedImage[] = results.map((url, i) => ({
      index: i + 1,
      providerUrl: url,
      mimeType: 'image/webp',
    }));

    return {
      images,
      estimatedCostUsd: count * COST_PER_IMAGE_USD,
    };
  }

  private async runSinglePrediction(prompt: string, index: number): Promise<string> {
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: REPLICATE_MODEL,
        input: {
          prompt,
          aspect_ratio: '1:1',
          output_format: 'webp',
          output_quality: 90,
          safety_tolerance: 2,
        },
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text().catch(() => createResponse.statusText);
      throw new Error(`Replicate prediction create failed (variant ${index}): ${errorText}`);
    }

    const prediction = (await createResponse.json()) as ReplicatePrediction;

    return this.pollUntilComplete(prediction.id, index);
  }

  private async pollUntilComplete(predictionId: string, index: number): Promise<string> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: { Authorization: `Bearer ${this.apiToken}` },
        },
      );

      if (!pollResponse.ok) continue;

      const prediction = (await pollResponse.json()) as ReplicatePrediction;

      if (prediction.status === 'succeeded') {
        const output = prediction.output;
        const url = Array.isArray(output) ? output[0] : output;
        if (!url) throw new Error(`Replicate variant ${index}: succeeded but no output URL.`);
        return url as string;
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(
          `Replicate variant ${index} ${prediction.status}: ${prediction.error ?? 'unknown error'}`,
        );
      }
    }

    throw new Error(
      `Replicate variant ${index}: timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`,
    );
  }
}
