export class ValidationError extends Error {
  constructor(featureKey: string, reason: string) {
    super(`Output validation failed for '${featureKey}': ${reason}`);
    this.name = 'ValidationError';
  }
}

type OutputValidator = (output: string, featureKey: string) => string;

const VALIDATORS: Record<string, OutputValidator> = {
  menu_description_generation: (output, featureKey) => {
    const trimmed = output.trim();
    if (!trimmed) throw new ValidationError(featureKey, 'Output was empty.');
    return trimmed.slice(0, 300);
  },
};

export function validate(featureKey: string, output: string): string {
  const validator = VALIDATORS[featureKey];
  if (!validator) return output.trim();
  return validator(output, featureKey);
}
