"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginManager = void 0;
const node_path_1 = __importDefault(require("node:path"));
function matchPattern(filePath, patterns) {
    const fileName = node_path_1.default.basename(filePath).toLowerCase();
    const ext = node_path_1.default.extname(filePath).toLowerCase();
    return patterns.some((pattern) => {
        const p = pattern.toLowerCase().trim();
        if (p.startsWith("*.")) {
            return ext === p.slice(1);
        }
        if (p.startsWith(".")) {
            return ext === p;
        }
        return fileName === p;
    });
}
class PluginManager {
    constructor() {
        this.plugins = [];
    }
    register(plugin) {
        const exists = this.plugins.some((p) => p.language_id === plugin.language_id);
        if (!exists) {
            this.plugins.push(plugin);
        }
    }
    registerMany(plugins) {
        for (const plugin of plugins) {
            this.register(plugin);
        }
    }
    resolve(filePath) {
        return this.plugins.find((plugin) => matchPattern(filePath, plugin.file_patterns));
    }
    list() {
        return [...this.plugins];
    }
}
exports.PluginManager = PluginManager;
//# sourceMappingURL=pluginManager.js.map