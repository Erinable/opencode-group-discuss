import { AsyncFS } from '../../utils/AsyncFS.js';
import * as path from 'path';

/**
 * AgentRegistry caches known agent IDs to avoid repeated disk IO.
 */
export class AgentRegistry {
  private static cache: Set<string> | null = null;
  private static initialized = false;

  static async getAgentIDs(): Promise<Set<string>> {
    if (this.cache && this.initialized) return this.cache;
    await this.load();
    return this.cache || new Set(['general', 'explore']);
  }

  private static async load() {
    const ids = new Set<string>(['general', 'explore']);
    try {
      const configPath = path.resolve(process.cwd(), 'opencode.json');
      const exists = await AsyncFS.exists(configPath);
      if (exists) {
        const raw = await AsyncFS.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const agent = parsed?.agent;
        if (agent && typeof agent === 'object') {
          for (const key of Object.keys(agent)) {
            ids.add(key);
          }
        }
      }
    } catch {
      // ignore
    }
    this.cache = ids;
    this.initialized = true;
  }
}
