import path from "node:path";
import { ParserPlugin } from "../types";

function matchPattern(filePath: string, patterns: string[]): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

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

export class PluginManager {
  private readonly plugins: ParserPlugin[] = [];

  register(plugin: ParserPlugin): void {
    const exists = this.plugins.some((p) => p.language_id === plugin.language_id);
    if (!exists) {
      this.plugins.push(plugin);
    }
  }

  registerMany(plugins: ParserPlugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  resolve(filePath: string): ParserPlugin | undefined {
    return this.plugins.find((plugin) => matchPattern(filePath, plugin.file_patterns));
  }

  list(): ParserPlugin[] {
    return [...this.plugins];
  }
}
