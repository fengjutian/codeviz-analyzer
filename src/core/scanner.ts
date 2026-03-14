import { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { AnalyzerDiagnostic, ScanOptions, ScanResult } from "../types";

const DEFAULT_IGNORES = ["node_modules", "dist", ".git", ".idea", ".vscode"];

function shouldIgnore(fullPath: string, ignoreTokens: string[]): boolean {
  const normalized = fullPath.replace(/\\/g, "/");
  return ignoreTokens.some((token) => normalized.includes(token));
}

export async function scanProjectFiles(projectPath: string, options: ScanOptions = {}): Promise<ScanResult> {
  const ignore = [...DEFAULT_IGNORES, ...(options.ignore ?? [])];
  const extensions = (options.extensions ?? []).map((ext) => ext.toLowerCase());
  const hasExtensionFilter = extensions.length > 0;
  const files: string[] = [];
  const errors: AnalyzerDiagnostic[] = [];

  const progress = {
    scanned_dirs: 0,
    scanned_files: 0,
    matched_files: 0,
  };

  async function walk(dir: string): Promise<void> {
    if (shouldIgnore(dir, ignore)) {
      return;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
      progress.scanned_dirs += 1;
      options.onProgress?.({ ...progress });
    } catch (error) {
      errors.push({
        level: "warning",
        file: dir,
        message: `无法读取目录: ${String(error)}`,
      });
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);

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
        const ext = path.extname(entry.name).toLowerCase();
        if (!hasExtensionFilter || extensions.includes(ext)) {
          files.push(fullPath);
          progress.matched_files += 1;
        }
        options.onProgress?.({ ...progress });
      }),
    );
  }

  await walk(projectPath);
  files.sort();

  return {
    files,
    errors,
  };
}
