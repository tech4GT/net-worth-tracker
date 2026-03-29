/**
 * Anthropic API wrapper for AI-powered budget features.
 *
 * Uses the @anthropic-ai/sdk package with an API key from the
 * ANTHROPIC_API_KEY environment variable (set via SSM in CDK).
 *
 * Exports:
 *   - parseStatementWithAI(statementText, categories, learningExamples?)
 *   - validateCategoriesWithAI(categories)
 */

import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Module-level singleton client (reused across Lambda invocations)
// ---------------------------------------------------------------------------

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(statementText, categories, learningExamples) {
  const categoryList = categories
    .map((c) => {
      let s = `  - id: "${c.id}", name: "${c.name}"`;
      if (c.description) s += ` — ${c.description}`;
      return s;
    })
    .join('\n');

  // Build optional sections
  let learningSection = '';
  if (Array.isArray(learningExamples) && learningExamples.length > 0) {
    const exampleLines = learningExamples
      .map((ex) => {
        let s = `  - "${ex.pattern}" → ${ex.categoryName} (${ex.categoryId})`;
        const details = [];
        if (ex.amount) details.push(`amount: ${ex.amount}`);
        if (ex.originalLine) details.push(`raw: "${ex.originalLine}"`);
        if (details.length > 0) s += ` [${details.join(', ')}]`;
        return s;
      })
      .join('\n');
    learningSection = `
PREVIOUS CLASSIFICATIONS (learn from these — use the vendor name, location, amount range, and raw text patterns to classify similar transactions the same way):
${exampleLines}
`;
  }

  return `You are a bank statement parser. Your job is to extract individual spending transactions from a raw bank statement and categorize each one.

AVAILABLE BUDGET CATEGORIES:
${categoryList}
${learningSection}
RULES:
1. Include ALL transactions — spending, refunds, and income. Classify each with a "type" field:
   - "expense": normal spending/outflow (amount is positive)
   - "refund": money returned to the user (amount is positive — it will be subtracted from the category total)
   - "income": salary, wages, freelance, interest, dividends (amount is positive — goes into income tracking)
2. Skip transfers between own accounts, balance summaries, and fees that are internal bank charges.
3. The "amount" field must ALWAYS be a positive number.
4. Set "confidence" between 0.0 and 1.0 for how sure you are about the category assignment. Use confidence < 0.7 when unsure.
5. If a transaction does not fit any of the available categories, use "bcat-other" as the budgetCategoryId.
6. The "date" field must be in YYYY-MM-DD format. If the year is ambiguous, assume the current year.
7. The "description" field should be a cleaned-up, human-readable version of the original merchant/payee name.
8. The "originalLine" field should contain the original text from the statement for that transaction.
9. "detectedIncome" should be the total of all "income" type entries, or null if no income was detected.
10. Assign refunds to the same category as the original purchase (e.g., a grocery store refund → food category).
11. Parse common bank CSV formats — look for columns like date, description/payee/merchant, amount/debit/credit. Also handle plain-text statement formats.
12. Skip header rows, footer rows, balance summaries, and any non-transaction lines.

Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "cleaned description",
      "amount": 123.45,
      "type": "expense",
      "budgetCategoryId": "category-id-from-list",
      "confidence": 0.95,
      "originalLine": "original text from statement"
    }
  ],
  "detectedIncome": 10000
}

BANK STATEMENT TO PARSE:
${statementText}`;
}

// ---------------------------------------------------------------------------
// parseStatementWithAI
// ---------------------------------------------------------------------------

/**
 * Parse a bank statement using Claude Haiku via the Anthropic API.
 *
 * @param {string} statementText  Raw bank statement text (CSV or plain text)
 * @param {Array<{id: string, name: string, description?: string}>} categories  User's budget categories
 * @param {Array<{pattern: string, categoryId: string, categoryName: string, type: string}>} [learningExamples]  Previous classification examples for learning
 * @returns {Promise<{transactions: Array, detectedIncome: number|null} | {error: string}>}
 */
