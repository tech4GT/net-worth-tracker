/**
 * Budget route handlers.
 *
 * GET    /api/budget                              — load budget state (config, categories, months)
 * PUT    /api/budget/config                       — upsert budget config
 * POST   /api/budget/categories                   — create budget category
 * PUT    /api/budget/categories/{id}              — update budget category
 * DELETE /api/budget/categories/{id}              — delete budget category
 * POST   /api/budget/confirm                      — confirm month transactions + compute totals
 * GET    /api/budget/months/{month}/transactions  — get month transactions
 * GET    /api/budget/ytd                          — year-to-date summary
 * DELETE /api/budget/months/{month}               — delete a month and its transactions
 * POST   /api/budget/parse-statement              — parse a bank statement with AI
 * POST   /api/budget/validate-categories          — AI validation of category names
 */

import crypto from 'node:crypto';
import { getItem, putItem, updateItem, deleteItem, queryByPrefix, batchWrite } from '../lib/db.mjs';
import {
  parseBody,
  validateBudgetConfig,
  validateBudgetCategory,
  validateConfirmTransactions,
} from '../lib/validate.mjs';
import { parseStatementWithAI, validateCategoriesWithAI } from '../lib/ai.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const MAX_STATEMENT_BYTES = 100 * 1024; // 100 KB
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------------------
// Default budget categories (seeded for new users)
// ---------------------------------------------------------------------------

