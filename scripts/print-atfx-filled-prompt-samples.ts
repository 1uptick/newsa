/**
 * Prints filled ATFX system prompts (retail + institutional) for a sample topic.
 * Shows what the LLM receives after placeholder expansion (server/capitalKeywords.ts).
 *
 * Run: npx tsx scripts/print-atfx-filled-prompt-samples.ts
 */
import { ATFX_KEYWORD_SEO_PROMPT_TEMPLATE, fillAtfxKeywordSeoPromptTemplate } from "../server/capitalKeywords.js";

const sampleTopic = "Sample topic (replace with a real headline when testing)";

console.log("═".repeat(72));
console.log("ATFX prompt: template + fillAtfxKeywordSeoPromptTemplate() (see server/capitalKeywords.ts).");
console.log("═".repeat(72));
console.log("\n--- RETAIL (first 2500 chars of filled prompt) ---\n");
console.log(fillAtfxKeywordSeoPromptTemplate(ATFX_KEYWORD_SEO_PROMPT_TEMPLATE, "retail", sampleTopic).slice(0, 2500));
console.log("\n… [truncated]\n");
console.log("--- INSTITUTIONAL (first 2500 chars of filled prompt) ---\n");
console.log(fillAtfxKeywordSeoPromptTemplate(ATFX_KEYWORD_SEO_PROMPT_TEMPLATE, "institutional", sampleTopic).slice(0, 2500));
console.log("\n… [truncated]\n");
