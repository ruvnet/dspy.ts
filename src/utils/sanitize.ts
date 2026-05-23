/**
 * Input sanitization helpers for LLM prompt construction.
 *
 * LLM applications are susceptible to prompt injection: an adversary can
 * embed instructions in user-supplied content that override the system
 * instructions and redirect the model's behaviour. These helpers apply a
 * defence-in-depth strategy:
 *
 *  1. Length capping — truncate oversized inputs before they reach a prompt.
 *  2. Null-byte stripping — prevents smuggled control characters.
 *  3. Pattern-based injection stripping — removes common jailbreak phrases
 *     ("ignore all previous instructions", "act as …", SYSTEM/ASSISTANT role
 *     overrides, etc.) from free-text user values before they are embedded in
 *     a prompt template.
 *
 * These measures reduce risk; they are not a complete defence. Applications
 * should additionally use structured output formats (JSON), separate user
 * content from instructions with clear delimiters, and operate LLMs under
 * least-privilege system prompts.
 */

/** Maximum character length accepted from a single user-supplied string. */
const MAX_USER_INPUT_LENGTH = 4096;

/**
 * Common prompt-injection patterns to strip from user input.
 * The list targets the most prevalent jailbreak techniques observed in the
 * wild; it is not exhaustive.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Role / persona overrides
  /\b(ignore|disregard|forget|override)\s+(all\s+)?(previous|prior|above|earlier|system)\s+(instructions?|prompts?|rules?|directives?|context)\b/gi,
  /\bact\s+as\b/gi,
  /\byou\s+are\s+now\b/gi,
  /\bpretend\s+(to\s+be|you\s+are)\b/gi,
  /\brole\s*play\b/gi,
  /\bDAN\b/g,                              // "Do Anything Now" jailbreak

  // Explicit instruction injection delimiters
  /<<<.*?>>>/gs,
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /\bSYSTEM:/gi,
  /\bASSISTANT:/gi,
  /\bHUMAN:/gi,

  // Leakage / exfiltration attempts
  /\brepeat\s+(the\s+)?(above|system|full)\s+(prompt|instruction|text)\b/gi,
  /\bprint\s+(the\s+)?(above|system|full)\s+(prompt|instruction|text)\b/gi,
  /\bshow\s+(me\s+)?(your|the)\s+(system|full)\s+prompt\b/gi,
  /\bwhat\s+(are\s+)?(your|the)\s+(instructions?|system\s+prompt)\b/gi,
];

/**
 * Strip known prompt-injection patterns from a user-supplied string.
 * Returns the cleaned string.
 */
export function stripPromptInjection(value: string): string {
  let cleaned = value;
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[removed]');
  }
  return cleaned;
}

/**
 * Sanitize a user-supplied input string before it is embedded in an LLM
 * prompt:
 *
 *  - Removes null bytes.
 *  - Truncates to `maxLength` characters (default: 4096).
 *  - Strips known prompt-injection patterns.
 *
 * @param value     The raw user-supplied string.
 * @param maxLength Maximum allowed length (defaults to 4096).
 * @returns         The sanitized string.
 */
export function sanitizeUserInput(
  value: string,
  maxLength: number = MAX_USER_INPUT_LENGTH
): string {
  if (typeof value !== 'string') {
    return '';
  }

  // 1. Remove null bytes
  let sanitized = value.replace(/\0/g, '');

  // 2. Truncate
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  // 3. Strip injection patterns
  sanitized = stripPromptInjection(sanitized);

  return sanitized;
}
