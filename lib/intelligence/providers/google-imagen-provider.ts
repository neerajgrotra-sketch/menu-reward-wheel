import type {
  ImageIntelligenceProvider,
  ImageProviderRequest,
  ImageProviderResponse,
  GeneratedImage,
} from './image-provider.interface';

const COST_PER_IMAGE_USD = 0.02;
const VERTEX_API_VERSION = 'v1';

// Per-slot prompt suffixes that drive visual variation across the 4 variants.
// Index 0 = variant 1 (base prompt, no modification).
// Suffixes are appended with ", " so they read as natural comma-separated descriptors.
const VARIANT_SUFFIXES: readonly string[] = [
  '',
  ', premium restaurant plating, overhead photography',
  ', close-up food photography, cinematic lighting',
  ', food delivery app hero image style, premium presentation',
];

interface GeminiInlineData {
  data: string;
  mimeType: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
}

interface GeminiCandidate {
  content: { parts: GeminiPart[] };
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
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
    this.model = 'gemini-2.5-flash-image';

    console.log('[google-imagen-debug] env GOOGLE_CLOUD_PROJECT_ID:', this.projectId);
    console.log('[google-imagen-debug] env GOOGLE_CLOUD_LOCATION:', this.location);
  }

  async generateImages(request: ImageProviderRequest): Promise<ImageProviderResponse> {
    const count = Math.min(Math.max(request.count, 1), 4);

    // One token fetch shared across all parallel requests (valid 1 hr).
    const accessToken = await this.getAccessToken();

    const endpoint =
      `https://${this.location}-aiplatform.googleapis.com/${VERTEX_API_VERSION}` +
      `/projects/${this.projectId}/locations/${this.location}` +
      `/publishers/google/models/${this.model}:generateContent`;

    // Fire N independent single-image requests in parallel.
    // candidateCount > 1 is unsupported/unreliable on gemini-2.5-flash-image;
    // one request per variant is the only documented path to N images.
    const slots = Array.from({ length: count }, (_, i) => i + 1);
    const results = await Promise.allSettled(
      slots.map((variantIndex) => {
        const suffix = VARIANT_SUFFIXES[variantIndex - 1] ?? '';
        const prompt = suffix ? `${request.prompt}${suffix}` : request.prompt;
        return this.generateSingleImage(prompt, accessToken, endpoint, variantIndex);
      }),
    );

    const images: GeneratedImage[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        images.push(result.value);
      } else {
        console.error(
          `[google-imagen] variant ${i + 1}/${count} failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        );
      }
    }

    if (images.length === 0) {
      throw new Error(
        `All ${count} image generation requests failed. Check Gemini API quota and credentials.`,
      );
    }

    return {
      images,
      estimatedCostUsd: images.length * COST_PER_IMAGE_USD,
    };
  }

  private async generateSingleImage(
    prompt: string,
    accessToken: string,
    endpoint: string,
    variantIndex: number,
  ): Promise<GeneratedImage> {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    };

    console.log('[google-imagen-debug] endpoint:', endpoint);

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
      console.error('[google-imagen-debug] raw google response:', errorText);
      throw new Error(`Gemini image API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const imagePart = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData);

    if (!imagePart?.inlineData) {
      throw new Error(`Variant ${variantIndex}: no image data in Gemini response`);
    }

    return {
      index: variantIndex,
      providerUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      mimeType: imagePart.inlineData.mimeType,
    };
  }

  private async getAccessToken(): Promise<string> {
    const rawKey = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY!;

    let serviceAccount: {
      client_email: string;
      private_key: string;
      project_id?: string;
    };

    try {
      serviceAccount = JSON.parse(rawKey);
    } catch {
      throw new Error('GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY is not valid JSON.');
    }

    console.log('[google-imagen-debug] client_email:', serviceAccount.client_email);
    console.log('[google-imagen-debug] project_id_from_key:', serviceAccount.project_id);

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
    console.log('[google-imagen-debug] access token acquired');
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
