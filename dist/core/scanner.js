"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanProjectFiles = scanProjectFiles;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const DEFAULT_IGNORES = ["node_modules", "dist", ".git", ".idea", ".vscode"];
const DEFAULT_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py"];
function shouldIgnore(fullPath, ignoreTokens) {
    const normalized = fullPath.replace(/\\/g, "/");
    return ignoreTokens.some((token) => normalized.includes(token));
}
async function scanProjectFiles(projectPath, options = {}) {
    const ignore = [...DEFAULT_IGNORES, ...(options.ignore ?? [])];
    const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
    const files = [];
    const errors = [];
    const progress = {
        scanned_dirs: 0,
        scanned_files: 0,
        matched_files: 0,
    };
    async function walk(dir) {
        if (shouldIgnore(dir, ignore)) {
            return;
        }
        let entries;
        try {
            entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
            progress.scanned_dirs += 1;
            options.onProgress?.({ ...progress });
        }
        catch (error) {
            errors.push({
                level: "warning",
                file: dir,
                message: `无法读取目录: ${String(error)}`,
            });
            return;
        }
        await Promise.all(entries.map(async (entry) => {
            const fullPath = node_path_1.default.join(dir, entry.name);
            if (shouldIgnore(fullPath, ignore)) {
                return;
            }
            if (entry.isDirectory()) {
                await walk(fullPath);
                return;
            }
            if (!entry.isFile()) {
                return;
            }
            progress.scanned_files += 1;
            const ext = node_path_1.default.extname(entry.name).toLowerCase();
            if (extensions.includes(ext)) {
                files.push(fullPath);
                progress.matched_files += 1;
            }
            options.onProgress?.({ ...progress });
        }));
    }
    await walk(projectPath);
    files.sort();
    return {
        files,
        errors,
    };
}
//# sourceMappingURL=scanner.js.map