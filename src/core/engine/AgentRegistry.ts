import { AsyncFS } from '../../utils/AsyncFS.js';
import * as path from 'path';
import { getConfigLoader } from '../../config/ConfigLoader.js';

/**
 * AgentRegistry caches known agent IDs to avoid repeated disk IO.
 */
export class AgentRegistry {
  private static cache: Map<string, Set<string>> = new Map();

  static async getAgentIDs(): Promise<Set<string>> {
    const projectRoot = getConfigLoader().getProjectRoot();
    const cached = this.cache.get(projectRoot);
    if (cached) return cached;
    await this.load(projectRoot);
    return this.cache.get(projectRoot) || new Set(['general', 'explore']);
  }

  private static async load(projectRoot: string) {
    const ids = new Set<string>(['general', 'explore']);
    try {
      const configPath = path.resolve(projectRoot, 'opencode.json');
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
    this.cache.set(projectRoot, ids);
  }
}
