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
exports.runMigrations = runMigrations;
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var sql = __importStar(require("../../lib/db"));
/**
 * Simple migration runner to execute SQL migration files
 */
function runMigrations() {
    return __awaiter(this, void 0, void 0, function () {
        var appliedResult, appliedMigrations_1, migrationsDir, migrationFiles, pendingMigrations, _i, migrationFiles_1, file, filePath, sqlContent, error_1, error_2, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Starting database migration process...');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 19, , 20]);
                    // Create migrations table if it doesn't exist
                    return [4 /*yield*/, sql.query("\n      CREATE TABLE IF NOT EXISTS migrations (\n        id SERIAL PRIMARY KEY,\n        name VARCHAR(255) NOT NULL UNIQUE,\n        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n      );\n    ")];
                case 2:
                    // Create migrations table if it doesn't exist
                    _a.sent();
                    return [4 /*yield*/, sql.query('SELECT name FROM migrations ORDER BY name')];
                case 3:
                    appliedResult = _a.sent();
                    appliedMigrations_1 = new Set(appliedResult.rows.map(function (row) { return row.name; }));
                    console.log("Found ".concat(appliedMigrations_1.size, " previously applied migrations"));
                    migrationsDir = path.join(process.cwd(), 'src', 'migrations');
                    migrationFiles = fs.readdirSync(migrationsDir)
                        .filter(function (file) { return file.endsWith('.sql'); })
                        .sort();
                    console.log("Found ".concat(migrationFiles.length, " migration files"));
                    pendingMigrations = migrationFiles.filter(function (file) { return !appliedMigrations_1.has(file); });
                    console.log("".concat(pendingMigrations.length, " migrations pending to be applied"));
                    // Run migrations that haven't been applied yet
                    console.log('Running migrations...');
                    _i = 0, migrationFiles_1 = migrationFiles;
                    _a.label = 4;
                case 4:
                    if (!(_i < migrationFiles_1.length)) return [3 /*break*/, 18];
                    file = migrationFiles_1[_i];
                    if (!!appliedMigrations_1.has(file)) return [3 /*break*/, 16];
                    console.log("Applying migration: ".concat(file));
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 14, , 15]);
                    filePath = path.join(migrationsDir, file);
                    sqlContent = fs.readFileSync(filePath, 'utf8');
                    // Begin transaction
                    return [4 /*yield*/, sql.query('BEGIN')];
                case 6:
                    // Begin transaction
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 11, , 13]);
                    // Execute the SQL
                    return [4 /*yield*/, sql.query(sqlContent)];
                case 8:
                    // Execute the SQL
                    _a.sent();
                    // Record that we've applied this migration
                    return [4 /*yield*/, sql.query('INSERT INTO migrations (name) VALUES ($1)', [file])];
                case 9:
                    // Record that we've applied this migration
                    _a.sent();
                    // Commit the transaction
                    return [4 /*yield*/, sql.query('COMMIT')];
                case 10:
                    // Commit the transaction
                    _a.sent();
                    console.log("Successfully applied migration: ".concat(file));
                    return [3 /*break*/, 13];
                case 11:
                    error_1 = _a.sent();
                    // If there's an error, roll back the transaction
                    return [4 /*yield*/, sql.query('ROLLBACK')];
                case 12:
                    // If there's an error, roll back the transaction
                    _a.sent();
                    console.error("Error applying migration ".concat(file, ":"), error_1);
                    throw error_1;
                case 13: return [3 /*break*/, 15];
                case 14:
                    error_2 = _a.sent();
                    console.error("Failed to apply migration ".concat(file, ":"), error_2);
                    process.exit(1);
                    return [3 /*break*/, 15];
                case 15: return [3 /*break*/, 17];
                case 16:
                    console.log("Migration already applied: ".concat(file));
                    _a.label = 17;
                case 17:
                    _i++;
                    return [3 /*break*/, 4];
                case 18:
                    console.log('All migrations completed successfully!');
                    return [3 /*break*/, 20];
                case 19:
                    error_3 = _a.sent();
                    console.error('Migration process encountered an error:', error_3);
                    process.exit(1);
                    return [3 /*break*/, 20];
                case 20: return [2 /*return*/];
            }
        });
    });
}
// Check if this file is being run directly
if (require.main === module) {
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
}
