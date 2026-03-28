/**
 * Anthropic API wrapper for parsing bank statements with Claude Haiku.
 *
 * Uses the @anthropic-ai/sdk package with an API key from the
 * ANTHROPIC_API_KEY environment variable (set via SSM in CDK).
 *
 * Exports a single function: parseStatementWithAI(statementText, categories)
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

function buildPrompt(statementText, categories) {
  const categoryList = categories
    .map((c) => `  - id: "${c.id}", name: "${c.name}"`)
    .join('\n');

  return `You are a bank statement parser. Your job is to extract individual spending transactions from a raw bank statement and categorize each one.

AVAILABLE BUDGET CATEGORIES:
${categoryList}

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
 * @param {Array<{id: string, name: string}>} categories  User's budget categories
 * @returns {Promise<{transactions: Array, detectedIncome: number|null} | {error: string}>}
 */
export async function parseStatementWithAI(statementText, categories) {
  const client = getClient();
  const prompt = buildPrompt(statementText, categories);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
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

    // Attempt to parse the JSON response — strip markdown fences if present
    let jsonText = rawText;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);

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
