// Shared assertion helpers — every adapter's `assert()`/`assertAfterAction()`
// returns AssertionResult[] built from these, so failures read consistently
// regardless of which capability produced them.

import type { AssertionResult } from './types';

export function assertEqual(actual: unknown, expected: unknown, label: string): AssertionResult {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    pass,
    message: pass ? `${label}: ${JSON.stringify(actual)}` : `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  };
}

export function assertContains(actual: string | undefined | null, needle: string, label: string): AssertionResult {
  const pass = typeof actual === 'string' && actual.includes(needle);
  return {
    pass,
    message: pass ? `${label}: contains "${needle}"` : `${label}: expected to contain "${needle}", got ${JSON.stringify(actual)}`,
  };
}

export function assertContainsAll(actual: string | undefined | null, needles: string[] | undefined, label: string): AssertionResult[] {
  if (!needles || needles.length === 0) return [];
  return needles.map((n) => assertContains(actual, n, label));
}

export function assertTrue(condition: boolean, message: string): AssertionResult {
  return { pass: condition, message };
}

export function assertArrayContainsAll(actual: string[] | undefined, expected: string[] | undefined, label: string): AssertionResult {
  if (!expected || expected.length === 0) return { pass: true, message: `${label}: no expectation given` };
  const actualSet = new Set(actual ?? []);
  const missing = expected.filter((e) => !actualSet.has(e));
  const pass = missing.length === 0;
  return {
    pass,
    message: pass ? `${label}: contains all of ${JSON.stringify(expected)}` : `${label}: missing ${JSON.stringify(missing)} from actual ${JSON.stringify(actual)}`,
  };
}
