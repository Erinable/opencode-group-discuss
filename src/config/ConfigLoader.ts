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
  ResolvedContextCompactionConfig,
  ContextBudgetConfigOverride,
  ContextBudgetProfile,
  LoggingConfigOverride,
  DebugConfigOverride,
  TuiConfigOverride,
} from './schema.js';
import type { Theme } from './theme.js';
import type { ThemeConfigOverride } from './schema.js';
import { DEFAULT_CONFIG, CONFIG_FILE_NAME } from './schema.js';
import { getPredefinedTheme, mergeTheme } from './theme.js';

/**
 * Resolved configuration with all values populated
 */
export interface ResolvedConfig {
  defaults: Required<DiscussionDefaults>;
  presets: Record<string, DiscussionPreset>;
  consensus: Required<ConsensusConfigOverride>;
  termination: Required<TerminationConfigOverride>;
  context_compaction: ResolvedContextCompactionConfig;
  context_budget: Required<ContextBudgetConfigOverride>;
  logging: Required<LoggingConfigOverride>;
  debug: Required<DebugConfigOverride>;
  tui: Required<Omit<TuiConfigOverride, 'theme'>> & { theme: Required<ThemeConfigOverride> & { resolved_theme: Theme } };
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
  async getContextCompactionConfig(): Promise<ResolvedContextCompactionConfig> {
    const config = await this.loadConfig();
    return config.context_compaction;
  }

  /**
   * Get theme configuration
   */
  async getThemeConfig(): Promise<Required<ThemeConfigOverride> & { resolved_theme: Theme }> {
    const config = await this.loadConfig();
    return config.tui.theme;
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

      // Merge context budget config
      if (config.context_budget) {
        result.context_budget = {
          ...result.context_budget,
          ...config.context_budget,
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

      // Merge TUI config
      if (config.tui) {
        result.tui = {
          ...result.tui,
          ...config.tui,
          // Deep merge theme config
          theme: {
            theme: config.tui.theme?.theme ?? result.tui?.theme?.theme,
            custom_theme: {
              ...result.tui?.theme?.custom_theme,
              ...config.tui.theme?.custom_theme,
            },
          },
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

    const resolvedBudget = this.resolveContextBudget(config.context_budget);
    const derivedMaxContextChars = this.deriveMaxContextChars(resolvedBudget);
    const derivedMaxMessageLength = this.deriveMaxMessageLength(resolvedBudget);

    const rawMaxContextChars = config.context_compaction?.max_context_chars;
    const rawMaxMessageLength = config.context_compaction?.max_message_length;

    const resolvedMaxContextChars =
      typeof rawMaxContextChars === 'number'
        ? rawMaxContextChars
        : derivedMaxContextChars;

    const resolvedMaxMessageLength =
      typeof rawMaxMessageLength === 'number'
        ? rawMaxMessageLength
        : derivedMaxMessageLength;

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
        max_context_chars: resolvedMaxContextChars,
        compaction_threshold: config.context_compaction?.compaction_threshold ?? DEFAULT_CONFIG.context_compaction.compaction_threshold,
        max_message_length: resolvedMaxMessageLength,
        preserve_recent_rounds: config.context_compaction?.preserve_recent_rounds ?? DEFAULT_CONFIG.context_compaction.preserve_recent_rounds,
        enable_key_info_extraction: config.context_compaction?.enable_key_info_extraction ?? DEFAULT_CONFIG.context_compaction.enable_key_info_extraction,
        keyword_weights: config.context_compaction?.keyword_weights ?? {},
        include_self_history: config.context_compaction?.include_self_history ?? DEFAULT_CONFIG.context_compaction.include_self_history,
      },

      context_budget: resolvedBudget,

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
      tui: {
        enable_transcript: config.tui?.enable_transcript ?? DEFAULT_CONFIG.tui.enable_transcript,
        use_tmux: config.tui?.use_tmux ?? DEFAULT_CONFIG.tui.use_tmux,
        tmux_pane_orientation: config.tui?.tmux_pane_orientation ?? DEFAULT_CONFIG.tui.tmux_pane_orientation,
        theme: this.resolveThemeConfig(config.tui?.theme),
      },
    };
  }

  /**
   * Resolve theme configuration
   */
  private resolveThemeConfig(themeConfig?: ThemeConfigOverride): Required<ThemeConfigOverride> & { resolved_theme: Theme } {
    const themeName = themeConfig?.theme ?? DEFAULT_CONFIG.tui.theme.theme;
    const customTheme = themeConfig?.custom_theme;

    // Get the base predefined theme
    const baseTheme = getPredefinedTheme(themeName);

    // Merge custom overrides if provided
    const resolvedTheme = customTheme ? mergeTheme(baseTheme, customTheme) : baseTheme;

    return {
      theme: themeName,
      custom_theme: customTheme ?? {},
      resolved_theme: resolvedTheme,
    };
  }

  private resolveContextBudget(input?: ContextBudgetConfigOverride): Required<ContextBudgetConfigOverride> {
    const profile = (input?.profile ?? DEFAULT_CONFIG.context_budget.profile) as ContextBudgetProfile;
    const defaults = DEFAULT_CONFIG.context_budget;

    return {
      profile,
      input_tokens: input?.input_tokens ?? defaults.input_tokens,
      min_output_tokens: input?.min_output_tokens ?? defaults.min_output_tokens,
      reasoning_headroom_tokens: input?.reasoning_headroom_tokens ?? defaults.reasoning_headroom_tokens,
      chars_per_token: input?.chars_per_token ?? defaults.chars_per_token,
    };
  }

  private deriveMaxContextChars(budget: Required<ContextBudgetConfigOverride>): number {
    const charsPerToken = Number.isFinite(budget.chars_per_token) && (budget.chars_per_token as number) > 0
      ? (budget.chars_per_token as number)
      : 4;
    const inputTokens = Math.max(0, Math.floor(budget.input_tokens as number));
    const reserveOut = Math.max(0, Math.floor(budget.min_output_tokens as number));
    const headroom = Math.max(0, Math.floor(budget.reasoning_headroom_tokens as number));
    const available = Math.max(0, inputTokens - reserveOut - headroom);
    // Hard floor to keep context useful even with aggressive budgets.
    return Math.max(2000, Math.floor(available * charsPerToken));
  }

  private deriveMaxMessageLength(budget: Required<ContextBudgetConfigOverride>): number {
    switch (budget.profile as ContextBudgetProfile) {
      case 'small':
        return 300;
      case 'large':
        return 800;
      default:
        return 500;
    }
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
