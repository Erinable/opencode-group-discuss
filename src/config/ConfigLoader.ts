/**
 * ConfigLoader - Configuration file loader and merger
 * 
 * Loads configuration from project-level and global-level files,
 * merges them with proper precedence.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  GroupDiscussConfig,
  DiscussionPreset,
  DiscussionDefaults,
  ConsensusConfigOverride,
  TerminationConfigOverride,
  ContextCompactionConfigOverride,
  LoggingConfigOverride,
  DebugConfigOverride,
} from './schema.js';
import { DEFAULT_CONFIG, CONFIG_FILE_NAME } from './schema.js';

/**
 * Resolved configuration with all values populated
 */
export interface ResolvedConfig {
  defaults: Required<DiscussionDefaults>;
  presets: Record<string, DiscussionPreset>;
  consensus: Required<ConsensusConfigOverride>;
  termination: Required<TerminationConfigOverride>;
  context_compaction: Required<ContextCompactionConfigOverride>;
  logging: Required<LoggingConfigOverride>;
  debug: Required<DebugConfigOverride>;
}

/**
 * ConfigLoader singleton for loading and caching configuration
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private cachedConfig: ResolvedConfig | null = null;
  private projectRoot: string;

  private constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Get singleton instance
   */
  static getInstance(projectRoot?: string): ConfigLoader {
    if (!ConfigLoader.instance || (projectRoot && ConfigLoader.instance.projectRoot !== projectRoot)) {
      ConfigLoader.instance = new ConfigLoader(projectRoot);
    }
    return ConfigLoader.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    ConfigLoader.instance = undefined as any;
  }

  /**
   * Load and merge configuration from all sources
   */
  async loadConfig(forceReload: boolean = false): Promise<ResolvedConfig> {
    if (this.cachedConfig && !forceReload) {
      return this.cachedConfig;
    }

    // Load configs in order of precedence (later overrides earlier)
    const globalConfig = await this.loadGlobalConfig();
    const projectConfig = await this.loadProjectConfig();

    // Merge configs
    const merged = this.mergeConfigs(DEFAULT_CONFIG, globalConfig, projectConfig);

    // Resolve to ensure all required fields are present
    this.cachedConfig = this.resolveConfig(merged);

    return this.cachedConfig;
  }

  /**
   * Get a specific preset by name
   */
  async getPreset(name: string): Promise<DiscussionPreset | undefined> {
    const config = await this.loadConfig();
    return config.presets[name];
  }

  /**
   * Get all preset names
   */
  async getPresetNames(): Promise<string[]> {
    const config = await this.loadConfig();
    return Object.keys(config.presets);
  }

  /**
   * Get default values
   */
  async getDefaults(): Promise<Required<DiscussionDefaults>> {
    const config = await this.loadConfig();
    return config.defaults;
  }

  /**
   * Get consensus configuration
   */
  async getConsensusConfig(): Promise<Required<ConsensusConfigOverride>> {
    const config = await this.loadConfig();
    return config.consensus;
  }

  /**
   * Get termination configuration
   */
  async getTerminationConfig(): Promise<Required<TerminationConfigOverride>> {
    const config = await this.loadConfig();
    return config.termination;
  }

  /**
   * Get context compaction configuration
   */
  async getContextCompactionConfig(): Promise<Required<ContextCompactionConfigOverride>> {
    const config = await this.loadConfig();
    return config.context_compaction;
  }

  /**
   * Load global configuration file
   */
  private async loadGlobalConfig(): Promise<GroupDiscussConfig> {
    const globalPath = path.join(os.homedir(), '.config', 'opencode', CONFIG_FILE_NAME);
    return this.loadConfigFile(globalPath);
  }

  /**
   * Load project-level configuration file
   */
  private async loadProjectConfig(): Promise<GroupDiscussConfig> {
    const projectPath = path.join(this.projectRoot, '.opencode', CONFIG_FILE_NAME);
    return this.loadConfigFile(projectPath);
  }

  /**
   * Load a single configuration file
   */
  private async loadConfigFile(filePath: string): Promise<GroupDiscussConfig> {
    try {
      if (!fs.existsSync(filePath)) {
        return {};
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Strip comments (JSONC support) - simple implementation
      const jsonContent = this.stripJsonComments(content);
      
      const config = JSON.parse(jsonContent) as GroupDiscussConfig;
      return config;
    } catch (error) {
      // Log warning but don't fail - use empty config
      console.warn(`[GroupDiscuss] Failed to load config from ${filePath}:`, error);
      return {};
    }
  }

  /**
   * Strip single-line and multi-line comments from JSON (JSONC support)
   */
  private stripJsonComments(content: string): string {
    // Remove single-line comments (// ...)
    let result = content.replace(/\/\/[^\n\r]*/g, '');
    // Remove multi-line comments (/* ... */)
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  /**
   * Deep merge multiple configs (later overrides earlier)
   */
  private mergeConfigs(...configs: GroupDiscussConfig[]): GroupDiscussConfig {
    const result: GroupDiscussConfig = {};

    for (const config of configs) {
      if (!config) continue;

      // Merge defaults
      if (config.defaults) {
        result.defaults = { ...result.defaults, ...config.defaults };
      }

      // Merge presets (each preset is merged individually)
      if (config.presets) {
        result.presets = result.presets || {};
        for (const [name, preset] of Object.entries(config.presets)) {
          result.presets[name] = { ...result.presets[name], ...preset };
        }
      }

      // Merge consensus config
      if (config.consensus) {
        result.consensus = {
          ...result.consensus,
          ...config.consensus,
          // Deep merge keyword_weights
          keyword_weights: {
            ...result.consensus?.keyword_weights,
            ...config.consensus.keyword_weights,
          },
        };
      }

      // Merge termination config
      if (config.termination) {
        result.termination = {
          ...result.termination,
          ...config.termination,
          // Arrays are replaced, not merged
          disabled_conditions: config.termination.disabled_conditions ?? result.termination?.disabled_conditions,
        };
      }

      // Merge context compaction config
      if (config.context_compaction) {
        result.context_compaction = {
          ...result.context_compaction,
          ...config.context_compaction,
          keyword_weights: {
            ...result.context_compaction?.keyword_weights,
            ...config.context_compaction.keyword_weights,
          },
        };
      }

      // Merge logging config
      if (config.logging) {
        result.logging = {
          ...result.logging,
          ...config.logging,
        };
      }

      // Merge debug config
      if (config.debug) {
        result.debug = {
          ...result.debug,
          ...config.debug,
        };
      }
    }

    return result;
  }

  /**
   * Resolve config to ensure all required fields have values
   */
  private resolveConfig(config: GroupDiscussConfig): ResolvedConfig {
    const defaultDefaults = DEFAULT_CONFIG.defaults;
    return {
      defaults: {
        mode: config.defaults?.mode ?? defaultDefaults.mode,
        rounds: config.defaults?.rounds ?? defaultDefaults.rounds,
        timeout: config.defaults?.timeout ?? defaultDefaults.timeout,
        concurrency: config.defaults?.concurrency ?? defaultDefaults.concurrency,
        verbose: config.defaults?.verbose ?? defaultDefaults.verbose,
        keep_sessions: config.defaults?.keep_sessions ?? defaultDefaults.keep_sessions,
        max_retries: config.defaults?.max_retries ?? defaultDefaults.max_retries,
      },
      presets: config.presets ?? {},
      consensus: {
        threshold: config.consensus?.threshold ?? DEFAULT_CONFIG.consensus.threshold,
        enable_convergence_analysis: config.consensus?.enable_convergence_analysis ?? DEFAULT_CONFIG.consensus.enable_convergence_analysis,
        stalemate_window: config.consensus?.stalemate_window ?? DEFAULT_CONFIG.consensus.stalemate_window,
        keyword_weights: config.consensus?.keyword_weights ?? {},
      },
      termination: {
        min_confidence: config.termination?.min_confidence ?? DEFAULT_CONFIG.termination.min_confidence,
        enable_stalemate_detection: config.termination?.enable_stalemate_detection ?? DEFAULT_CONFIG.termination.enable_stalemate_detection,
        stalemate_rounds: config.termination?.stalemate_rounds ?? DEFAULT_CONFIG.termination.stalemate_rounds,
        disabled_conditions: config.termination?.disabled_conditions ?? [],
      },
      context_compaction: {
        max_context_chars: config.context_compaction?.max_context_chars ?? DEFAULT_CONFIG.context_compaction.max_context_chars,
        compaction_threshold: config.context_compaction?.compaction_threshold ?? DEFAULT_CONFIG.context_compaction.compaction_threshold,
        max_message_length: config.context_compaction?.max_message_length ?? DEFAULT_CONFIG.context_compaction.max_message_length,
        preserve_recent_rounds: config.context_compaction?.preserve_recent_rounds ?? DEFAULT_CONFIG.context_compaction.preserve_recent_rounds,
        enable_key_info_extraction: config.context_compaction?.enable_key_info_extraction ?? DEFAULT_CONFIG.context_compaction.enable_key_info_extraction,
        keyword_weights: config.context_compaction?.keyword_weights ?? {},
        include_self_history: config.context_compaction?.include_self_history ?? DEFAULT_CONFIG.context_compaction.include_self_history,
      },

      logging: {
        level: config.logging?.level ?? DEFAULT_CONFIG.logging.level,
        console_enabled: config.logging?.console_enabled ?? DEFAULT_CONFIG.logging.console_enabled,
        file_enabled: config.logging?.file_enabled ?? DEFAULT_CONFIG.logging.file_enabled,
        file_path: config.logging?.file_path ?? DEFAULT_CONFIG.logging.file_path,
        include_meta: config.logging?.include_meta ?? DEFAULT_CONFIG.logging.include_meta,
        max_entry_chars: config.logging?.max_entry_chars ?? DEFAULT_CONFIG.logging.max_entry_chars,
        max_meta_chars: config.logging?.max_meta_chars ?? DEFAULT_CONFIG.logging.max_meta_chars,
      },

      debug: {
        log_prompts: config.debug?.log_prompts ?? DEFAULT_CONFIG.debug.log_prompts,
        log_context: config.debug?.log_context ?? DEFAULT_CONFIG.debug.log_context,
        log_compaction: config.debug?.log_compaction ?? DEFAULT_CONFIG.debug.log_compaction,
      },
    };
  }

  /**
   * Set project root (for testing or dynamic context)
   */
  setProjectRoot(projectRoot: string): void {
    this.projectRoot = projectRoot;
    this.cachedConfig = null; // Invalidate cache
  }

  /**
   * Get current project root
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Clear cached config
   */
  clearCache(): void {
    this.cachedConfig = null;
  }
}

/**
 * Convenience function to get config loader instance
 */
export function getConfigLoader(projectRoot?: string): ConfigLoader {
  return ConfigLoader.getInstance(projectRoot);
}

/**
 * Convenience function to load config
 */
export async function loadConfig(projectRoot?: string): Promise<ResolvedConfig> {
  return getConfigLoader(projectRoot).loadConfig();
}
