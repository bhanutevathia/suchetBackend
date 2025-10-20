import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

// --- Resolve __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Path to your CSV data folder ---
const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Reads and parses a CSV file if it exists.
 * Returns [] if not found or parsing fails.
 */
function readCsvIfExists(filename) {
  const filepath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filepath)) {
    console.warn(`[data] Missing file: ${filename}`);
    return [];
  }

  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    console.log(`[data] Loaded ${filename} (${records.length} rows)`);
    return records;
  } catch (err) {
    console.error(`[data] Error parsing ${filename}:`, err.message);
    return [];
  }
}

/**
 * Loads all processed CSV datasets into memory at startup.
 * This is fast and avoids re-parsing during API calls.
 */
export async function loadAllData() {
  const conditions  = readCsvIfExists('processed_conditions_data.csv');
  const factors     = readCsvIfExists('processed_factors_data.csv');
  const performance = readCsvIfExists('processed_performance_data.csv');
  const treatment   = readCsvIfExists('processed_treatment_data.csv');

  const store = { conditions, factors, performance, treatment };
  console.log(`[data] All datasets loaded. Total keys: ${Object.keys(store).length}`);
  return store;
}

/**
 * Detects numeric columns in a dataset.
 */
function numericColumns(rows) {
  if (!rows?.length) return [];
  const cols = Object.keys(rows[0]);
  return cols.filter(col =>
    rows.every(r => r[col] === '' || !isNaN(Number(r[col])))
  );
}

/**
 * Generates a quick statistical summary (count, min, max, mean)
 * for each numeric column in each dataset.
 */
export function getDatasetsSummary(store) {
  const summary = {};

  for (const [key, rows] of Object.entries(store)) {
    if (!rows?.length) {
      summary[key] = { rows: 0 };
      continue;
    }

    const numCols = numericColumns(rows);
    const stats = {};

    for (const col of numCols) {
      const values = rows
        .map(r => Number(r[col]))
        .filter(v => !isNaN(v));

      if (!values.length) continue;

      const sum = values.reduce((a, b) => a + b, 0);
      stats[col] = {
        count: values.length,
        mean: sum / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }

    summary[key] = {
      rows: rows.length,
      numeric_columns: numCols,
      stats,
    };
  }

  return summary;
}
