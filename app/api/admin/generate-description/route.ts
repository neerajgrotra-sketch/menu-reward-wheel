import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let itemName: string;
  let tags: string;
  let restaurantName: string;
  let categoryName: string;
  try {
    const body = await request.json();
    itemName = (body.itemName ?? '').trim();
    tags = (body.tags ?? '').trim();
    restaurantName = (body.restaurantName ?? '').trim();
    categoryName = (body.categoryName ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!itemName) {
    return NextResponse.json({ error: 'itemName is required.' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI generation is not configured.' }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const contextParts: string[] = [];
  if (restaurantName) contextParts.push(`Restaurant: ${restaurantName}`);
  if (categoryName) contextParts.push(`Menu category: ${categoryName}`);
  if (tags) contextParts.push(`Item tags: ${tags}`);
  const contextBlock = contextParts.length > 0 ? `\nContext:\n${contextParts.join('\n')}` : '';

  const prompt = `Write a concise, appetizing menu description for "${itemName}".${contextBlock}

Rules:
- 1–2 sentences, under 300 characters total
- Premium but natural tone — evocative and inviting, not over-the-top
- Describe flavour, texture, or cooking method only if clearly implied by the dish name or tags
- Do NOT claim homemade, fresh, or organic unless explicitly stated in the tags
- Do NOT mention allergens or ingredients not evident from the name or tags
- Do NOT include prices, discounts, or promotional language
- Return only the description text — no quotes, no labels, no preamble`;

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  const raw = block.type === 'text' ? block.text.trim() : '';
  const description = raw.slice(0, 300);

  return NextResponse.json({ description });
}
