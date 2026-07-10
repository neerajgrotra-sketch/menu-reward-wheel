// Tier 2 — live model validation. SCAFFOLDING ONLY: this proves the
// skip-gracefully behavior (the exact situation THIS repo's dev environment
// is in right now — neither key configured) and marks the seam where a real
// capture implementation goes. It does not yet make a real Anthropic call.
//
// Intended shape once implemented (see eval/README.md's runbook):
//   1. For each golden conversation, re-run its turns' userMessage through
//      the real runPlannerTurn() (lib/restaurant-planner/planner-engine.ts)
//      against whatever dashboard_assistant prompt is currently active.
//   2. Write the fresh raw output to a gitignored scratch file
//      (eval/live/.captures/, never committed) — NOT into the golden file.
//   3. A human reviews the diff between the fresh output and the existing
//      recordedPlannerOutputRaw and, only if it's correct, manually updates
//      the .golden.ts file's recordedSource to 'captured'.
// Never auto-promote: a capture that runs without erroring is not the same
// as a capture that's correct.

import { describe, it } from 'vitest';

const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
const canRunLive = hasAnthropicKey && hasServiceRoleKey;

function missingKeysMessage(): string {
  const missing = [!hasAnthropicKey && 'ANTHROPIC_API_KEY', !hasServiceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
  return `skipped — missing ${missing.join(' and ')}`;
}

describe('Tier 2 — live model validation (capture mode)', () => {
  it.skipIf(!canRunLive)(canRunLive ? 're-sends golden conversation turns to the live model and reports drift' : missingKeysMessage(), async () => {
    throw new Error(
      'Live capture is not yet implemented — this file is Phase 4 scaffolding proving the skip-gracefully behavior. See eval/README.md for the intended capture-then-promote workflow.',
    );
  });
});
