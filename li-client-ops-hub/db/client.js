"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDB = getDB;
exports.closeDB = closeDB;
exports.initDB = initDB;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const electron_1 = require("electron");
const crypto_1 = require("crypto");
let db = null;
function getDB() {
    if (!db) {
        const dbDir = path_1.default.join(electron_1.app.getPath('userData'), 'data');
        fs_1.default.mkdirSync(dbDir, { recursive: true });
        const dbPath = path_1.default.join(dbDir, 'ops-hub.db');
        db = new better_sqlite3_1.default(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}
function closeDB() {
    if (db) {
        db.close();
        db = null;
    }
}
function initDB() {
    const database = getDB();
    // Load and execute schema (uses CREATE IF NOT EXISTS, safe to re-run)
    const schemaPath = electron_1.app.isPackaged
        ? path_1.default.join(process.resourcesPath, 'db', 'schema.sql')
        : path_1.default.join(__dirname, '..', 'db', 'schema.sql');
    const schema = fs_1.default.readFileSync(schemaPath, 'utf-8');
    database.exec(schema);
    seedIntegrations(database);
}
function seedIntegrations(database) {
    const integrations = [
        {
            name: 'ghl',
            display_name: 'GoHighLevel',
            env_keys: '["GHL_CLIENT_ID","GHL_CLIENT_SECRET","GHL_COMPANY_ID"]',
        },
        {
            name: 'ghl_ri',
            display_name: 'GHL Restoration Inbound',
            env_keys: '["GHL_RI_TOKEN","GHL_RI_LOCATION_ID"]',
        },
        {
            name: 'teamwork',
            display_name: 'Teamwork',
            env_keys: '["TEAMWORK_API_KEY","TEAMWORK_SITE"]',
        },
        {
            name: 'readai',
            display_name: 'Read.ai',
            env_keys: '["READAI_API_KEY"]',
        },
        {
            name: 'gdrive',
            display_name: 'Google Drive',
            env_keys: '["GOOGLE_SERVICE_ACCOUNT_JSON_PATH","GOOGLE_DRIVE_PARENT_FOLDER_ID"]',
        },
    ];
    const stmt = database.prepare(`
    INSERT OR IGNORE INTO integrations (id, name, display_name, env_keys, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'not_configured', datetime('now'), datetime('now'))
  `);
    const insertAll = database.transaction(() => {
        for (const int of integrations) {
            stmt.run((0, crypto_1.randomUUID)(), int.name, int.display_name, int.env_keys);
        }
    });
    insertAll();
}
//# sourceMappingURL=client.js.map