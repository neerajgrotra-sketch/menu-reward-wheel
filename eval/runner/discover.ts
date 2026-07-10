// Auto-discovery of golden conversation files — the mechanism that makes
// "every future capability automatically adds its own evaluation suite"
// real. Drop a `*.golden.ts` file (exporting `conversation:
// GoldenConversation`) anywhere under eval/conversations/, and it's picked
// up here with zero runner code changes. Only the CAPABILITY EXECUTION
// ADAPTER (eval/runner/adapters/*.ts, registered in replay.ts) is a manual,
// one-entry-per-capability registration — matching CAPABILITY_REGISTRY's
// and TOOL_REGISTRY's own convention, since *how* to run and assert a turn
// is unavoidably capability-specific.

import { readdirSync } from 'fs';
import { join } from 'path';
import type { GoldenConversation } from './types';

const CONVERSATIONS_DIR = join(__dirname, '..', 'conversations');

function findGoldenFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findGoldenFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.golden.ts')) {
      files.push(full);
    }
  }
  return files;
}

export async function discoverGoldenConversations(): Promise<GoldenConversation[]> {
  const files = findGoldenFiles(CONVERSATIONS_DIR).sort();
  const conversations: GoldenConversation[] = [];
  for (const file of files) {
    const mod = (await import(file)) as { conversation?: GoldenConversation };
    if (!mod.conversation) {
      throw new Error(`${file} must export \`conversation: GoldenConversation\` — see eval/README.md.`);
    }
    conversations.push(mod.conversation);
  }
  return conversations;
}
