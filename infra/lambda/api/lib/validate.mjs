/**
 * Lightweight inline validation helpers.
 * Each validator returns { valid: true, data } or { valid: false, error }.
 * No external dependencies — keeps the Lambda deployment small.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isString(v) {
  return typeof v === 'string';
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isBoolean(v) {
  return typeof v === 'boolean';
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------------------
// parseBody
// ---------------------------------------------------------------------------

/**
 * Safely JSON-parse the event body.  Returns the parsed object or null.
 */
export function parseBody(event) {
  if (!event || !event.body) return null;
  try {
    const parsed = JSON.parse(event.body);
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// validateItem
// ---------------------------------------------------------------------------

export function validateItem(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const errors = [];

  // name — required string, 1-200 chars
  if (!isString(body.name) || body.name.length < 1 || body.name.length > 200) {
    errors.push('name is required and must be a string between 1 and 200 characters');
  }

  // type — required, 'asset' | 'liability'
  if (body.type !== 'asset' && body.type !== 'liability') {
    errors.push("type is required and must be 'asset' or 'liability'");
  }

  // categoryId — required string
  if (!isString(body.categoryId) || body.categoryId.length === 0) {
    errors.push('categoryId is required and must be a non-empty string');
  }

  // value — required positive number
  if (!isNumber(body.value) || body.value <= 0) {
    errors.push('value is required and must be a positive number');
  }

  // currency — required string, 2-5 chars
  if (!isString(body.currency) || body.currency.length < 2 || body.currency.length > 5) {
    errors.push('currency is required and must be a string between 2 and 5 characters');
  }

  // tags — optional array of strings (max 20, each max 50)
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      errors.push('tags must be an array of strings');
    } else if (body.tags.length > 20) {
      errors.push('tags may contain at most 20 items');
    } else {
      for (const tag of body.tags) {
        if (!isString(tag) || tag.length > 50) {
          errors.push('each tag must be a string of at most 50 characters');
          break;
        }
      }
    }
  }

  // notes — optional string, max 2000
  if (body.notes !== undefined) {
    if (!isString(body.notes) || body.notes.length > 2000) {
      errors.push('notes must be a string of at most 2000 characters');
    }
  }

  // isStock — optional boolean
  if (body.isStock !== undefined && !isBoolean(body.isStock)) {
    errors.push('isStock must be a boolean');
  }

  // ticker — optional string or null, max 20
  if (body.ticker !== undefined && body.ticker !== null) {
    if (!isString(body.ticker) || body.ticker.length > 20) {
      errors.push('ticker must be a string of at most 20 characters');
    }
  }

  // shares — optional positive number or null
  if (body.shares !== undefined && body.shares !== null) {
    if (!isNumber(body.shares) || body.shares <= 0) {
      errors.push('shares must be a positive number');
    }
  }

  // pricePerShare — optional non-negative number or null
  if (body.pricePerShare !== undefined && body.pricePerShare !== null) {
    if (!isNumber(body.pricePerShare) || body.pricePerShare < 0) {
      errors.push('pricePerShare must be a non-negative number');
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  // Strip to allowed fields only
  const data = {
    name: body.name,
    type: body.type,
    categoryId: body.categoryId,
    value: body.value,
    currency: body.currency,
  };
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.isStock !== undefined) data.isStock = body.isStock;
  if (body.ticker !== undefined) data.ticker = body.ticker;
  if (body.shares !== undefined) data.shares = body.shares;
  if (body.pricePerShare !== undefined) data.pricePerShare = body.pricePerShare;

  return { valid: true, data };
}

// ---------------------------------------------------------------------------
// validateCategory
// ---------------------------------------------------------------------------

export function validateCategory(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const errors = [];

  // name — required string, 1-100 chars
  if (!isString(body.name) || body.name.length < 1 || body.name.length > 100) {
    errors.push('name is required and must be a string between 1 and 100 characters');
  }

  // type — required, 'asset' | 'liability' | 'both'
  if (body.type !== 'asset' && body.type !== 'liability' && body.type !== 'both') {
    errors.push("type is required and must be 'asset', 'liability', or 'both'");
  }

  // icon — optional string, max 50
  if (body.icon !== undefined) {
    if (!isString(body.icon) || body.icon.length > 50) {
      errors.push('icon must be a string of at most 50 characters');
    }
  }

  // color — optional string, hex pattern
  if (body.color !== undefined) {
    if (!isString(body.color) || !HEX_COLOR_RE.test(body.color)) {
      errors.push('color must be a valid hex color (e.g. #ff0000)');
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  const data = {
    name: body.name,
    type: body.type,
  };
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.color !== undefined) data.color = body.color;

  return { valid: true, data };
}

// ---------------------------------------------------------------------------
// validateSettings
// ---------------------------------------------------------------------------

export function validateSettings(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const errors = [];

  // baseCurrency — optional string, 2-5 chars
  if (body.baseCurrency !== undefined) {
    if (!isString(body.baseCurrency) || body.baseCurrency.length < 2 || body.baseCurrency.length > 5) {
      errors.push('baseCurrency must be a string between 2 and 5 characters');
    }
  }

  // theme — optional, 'system' | 'light' | 'dark'
  if (body.theme !== undefined) {
    if (body.theme !== 'system' && body.theme !== 'light' && body.theme !== 'dark') {
      errors.push("theme must be 'system', 'light', or 'dark'");
    }
  }

  // snapshotReminder — optional boolean
  if (body.snapshotReminder !== undefined) {
    if (!isBoolean(body.snapshotReminder)) {
      errors.push('snapshotReminder must be a boolean');
    }
  }

  // exchangeRates — optional object { string: positive number }
  if (body.exchangeRates !== undefined) {
    if (!isObject(body.exchangeRates)) {
      errors.push('exchangeRates must be an object');
    } else {
      for (const [key, val] of Object.entries(body.exchangeRates)) {
        if (!isString(key)) {
          errors.push('exchangeRates keys must be strings');
          break;
        }
        if (!isNumber(val) || val <= 0) {
          errors.push(`exchangeRates["${key}"] must be a positive number`);
          break;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  const data = {};
  if (body.baseCurrency !== undefined) data.baseCurrency = body.baseCurrency;
  if (body.theme !== undefined) data.theme = body.theme;
  if (body.snapshotReminder !== undefined) data.snapshotReminder = body.snapshotReminder;
  if (body.exchangeRates !== undefined) data.exchangeRates = body.exchangeRates;

  return { valid: true, data };
}

// ---------------------------------------------------------------------------
// validateBudgetConfig
// ---------------------------------------------------------------------------

export function validateBudgetConfig(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const errors = [];

  // yearlyIncome — required positive number
  if (!isNumber(body.yearlyIncome) || body.yearlyIncome <= 0) {
    errors.push('yearlyIncome is required and must be a positive number');
  }

  // year — required 4-digit number
  if (!isNumber(body.year) || !Number.isInteger(body.year) || body.year < 1000 || body.year > 9999) {
    errors.push('year is required and must be a 4-digit integer');
  }

  // currency — required string, 2-5 chars
  if (!isString(body.currency) || body.currency.length < 2 || body.currency.length > 5) {
    errors.push('currency is required and must be a string between 2 and 5 characters');
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  const data = {
    yearlyIncome: body.yearlyIncome,
    year: body.year,
    currency: body.currency,
  };

  return { valid: true, data };
}

// ---------------------------------------------------------------------------
// validateBudgetCategory
// ---------------------------------------------------------------------------

export function validateBudgetCategory(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const errors = [];

  // name — required string, 1-100 chars
  if (!isString(body.name) || body.name.length < 1 || body.name.length > 100) {
    errors.push('name is required and must be a string between 1 and 100 characters');
  }

  // percentOfIncome — required number, 0-100
  if (!isNumber(body.percentOfIncome) || body.percentOfIncome < 0 || body.percentOfIncome > 100) {
    errors.push('percentOfIncome is required and must be a number between 0 and 100');
  }

  // color — required string, hex pattern
  if (!isString(body.color) || !HEX_COLOR_RE.test(body.color)) {
    errors.push('color is required and must be a valid hex color (e.g. #ff0000)');
  }

  // icon — optional string, max 50
  if (body.icon !== undefined) {
    if (!isString(body.icon) || body.icon.length > 50) {
      errors.push('icon must be a string of at most 50 characters');
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  const data = {
    name: body.name,
    percentOfIncome: body.percentOfIncome,
    color: body.color,
  };
  if (body.icon !== undefined) data.icon = body.icon;

  return { valid: true, data };
}

// ---------------------------------------------------------------------------
// validateConfirmTransactions
// ---------------------------------------------------------------------------

export function validateConfirmTransactions(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const errors = [];

  // month — required string in YYYY-MM format
  if (!isString(body.month) || !MONTH_RE.test(body.month)) {
    errors.push('month is required and must be in YYYY-MM format');
  }

  // actualIncome — required non-negative number
  if (!isNumber(body.actualIncome) || body.actualIncome < 0) {
    errors.push('actualIncome is required and must be a non-negative number');
  }

  // transactions — required array
  if (!Array.isArray(body.transactions)) {
    errors.push('transactions is required and must be an array');
  } else {
    for (let i = 0; i < body.transactions.length; i++) {
      const tx = body.transactions[i];
      if (!isObject(tx)) {
        errors.push(`transactions[${i}] must be an object`);
        break;
      }
      if (!isString(tx.description) || tx.description.length < 1 || tx.description.length > 500) {
        errors.push(`transactions[${i}].description is required and must be 1-500 characters`);
      }
      if (!isNumber(tx.amount) || tx.amount < 0) {
        errors.push(`transactions[${i}].amount is required and must be a non-negative number`);
      }
      const catId = tx.budgetCategoryId || tx.categoryId;
      if (!isString(catId) || catId.length === 0) {
        errors.push(`transactions[${i}].budgetCategoryId or categoryId is required and must be a non-empty string`);
      }
      // date — optional string
      if (tx.date !== undefined && !isString(tx.date)) {
        errors.push(`transactions[${i}].date must be a string if provided`);
      }
      // id — optional string
      if (tx.id !== undefined && !isString(tx.id)) {
        errors.push(`transactions[${i}].id must be a string if provided`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  const data = {
    month: body.month,
    actualIncome: body.actualIncome,
    transactions: body.transactions.map((tx) => {
      const cleaned = {
        description: tx.description,
        amount: tx.amount,
        budgetCategoryId: tx.budgetCategoryId || tx.categoryId,
        type: tx.type || 'expense',
      };
      if (tx.date !== undefined) cleaned.date = tx.date;
      if (tx.id !== undefined) cleaned.id = tx.id;
      return cleaned;
    }),
  };

  return { valid: true, data };
}