export async function parseStatementWithAI(statementText, categories, learningExamples) {
  const client = getClient();
  const prompt = buildPrompt(statementText, categories, learningExamples);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16384,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text from the Anthropic response format
    const rawText = (response.content[0].text || '').trim();
    if (!rawText) {
      console.error('Anthropic response missing text content:', JSON.stringify(response));
      return { error: 'AI response did not contain text content' };
    }

    // Strip markdown fences, leading/trailing noise, and extract JSON
    let jsonText = rawText;
    // Try multiple fence patterns
    const fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/) ||
                       rawText.match(/`{3,}(?:json)?\s*\n?([\s\S]*?)\n?\s*`{3,}/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }
    // If still not valid JSON, try to find the JSON object/array
    if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
      const jsonStart = jsonText.indexOf('{');
      if (jsonStart !== -1) {
        jsonText = jsonText.slice(jsonStart);
      }
    }
    // Remove trailing text after the JSON closes
    const lastBrace = jsonText.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < jsonText.length - 1) {
      jsonText = jsonText.slice(0, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (jsonErr) {
      // Response may be truncated — try to salvage by closing incomplete JSON
      // Find the last complete transaction object (ends with })
      const lastCompleteObj = jsonText.lastIndexOf('},');
      const lastObj = jsonText.lastIndexOf('}');
      const cutPoint = lastCompleteObj > 0 ? lastCompleteObj + 1 : lastObj;
      if (cutPoint > 0) {
        const salvaged = jsonText.slice(0, cutPoint) + '], "detectedIncome": null}';
        try {
          parsed = JSON.parse(salvaged);
          console.log('Salvaged truncated JSON response — some transactions may be missing');
        } catch {
          throw jsonErr; // Give up
        }
      } else {
        throw jsonErr;
      }
    }

    // Validate the expected shape
    if (!parsed || !Array.isArray(parsed.transactions)) {
      return { error: 'AI response JSON missing "transactions" array' };
    }

    // Normalize each transaction
    const validTypes = ['expense', 'refund', 'income'];
    const transactions = parsed.transactions.map((t) => ({
      date: String(t.date || ''),
      description: String(t.description || ''),
      amount: Math.abs(Number(t.amount) || 0),
      type: validTypes.includes(t.type) ? t.type : 'expense',
      budgetCategoryId: String(t.budgetCategoryId || 'bcat-other'),
      confidence: Math.min(1, Math.max(0, Number(t.confidence) || 0)),
      originalLine: String(t.originalLine || ''),
    }));

    const detectedIncome =
      parsed.detectedIncome != null ? Number(parsed.detectedIncome) || null : null;

    return { transactions, detectedIncome };
  } catch (err) {
    console.error('parseStatementWithAI error:', err);

    // Distinguish JSON parse errors from API errors
    if (err instanceof SyntaxError) {
      return { error: 'Failed to parse AI response as JSON' };
    }

    return { error: `AI parsing failed: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// validateCategoriesWithAI
// ---------------------------------------------------------------------------

/**
 * Validate budget category names using Claude Haiku.
 * Flags names that are too vague, overlapping, or unclear.
 *
 * @param {Array<{name: string, percentOfIncome: number}>} categories
 * @returns {Promise<{valid: true} | {valid: false, issues: Array<{name: string, reason: string}>}>}
 */
export async function validateCategoriesWithAI(categories) {
  const client = getClient();

  const categoryNames = categories.map((c) => c.name).join(', ');

  const catList = categories.map((c) => {
    let s = `- "${c.name}"`;
    if (c.description) s += ` (description: ${c.description})`;
    return s;
  }).join('\n');

  const prompt = `You are a budget category validator. Review these budget categories for a personal finance app. An AI will later use these names to categorize bank transactions.

Categories:
${catList}

Flag ONLY categories that are genuinely problematic:
1. So vague that an AI couldn't categorize bank transactions into them (e.g. "Stuff", "Things", "Misc 2", "Category 1")
2. Clearly overlapping with another category — where the same transaction could reasonably go in either (e.g. "Food" and "Groceries")

Do NOT flag:
- Common budget names like "Housing", "Rent", "Food & Dining", "Entertainment", "Personal", "Other" — these are fine
- Categories with a description that clarifies their meaning
- Slightly informal but clear names like "Fun Money", "Self Care", "Going Out"

Return ONLY valid JSON (no markdown fences). If all categories are fine:
{"valid": true}

If there are issues — flag ONLY the truly problematic ones and suggest adding a description:
{"valid": false, "issues": [{"name": "exact category name", "reason": "brief explanation — suggest they add a description to clarify"}]}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = (response.content[0].text || '').trim();
    if (!rawText) {
      console.error('validateCategoriesWithAI: empty response');
      return { valid: true };
    }

    let jsonText = rawText;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);

    if (parsed.valid === true) {
      return { valid: true };
    }

    if (parsed.valid === false && Array.isArray(parsed.issues)) {
      return {
        valid: false,
        issues: parsed.issues.map((i) => ({
          name: String(i.name || ''),
          reason: String(i.reason || ''),
        })),
      };
    }

    // Unexpected shape — treat as valid to avoid blocking the user
    return { valid: true };
  } catch (err) {
    console.error('validateCategoriesWithAI error:', err);
    // On error, don't block the user — treat as valid
    return { valid: true };
  }
}
