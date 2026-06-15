const VARIABLE_PATTERN = /\{\{([a-z_][a-z0-9_]*)\}\}/g;

export class UnresolvedVariableError extends Error {
  constructor(variables: string[]) {
    super(
      `Prompt template contains unresolved variables: {{${variables.join('}}, {{')}}}`
    );
    this.name = 'UnresolvedVariableError';
  }
}

export function renderPrompt(template: string, context: Record<string, string>): string {
  const allVariables: string[] = [];
  let match: RegExpExecArray | null;
  const scanPattern = new RegExp(VARIABLE_PATTERN.source, 'g');
  while ((match = scanPattern.exec(template)) !== null) {
    allVariables.push(match[1]);
  }
  const seen: Record<string, true> = {};
  const missing = allVariables.filter((v) => {
    if (seen[v]) return false;
    seen[v] = true;
    return !(v in context);
  });
  if (missing.length > 0) throw new UnresolvedVariableError(missing);

  return template.replace(VARIABLE_PATTERN, (_, key) => context[key]);
}
