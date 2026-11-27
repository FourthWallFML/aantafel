import { Ingredient } from '../types';

const DUTCH_ABBREVIATIONS = new Set([
  'ca.',
  'bijv.',
  'bv.',
  'min.',
  'max.',
  'ong.',
  'evt.',
  'enz.',
  'dr.',
  'mr.',
  'st.',
  'el.',
  'tl.',
  'gr.',
  'kg.',
  'ml.',
  'dl.',
  'cl.',
  'blz.',
  'pag.',
  'nr.',
]);

/**
 * Splits a cooking step into its bold first sentence and the regular-weight remainder.
 * Handles Dutch abbreviations (bijv., ca., min., el.) and decimal numbers (2.5) without false splits.
 */
export function splitFirstSentence(stepText: string): {
  firstSentence: string;
  rest: string;
} {
  const trimmed = (stepText || '').trim();
  if (!trimmed) {
    return { firstSentence: '', rest: '' };
  }

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    // Treat an explicit newline as a sentence/heading boundary
    if (ch === '\n') {
      const first = trimmed.slice(0, i).trim();
      const rest = trimmed.slice(i + 1).trim();
      if (first) {
        return { firstSentence: first, rest };
      }
    }

    if (ch === '.' || ch === '!' || ch === '?') {
      const prev = i > 0 ? trimmed[i - 1] : '';
      const next = i + 1 < trimmed.length ? trimmed[i + 1] : '';

      // Skip decimal numbers like 2.5 or 1.2
      if (ch === '.' && /\d/.test(prev) && /\d/.test(next)) {
        continue;
      }

      // Skip ellipsis "..."
      if (ch === '.' && next === '.') {
        continue;
      }

      // Consume any closing quote or parenthesis right after punctuation
      let endIdx = i + 1;
      while (endIdx < trimmed.length && /["'”’»)]/.test(trimmed[endIdx])) {
        endIdx++;
      }

      // Must be followed by whitespace or end-of-string
      if (endIdx < trimmed.length && !/\s/.test(trimmed[endIdx])) {
        continue;
      }

      // Skip common Dutch abbreviations (e.g. "ca.", "bijv.", "min.")
      if (ch === '.') {
        const beforeTokenMatch = trimmed.slice(0, i + 1).match(/([a-zA-ZÀ-ÿ]+\.)$/);
        if (beforeTokenMatch && DUTCH_ABBREVIATIONS.has(beforeTokenMatch[1].toLowerCase())) {
          continue;
        }
      }

      const firstSentence = trimmed.slice(0, endIdx).trim();
      const rest = trimmed.slice(endIdx).trim();
      return { firstSentence, rest };
    }
  }

  // Single sentence without terminal punctuation
  return { firstSentence: trimmed, rest: '' };
}

export function isStepOptional(
  optionalStepIndices: number[] | undefined,
  stepIndex: number
): boolean {
  return Array.isArray(optionalStepIndices) && optionalStepIndices.includes(stepIndex);
}

export function formatIngredientParts(
  ing: Ingredient,
  scaledAmount?: string
): {
  boldPart: string;
  prepPart: string;
  optional: boolean;
} {
  const amountStr = (scaledAmount !== undefined ? scaledAmount : ing.amount || '').trim();
  const unitStr = (ing.unit || '').trim();
  const nameStr = (ing.name || '').trim();
  const prepPart = (ing.preparation || '').trim();
  const qtyStr = [amountStr, unitStr].filter(Boolean).join(' ');
  const boldBase = [qtyStr, nameStr].filter(Boolean).join(' ');
  const boldPart = prepPart ? `${boldBase},` : boldBase;

  return {
    boldPart,
    prepPart,
    optional: Boolean(ing.optional),
  };
}
