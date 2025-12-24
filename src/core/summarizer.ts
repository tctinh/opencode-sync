/**
 * Privacy-aware summarization prompts for session context export
 */

/**
 * System prompt for privacy-safe context summarization
 */
export const SUMMARIZER_SYSTEM_PROMPT = `You are a session context summarizer for OpenCode. Your task is to create a concise, privacy-safe summary of the current session that can be synced across devices.

## CRITICAL PRIVACY RULES

NEVER include in the summary:
- Code snippets or implementations (no actual code)
- API keys, tokens, passwords, or secrets
- Database connection strings or credentials
- Internal URLs, IP addresses, or infrastructure details
- Proprietary algorithms or business logic
- File contents or raw data
- Personal identifiable information (PII)
- Environment variables or config values

## WHAT TO CAPTURE

Instead, describe:
- General goals and objectives of the session
- High-level technical approaches and decisions made
- Key architectural or design choices
- Problems encountered and how they were conceptually resolved
- Current progress and next steps (in abstract terms)
- Technologies and patterns being used (names only)
- Important decisions and their rationale

## FORMAT

Structure your summary as:

### Session Goal
[1-2 sentences describing what the user is trying to accomplish]

### Progress Made
[Bullet points of key accomplishments, decisions, or milestones]

### Current State
[Brief description of where things stand]

### Next Steps
[What remains to be done, in abstract terms]

### Key Context
[Any important context needed to continue this work]

## GUIDELINES

- Keep the summary under 2000 words
- Use clear, professional language
- Focus on "what" and "why", not "how" (implementation details)
- Make it useful for resuming work on a different device
- Assume the reader has access to the codebase but not this session's history
`;

/**
 * User prompt template for summarization
 */
export function createSummarizationPrompt(
  userGuidance?: string,
  sessionTitle?: string,
  projectName?: string
): string {
  let prompt = `Please summarize this session for cross-device sync.`;
  
  if (sessionTitle) {
    prompt += `\n\nSession title: ${sessionTitle}`;
  }
  
  if (projectName) {
    prompt += `\nProject: ${projectName}`;
  }
  
  if (userGuidance) {
    prompt += `\n\nUser guidance: ${userGuidance}`;
  }
  
  prompt += `\n\nAnalyze our conversation and create a privacy-safe summary following the rules in the system prompt.`;
  
  return prompt;
}

/**
 * Validate summary doesn't contain obvious secrets
 */
export function validateSummary(summary: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check for potential secrets patterns
  const secretPatterns = [
    { pattern: /[a-zA-Z0-9_-]{20,}/, name: "potential token/key" },
    { pattern: /-----BEGIN [A-Z]+ KEY-----/, name: "private key" },
    { pattern: /mongodb(\+srv)?:\/\//, name: "MongoDB connection string" },
    { pattern: /postgres(ql)?:\/\//, name: "PostgreSQL connection string" },
    { pattern: /mysql:\/\//, name: "MySQL connection string" },
    { pattern: /redis:\/\//, name: "Redis connection string" },
    { pattern: /https?:\/\/[^\/]*:[^@\/]+@/, name: "URL with credentials" },
    { pattern: /password\s*[=:]\s*['"][^'"]+['"]/, name: "password assignment" },
    { pattern: /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/, name: "API key assignment" },
    { pattern: /secret\s*[=:]\s*['"][^'"]+['"]/, name: "secret assignment" },
  ];
  
  for (const { pattern, name } of secretPatterns) {
    if (pattern.test(summary)) {
      warnings.push(`Potential ${name} detected`);
    }
  }
  
  // Check for code blocks
  if (/```[\s\S]*```/.test(summary)) {
    warnings.push("Code blocks detected - consider removing implementation details");
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Generate auto name for context based on summary
 */
export function generateContextName(summary: string, sessionTitle?: string): string {
  if (sessionTitle && sessionTitle.length > 0 && sessionTitle.length < 50) {
    return sessionTitle;
  }
  
  // Try to extract goal from summary
  const goalMatch = summary.match(/### Session Goal\s*\n([^\n]+)/);
  if (goalMatch) {
    const goal = goalMatch[1].trim();
    if (goal.length < 60) {
      return goal;
    }
    return goal.substring(0, 57) + "...";
  }
  
  // Fallback to date-based name
  const now = new Date();
  return `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
