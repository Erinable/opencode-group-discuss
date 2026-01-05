import * as fs from 'fs/promises';
import { constants } from 'fs';

export class AsyncFS {
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
