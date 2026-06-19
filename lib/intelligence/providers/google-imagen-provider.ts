import type {
  ImageIntelligenceProvider,
  ImageProviderRequest,
  ImageProviderResponse,
  GeneratedImage,
} from './image-provider.interface';

const COST_PER_IMAGE_USD = 0.02;
const IMAGEN_API_VERSION = 'v1';

interface VertexPrediction {
  bytesBase64Encoded: string;
  mimeType: string;
}

interface VertexResponse {
  predictions: VertexPrediction[];
}

export class GoogleImagenProvider implements ImageIntelligenceProvider {
  private readonly projectId: string;
  private readonly location: string;
  private readonly model: string;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';

    if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT_ID is not configured.');
    if (!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY) {
      throw new Error('GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY is not configured.');
    }

    this.projectId = projectId;
    this.location = location;
    this.model = 'imagegeneration@006';
  }

  async generateImages(request: ImageProviderRequest): Promise<ImageProviderResponse> {
    const count = Math.min(Math.max(request.count, 1), 4);
    const accessToken = await this.getAccessToken();

    const endpoint =
      `https://${this.location}-aiplatform.googleapis.com/${IMAGEN_API_VERSION}` +
      `/projects/${this.projectId}/locations/${this.location}` +
      `/publishers/google/models/${this.model}:predict`;

    const body = {
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: count,
        aspectRatio: '1:1',
        safetyFilterLevel: 'block_some',
        personGeneration: 'dont_allow',
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Imagen API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as VertexResponse;
    const predictions = data.predictions ?? [];

    const images: GeneratedImage[] = predictions.map((prediction, i) => ({
      index: i + 1,
      providerUrl: `data:${prediction.mimeType};base64,${prediction.bytesBase64Encoded}`,
      mimeType: prediction.mimeType,
    }));

    return {
      images,
      estimatedCostUsd: count * COST_PER_IMAGE_USD,
    };
  }

  private async getAccessToken(): Promise<string> {
    const rawKey = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY!;

    let serviceAccount: {
      client_email: string;
      private_key: string;
    };

    try {
      serviceAccount = JSON.parse(rawKey);
    } catch {
      throw new Error('GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY is not valid JSON.');
    }

    const scope = 'https://www.googleapis.com/auth/cloud-platform';
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope,
    };

    const jwt = await this.signJwt(header, payload, serviceAccount.private_key);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Google OAuth token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    return tokenData.access_token;
  }

  private async signJwt(
    header: Record<string, string>,
    payload: Record<string, unknown>,
    privateKeyPem: string,
  ): Promise<string> {
    const encode = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');

    const signingInput = `${encode(header)}.${encode(payload)}`;

    const pemBody = privateKeyPem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');

    const keyData = Buffer.from(pemBody, 'base64');

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      Buffer.from(signingInput),
    );

    const signatureB64 = Buffer.from(signature).toString('base64url');
    return `${signingInput}.${signatureB64}`;
  }
}
