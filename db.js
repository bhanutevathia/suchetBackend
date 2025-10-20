// db.js
import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const {
  DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, NODE_ENV
} = process.env;

let ssl;
try {
  // Optional but recommended: download rds-combined-ca-bundle.pem and reference it.
  // ssl = { ca: fs.readFileSync('./rds-combined-ca-bundle.pem', 'utf8') };
  ssl = { rejectUnauthorized: true };
} catch {
  ssl = { rejectUnauthorized: true };
}

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT || 3306),
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: ssl,
  // Helpful timeouts
  connectTimeout: 15000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});
