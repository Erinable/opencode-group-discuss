import * as fs from 'fs/promises';
import { constants } from 'fs';
import type { Stats } from 'fs';
import * as path from 'path';

export class AsyncFS {
  private static rootRealCache = new Map<string, string>();

  static async realpath(p: string): Promise<string> {
    return fs.realpath(p);
  }

  static async stat(p: string): Promise<Stats> {
    return fs.stat(p);
  }

  private static async getRootReal(projectRoot: string): Promise<string> {
    const cached = this.rootRealCache.get(projectRoot);
    if (cached) return cached;
    const resolved = await this.realpath(projectRoot);
    this.rootRealCache.set(projectRoot, resolved);
    return resolved;
  }

  /**
   * Resolve a user-provided path safely within projectRoot.
   * - relative paths resolve against projectRoot
   * - canonicalizes via realpath to prevent symlink escapes
   * - rejects any resolved path outside projectRoot
   */
  static async safeResolve(projectRoot: string, unsafePath: string): Promise<string> {
    const rootReal = await this.getRootReal(projectRoot);
    const candidate = path.isAbsolute(unsafePath)
      ? unsafePath
      : path.resolve(rootReal, unsafePath);

    let fileReal: string;
    try {
      fileReal = await this.realpath(candidate);
    } catch {
      const err: any = new Error(`E_FILE_NOT_FOUND: ${unsafePath}`);
      err.code = 'E_FILE_NOT_FOUND';
      throw err;
    }

    const rootWithSep = rootReal.endsWith(path.sep) ? rootReal : (rootReal + path.sep);
    const inside = fileReal === rootReal || fileReal.startsWith(rootWithSep);
    if (!inside) {
      const err: any = new Error(`E_FILE_SANDBOX: ${unsafePath}`);
      err.code = 'E_FILE_SANDBOX';
      throw err;
    }

    return fileReal;
  }

  /**
   * Asynchronously reads the entire contents of a file.
   */
  static async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    return fs.readFile(path, { encoding });
  }

  /**
   * Asynchronously tests whether or not the given path exists by checking access.
   */
  static async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Asynchronously reads multiple files.
   */
  static async readFiles(paths: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const promises = paths.map(async (p) => {
      try {
        const content = await this.readFile(p);
        result[p] = content;
      } catch (e) {
        result[p] = `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
      }
    });
    await Promise.all(promises);
    return result;
  }
}
