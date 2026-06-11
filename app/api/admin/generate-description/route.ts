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
  try {
    const body = await request.json();
    itemName = (body.itemName ?? '').trim();
    tags = (body.tags ?? '').trim();
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

  const tagLine = tags ? ` Tags: ${tags}.` : '';
  const prompt = `Write a 1–2 sentence appetizing menu description for "${itemName}".${tagLine} Be concise and vivid. Return only the description text, no quotes, no labels.`;

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  const description = block.type === 'text' ? block.text.trim() : '';

  return NextResponse.json({ description });
}
