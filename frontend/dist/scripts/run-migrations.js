"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var sql = __importStar(require("../lib/db"));
/**
 * Simple migration runner to execute SQL migration files
 */
function runMigrations() {
    return __awaiter(this, void 0, void 0, function () {
        var appliedResult, appliedMigrations, migrationsDir, migrationFiles, _i, migrationFiles_1, file, filePath, sqlContent, error_1, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Create migrations table if it doesn't exist
                return [4 /*yield*/, sql.query("\n    CREATE TABLE IF NOT EXISTS migrations (\n      id SERIAL PRIMARY KEY,\n      name VARCHAR(255) NOT NULL UNIQUE,\n      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n    );\n  ")];
                case 1:
                    // Create migrations table if it doesn't exist
                    _a.sent();
                    return [4 /*yield*/, sql.query('SELECT name FROM migrations ORDER BY name')];
                case 2:
                    appliedResult = _a.sent();
                    appliedMigrations = new Set(appliedResult.rows.map(function (row) { return row.name; }));
                    migrationsDir = path.join(process.cwd(), 'src', 'migrations');
                    migrationFiles = fs.readdirSync(migrationsDir)
                        .filter(function (file) { return file.endsWith('.sql'); })
                        .sort();
                    // Run migrations that haven't been applied yet
                    console.log('Running migrations...');
                    _i = 0, migrationFiles_1 = migrationFiles;
                    _a.label = 3;
                case 3:
                    if (!(_i < migrationFiles_1.length)) return [3 /*break*/, 17];
                    file = migrationFiles_1[_i];
                    if (!!appliedMigrations.has(file)) return [3 /*break*/, 15];
                    console.log("Applying migration: ".concat(file));
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 13, , 14]);
                    filePath = path.join(migrationsDir, file);
                    sqlContent = fs.readFileSync(filePath, 'utf8');
                    // Begin transaction
                    return [4 /*yield*/, sql.query('BEGIN')];
                case 5:
                    // Begin transaction
                    _a.sent();
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 10, , 12]);
                    // Execute the SQL
                    return [4 /*yield*/, sql.query(sqlContent)];
                case 7:
                    // Execute the SQL
                    _a.sent();
                    // Record that we've applied this migration
                    return [4 /*yield*/, sql.query('INSERT INTO migrations (name) VALUES ($1)', [file])];
                case 8:
                    // Record that we've applied this migration
                    _a.sent();
                    // Commit the transaction
                    return [4 /*yield*/, sql.query('COMMIT')];
                case 9:
                    // Commit the transaction
                    _a.sent();
                    console.log("Successfully applied migration: ".concat(file));
                    return [3 /*break*/, 12];
                case 10:
                    error_1 = _a.sent();
                    // If there's an error, roll back the transaction
                    return [4 /*yield*/, sql.query('ROLLBACK')];
                case 11:
                    // If there's an error, roll back the transaction
                    _a.sent();
                    console.error("Error applying migration ".concat(file, ":"), error_1);
                    throw error_1;
                case 12: return [3 /*break*/, 14];
                case 13:
                    error_2 = _a.sent();
                    console.error("Failed to apply migration ".concat(file, ":"), error_2);
                    process.exit(1);
                    return [3 /*break*/, 14];
                case 14: return [3 /*break*/, 16];
                case 15:
                    console.log("Migration already applied: ".concat(file));
                    _a.label = 16;
                case 16:
                    _i++;
                    return [3 /*break*/, 3];
                case 17:
                    console.log('All migrations completed successfully!');
                    return [2 /*return*/];
            }
        });
    });
}
// Execute the migration runner
runMigrations()
    .then(function () {
    console.log('Migration process completed');
    process.exit(0);
})
    .catch(function (error) {
    console.error('Migration process failed:', error);
    process.exit(1);
});
