export interface BatchParseResult {
  prompts: string[];
  warnings: string[];
}

/**
 * Extract prompts wrapped in [square brackets] from raw text.
 * - matches are non-nesting: [ ... ] with no brackets inside
 * - empty/whitespace-only brackets are skipped and reported
 * - stray text or unmatched brackets outside matches are reported
 */
export function parseBracketPrompts(text: string): BatchParseResult {
  const prompts: string[] = [];
  const warnings: string[] = [];
  const re = /\[([^\[\]]*)\]/g;

  let match: RegExpExecArray | null;
  let matchCount = 0;
  let remainder = "";
  let lastEnd = 0;

  while ((match = re.exec(text)) !== null) {
    matchCount++;
    remainder += text.slice(lastEnd, match.index);
    lastEnd = match.index + match[0].length;
    const inner = match[1].replace(/\s+/g, " ").trim();
    if (inner.length === 0) {
      warnings.push(`Bracket pair #${matchCount} is empty — skipped.`);
    } else {
      prompts.push(inner);
    }
  }
  remainder += text.slice(lastEnd);

  if (matchCount === 0 && text.trim().length > 0) {
    warnings.push(
      "No [bracketed] prompts found. Wrap each prompt in square brackets, e.g. [a red dragon].",
    );
  }

  const unmatched = (remainder.match(/[\[\]]/g) ?? []).length;
  if (unmatched > 0) {
    warnings.push(
      `${unmatched} unmatched bracket${unmatched > 1 ? "s" : ""} found outside complete [...] pairs — text around them was ignored.`,
    );
  }

  const stray = remainder.replace(/[\[\]]/g, "").trim();
  if (stray.length > 0) {
    const snippet = stray.length > 60 ? stray.slice(0, 60) + "…" : stray;
    warnings.push(`Ignored text outside brackets: "${snippet}"`);
  }

  return { prompts, warnings };
}