const DEFAULT_BUDGET_CATEGORIES = [
  { id: 'bcat-housing', name: 'Housing', color: '#6366f1', icon: 'home', percentOfIncome: 30 },
  { id: 'bcat-transportation', name: 'Transportation', color: '#f59e0b', icon: 'car', percentOfIncome: 10 },
  { id: 'bcat-food', name: 'Food & Dining', color: '#22c55e', icon: 'utensils', percentOfIncome: 15 },
  { id: 'bcat-utilities', name: 'Utilities', color: '#06b6d4', icon: 'bolt', percentOfIncome: 5 },
  { id: 'bcat-insurance', name: 'Insurance', color: '#8b5cf6', icon: 'shield', percentOfIncome: 5 },
  { id: 'bcat-healthcare', name: 'Healthcare', color: '#ec4899', icon: 'heart', percentOfIncome: 5 },
  { id: 'bcat-savings', name: 'Savings & Investing', color: '#10b981', icon: 'piggy-bank', percentOfIncome: 15 },
  { id: 'bcat-entertainment', name: 'Entertainment', color: '#f97316', icon: 'star', percentOfIncome: 5 },
  { id: 'bcat-personal', name: 'Personal', color: '#64748b', icon: 'user', percentOfIncome: 5 },
  { id: 'bcat-other', name: 'Other', color: '#9f1239', icon: 'box', percentOfIncome: 5 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripKeys(record) {
  const { PK, SK, ...rest } = record;
  return rest;
}

function extractIdFromPath(rawPath) {
  // last segment of the path
  const segments = rawPath.split('/');
  return segments[segments.length - 1];
}

function extractMonthFromPath(rawPath) {
  // /api/budget/months/{month}/transactions → segments[4] = month
  // /api/budget/months/{month}              → segments[4] = month
  const segments = rawPath.split('/');
  return segments[4] ? decodeURIComponent(segments[4]) : undefined;
}

// ---------------------------------------------------------------------------
// GET /api/budget
// ---------------------------------------------------------------------------

/**
 * Load budget state: config, categories, months (not transactions).
 * Seeds default budget categories if none exist.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleGetBudgetState(event, userId) {
  try {
    // Query all budget-related prefixes in parallel
    const [configRecord, bcatRecords, bmonthRecords] = await Promise.all([
      getItem(userId, 'BUDGETCFG'),
      queryByPrefix(userId, 'BCAT#'),
      queryByPrefix(userId, 'BMONTH#'),
    ]);

    const config = configRecord ? stripKeys(configRecord) : null;

    const categories = bcatRecords.map((r) => {
      const cleaned = stripKeys(r);
      cleaned.id = r.SK.slice(5); // strip "BCAT#"
      return cleaned;
    });

    const months = bmonthRecords.map((r) => {
      const cleaned = stripKeys(r);
      cleaned.month = r.SK.slice(7); // strip "BMONTH#"
      return cleaned;
    });

    // Only seed defaults if config exists but no categories (edge case recovery)
    // Do NOT seed on first visit — wizard creates categories
    if (categories.length === 0 && config) {
      const now = new Date().toISOString();
      const tableName = process.env.TABLE_NAME;
      const operations = DEFAULT_BUDGET_CATEGORIES.map((cat) => ({
        PutRequest: {
          Item: {
            PK: `USER#${userId}`,
            SK: `BCAT#${cat.id}`,
            ...cat,
            isDefault: true,
            createdAt: now,
            updatedAt: now,
          },
        },
      }));

      await batchWrite(tableName, operations);

      // Return the seeded categories
      for (const cat of DEFAULT_BUDGET_CATEGORIES) {
        categories.push({ ...cat, isDefault: true, createdAt: now, updatedAt: now });
      }
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ config, categories, months }),
    };
  } catch (err) {
    console.error('handleGetBudgetState error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to load budget state' }),
    };
  }
}

// ---------------------------------------------------------------------------
// PUT /api/budget/config
// ---------------------------------------------------------------------------

/**
 * Upsert budget configuration.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleUpdateBudgetConfig(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const validation = validateBudgetConfig(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    const existing = await getItem(userId, 'BUDGETCFG');

    let result;
    if (existing) {
      result = await updateItem(userId, 'BUDGETCFG', validation.data);
    } else {
      result = await putItem(userId, 'BUDGETCFG', validation.data);
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(stripKeys(result)),
    };
  } catch (err) {
    console.error('handleUpdateBudgetConfig error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to update budget config' }),
    };
  }
}

// ---------------------------------------------------------------------------
// POST /api/budget/categories
// ---------------------------------------------------------------------------

/**
 * Create a new budget category.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleCreateBudgetCategory(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const validation = validateBudgetCategory(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    const id = crypto.randomUUID();
    const data = {
      ...validation.data,
      id,
      isDefault: false,
    };

    const item = await putItem(userId, `BCAT#${id}`, data);

    return {
      statusCode: 201,
      headers: JSON_HEADERS,
      body: JSON.stringify(stripKeys(item)),
    };
  } catch (err) {
    console.error('handleCreateBudgetCategory error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to create budget category' }),
    };
  }
}

// ---------------------------------------------------------------------------
// PUT /api/budget/categories/{id}
// ---------------------------------------------------------------------------

/**
 * Update an existing budget category.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleUpdateBudgetCategory(event, userId) {
  try {
    const id = extractIdFromPath(event.rawPath);
    if (!id) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing budget category id in path' }),
      };
    }

    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const validation = validateBudgetCategory(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    // Check that the budget category exists
    const existing = await getItem(userId, `BCAT#${id}`);
    if (!existing) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Budget category not found' }),
      };
    }

    const updated = await updateItem(userId, `BCAT#${id}`, validation.data);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(stripKeys(updated)),
    };
  } catch (err) {
    console.error('handleUpdateBudgetCategory error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to update budget category' }),
    };
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/budget/categories/{id}
// ---------------------------------------------------------------------------

/**
 * Delete a budget category. Blocks deletion of default categories.
 * Reassigns any BTX# transactions to bcat-other.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleDeleteBudgetCategory(event, userId) {
  try {
    const id = extractIdFromPath(event.rawPath);
    if (!id) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing budget category id in path' }),
      };
    }

    // Fetch the category — must exist
    const category = await getItem(userId, `BCAT#${id}`);
    if (!category) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Budget category not found' }),
      };
    }

    // Cannot delete default categories
    if (category.isDefault === true) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Cannot delete a default budget category' }),
      };
    }

    // Query all BTX# transactions to find those belonging to this category
    const allTx = await queryByPrefix(userId, 'BTX#');
    const affectedTx = allTx.filter((r) => r.budgetCategoryId === id);

    // Reassign affected transactions to bcat-other
    let reassignedCount = 0;
    for (const tx of affectedTx) {
      await updateItem(userId, tx.SK, { budgetCategoryId: 'bcat-other' });
      reassignedCount++;
    }

    // Delete the category
    await deleteItem(userId, `BCAT#${id}`);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ deleted: id, reassigned: reassignedCount }),
    };
  } catch (err) {
    console.error('handleDeleteBudgetCategory error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete budget category' }),
    };
  }
}

// ---------------------------------------------------------------------------
// POST /api/budget/confirm
// ---------------------------------------------------------------------------

/**
 * Confirm transactions for a month. Batch writes BTX# entries,
 * computes category totals, and upserts BMONTH#{month}.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleConfirmTransactions(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const validation = validateConfirmTransactions(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    const { month, actualIncome, transactions } = validation.data;
    const now = new Date().toISOString();
    const tableName = process.env.TABLE_NAME;

    // Batch write all BTX# entries
    const operations = transactions.map((tx) => {
      const txId = tx.id || crypto.randomUUID();
      return {
        PutRequest: {
          Item: {
            PK: `USER#${userId}`,
            SK: `BTX#${txId}`,
            id: txId,
            month,
            description: tx.description,
            amount: tx.amount,
            type: tx.type || 'expense',
            budgetCategoryId: tx.budgetCategoryId || tx.categoryId,
            date: tx.date || now,
            createdAt: now,
            updatedAt: now,
          },
        },
      };
    });

    if (operations.length > 0) {
      await batchWrite(tableName, operations);
    }

    // Compute category totals from all transactions for this month
    // (including any previously confirmed transactions)
    const allTx = await queryByPrefix(userId, 'BTX#');
    const monthTx = allTx.filter((r) => r.month === month);

    const categoryTotals = {};
    let totalSpent = 0;
    let totalIncome = 0;

    for (const tx of monthTx) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
        continue;
      }
      const catId = tx.budgetCategoryId;
      if (!categoryTotals[catId]) {
        categoryTotals[catId] = 0;
      }
      if (tx.type === 'refund') {
        categoryTotals[catId] -= tx.amount;
        totalSpent -= tx.amount;
      } else {
        categoryTotals[catId] += tx.amount;
        totalSpent += tx.amount;
      }
    }

    // Upsert BMONTH#{month}
    const monthData = {
      month,
      actualIncome: actualIncome || totalIncome,
      totalSpent,
      categoryTotals,
      transactionCount: monthTx.length,
      confirmedAt: now,
    };

    const existing = await getItem(userId, `BMONTH#${month}`);
    let result;
    if (existing) {
      result = await updateItem(userId, `BMONTH#${month}`, monthData);
    } else {
      result = await putItem(userId, `BMONTH#${month}`, monthData);
    }

    // --- Update classification learning context ---
    try {
      // Build a category name lookup from BCAT# records
      const bcatRecords = await queryByPrefix(userId, 'BCAT#');
      const catNameMap = {};
      for (const r of bcatRecords) {
        catNameMap[r.id || r.SK.slice(5)] = r.name;
      }

      // Extract learning examples from confirmed transactions (expenses and refunds only)
      const newExamples = transactions
        .filter((tx) => {
          const type = tx.type || 'expense';
          return type === 'expense' || type === 'refund';
        })
        .map((tx) => ({
          pattern: tx.description,
          categoryId: tx.budgetCategoryId || tx.categoryId,
          categoryName: catNameMap[tx.budgetCategoryId || tx.categoryId] || 'Other',
          type: tx.type || 'expense',
        }))
        .filter((ex) => ex.pattern && ex.pattern.trim().length > 0);

      if (newExamples.length > 0) {
        const learnRecord = await getItem(userId, 'BUDGETLEARN');
        const existingExamples = (learnRecord && learnRecord.examples) || [];

        // Merge: index existing by lowercase pattern, then overlay new examples
        const exampleMap = new Map();
        for (const ex of existingExamples) {
          exampleMap.set(ex.pattern.toLowerCase(), ex);
        }
        for (const ex of newExamples) {
          exampleMap.set(ex.pattern.toLowerCase(), ex);
        }

        // Cap at 100 examples — keep most recent (new entries are last in map iteration)
        const merged = Array.from(exampleMap.values());
        const capped = merged.length > 100 ? merged.slice(merged.length - 100) : merged;

        await putItem(userId, 'BUDGETLEARN', { examples: capped });
      }
    } catch (learnErr) {
      // Non-fatal — log but don't fail the confirm
      console.error('Failed to update learning context:', learnErr);
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(stripKeys(result)),
    };
  } catch (err) {
    console.error('handleConfirmTransactions error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to confirm transactions' }),
    };
  }
}

// ---------------------------------------------------------------------------
// GET /api/budget/months/{month}/transactions
// ---------------------------------------------------------------------------

/**
 * Get all transactions for a specific month.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleGetMonthTransactions(event, userId) {
  try {
    const month = extractMonthFromPath(event.rawPath);
    if (!month) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing month in path' }),
      };
    }

    const allTx = await queryByPrefix(userId, 'BTX#');
    const transactions = allTx
      .filter((r) => r.month === month)
      .map((r) => {
        const cleaned = stripKeys(r);
        cleaned.id = r.SK.slice(4); // strip "BTX#"
        return cleaned;
      });

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ transactions }),
    };
  } catch (err) {
    console.error('handleGetMonthTransactions error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to get month transactions' }),
    };
  }
}

// ---------------------------------------------------------------------------
// GET /api/budget/ytd
// ---------------------------------------------------------------------------

/**
 * Compute year-to-date budget summary.
 * Compares expected vs actual spending per category, detects debt.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleGetYtdSummary(event, userId) {
  try {
    const [configRecord, bcatRecords, bmonthRecords] = await Promise.all([
      getItem(userId, 'BUDGETCFG'),
      queryByPrefix(userId, 'BCAT#'),
      queryByPrefix(userId, 'BMONTH#'),
    ]);

    if (!configRecord) {
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          config: null,
          categories: {},
          monthsSummary: [],
          ytdTotals: {},
          inDebt: false,
        }),
      };
    }

    const config = stripKeys(configRecord);
    const monthlyIncome = config.yearlyIncome / 12;

    const categories = bcatRecords.map((r) => {
      const cleaned = stripKeys(r);
      cleaned.id = r.SK.slice(5);
      return cleaned;
    });

    // Filter months to current year from config
    const year = String(config.year);
    const yearMonths = bmonthRecords
      .filter((r) => r.SK.slice(7).startsWith(year))
      .map((r) => {
        const cleaned = stripKeys(r);
        cleaned.month = r.SK.slice(7);
        return cleaned;
      });

    const monthCount = yearMonths.length;

    // Compute YTD expected vs actual per category
    const ytdByCategory = {};
    for (const cat of categories) {
      const monthlyBudget = monthlyIncome * (cat.percentOfIncome / 100);
      const expectedYtd = monthlyBudget * monthCount;

      // Sum actual spending for this category across all months
      let actualYtd = 0;
      for (const m of yearMonths) {
        if (m.categoryTotals && m.categoryTotals[cat.id]) {
          actualYtd += m.categoryTotals[cat.id];
        }
      }

      ytdByCategory[cat.id] = {
        categoryId: cat.id,
        name: cat.name,
        color: cat.color,
        monthlyBudget,
        expectedYtd,
        actualYtd,
        difference: expectedYtd - actualYtd,
        overBudget: actualYtd > expectedYtd,
      };
    }

    // Compute overall totals
    const totalExpectedYtd = monthlyIncome * monthCount;
    let totalActualIncome = 0;
    let totalActualSpent = 0;

    for (const m of yearMonths) {
      totalActualIncome += m.actualIncome || 0;
      totalActualSpent += m.totalSpent || 0;
    }

    const inDebt = totalActualSpent > totalActualIncome;

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        config,
        categories: ytdByCategory,
        monthsSummary: yearMonths,
        ytdTotals: {
          expectedIncome: totalExpectedYtd,
          actualIncome: totalActualIncome,
          totalSpent: totalActualSpent,
          netSavings: totalActualIncome - totalActualSpent,
          monthCount,
        },
        inDebt,
      }),
    };
  } catch (err) {
    console.error('handleGetYtdSummary error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to compute YTD summary' }),
    };
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/budget/months/{month}
// ---------------------------------------------------------------------------

/**
 * Delete a month record and all its transactions.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleDeleteMonth(event, userId) {
  try {
    const month = extractMonthFromPath(event.rawPath);
    if (!month) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing month in path' }),
      };
    }

    // Delete all BTX# transactions for this month
    const allTx = await queryByPrefix(userId, 'BTX#');
    const monthTx = allTx.filter((r) => r.month === month);

    const tableName = process.env.TABLE_NAME;
    if (monthTx.length > 0) {
      const deleteOps = monthTx.map((r) => ({
        DeleteRequest: {
          Key: { PK: `USER#${userId}`, SK: r.SK },
        },
      }));
      await batchWrite(tableName, deleteOps);
    }

    // Delete the BMONTH# record
    await deleteItem(userId, `BMONTH#${month}`);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ deleted: month, transactionsDeleted: monthTx.length }),
    };
  } catch (err) {
    console.error('handleDeleteMonth error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete month' }),
    };
  }
}

// ---------------------------------------------------------------------------
// POST /api/budget/parse-statement
// ---------------------------------------------------------------------------

/**
 * Parse a bank statement using AI and return categorized transactions.
 * Results are NOT saved to the database — that happens in the confirm step.
 *
 * Body: { month: "YYYY-MM", statementText: "...", actualIncome?: number }
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleParseStatement(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing request body' }),
      };
    }

    // --- Validate month ---
    if (!body.month || typeof body.month !== 'string' || !MONTH_RE.test(body.month)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'month is required and must be in YYYY-MM format' }),
      };
    }

    // --- Validate statementText ---
    if (!body.statementText || typeof body.statementText !== 'string') {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'statementText is required and must be a non-empty string' }),
      };
    }

    const textBytes = new TextEncoder().encode(body.statementText).length;
    if (textBytes > MAX_STATEMENT_BYTES) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          error: `statementText exceeds maximum size of ${MAX_STATEMENT_BYTES / 1024}KB`,
        }),
      };
    }

    // --- Query user's budget categories and learning context from DynamoDB ---
    const [catItems, learnRecord] = await Promise.all([
      queryByPrefix(userId, 'BCAT#'),
      getItem(userId, 'BUDGETLEARN'),
    ]);

    const categories = catItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || undefined,
    }));

    // If user has no budget categories, return an informative error
    if (categories.length === 0) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          error: 'No budget categories found. Please create budget categories first.',
        }),
      };
    }

    // Extract learning examples (if any)
    const learningExamples = (learnRecord && learnRecord.examples) || [];

    // --- Call AI to parse the statement ---
    const result = await parseStatementWithAI(body.statementText, categories, learningExamples);

    // Check for AI error
    if (result.error) {
      return {
        statusCode: 422,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: result.error }),
      };
    }

    // --- Add tempId to each transaction ---
    const transactions = result.transactions.map((t) => ({
      ...t,
      tempId: crypto.randomUUID(),
    }));

    // Use client-provided income if present, otherwise use AI-detected value
    const detectedIncome =
      body.actualIncome != null ? body.actualIncome : result.detectedIncome;

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        month: body.month,
        transactions,
        detectedIncome,
      }),
    };
  } catch (err) {
    console.error('handleParseStatement error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to parse statement' }),
    };
  }
}

// ---------------------------------------------------------------------------
// POST /api/budget/validate-categories
// ---------------------------------------------------------------------------

/**
 * Validate budget category names using AI.
 * Flags vague, ambiguous, or overlapping category names.
 *
 * Body: { categories: [{ name: string, percentOfIncome: number }] }
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleValidateCategories(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing request body' }),
      };
    }

    if (!Array.isArray(body.categories) || body.categories.length === 0) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'categories must be a non-empty array' }),
      };
    }

    // Validate each category has a name
    for (const cat of body.categories) {
      if (!cat.name || typeof cat.name !== 'string') {
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ error: 'Each category must have a non-empty name string' }),
        };
      }
    }

    const result = await validateCategoriesWithAI(body.categories);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('handleValidateCategories error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to validate categories' }),
    };
  }
}
