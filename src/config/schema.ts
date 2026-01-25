/**
 * Configuration Schema for opencode-group-discuss
 * 
 * Configuration file locations (in order of precedence):
 * 1. .opencode/group-discuss.json (project-level, highest priority)
 * 2. ~/.config/opencode/group-discuss.json (global-level)
 */

import type { ConsensusConfig } from '../core/consensus/types.js';
import type { TerminationConfig } from '../core/termination/types.js';

/**
 * Participant definition for presets
 */
export interface PresetParticipant {
  /** Display name in the discussion */
  name: string;
  /** Registered subagent type (e.g., 'advocate', 'critic', 'general') */
  subagent_type: string;
  /** Optional role description for prompt injection */
  role?: string;
}

/**
 * Preset configuration for quick reuse
 */
export interface DiscussionPreset {
  /** List of registered agent names */
  agents?: string[];
  /** Custom participants (overrides agents if provided) */
  participants?: PresetParticipant[];
  /** Discussion mode */
  mode?: 'debate' | 'collaborative';
  /** Number of rounds */
  rounds?: number;
  /** Additional context */
  context?: string;
  /** Reference files */
  files?: string[];
}

/**
 * Default values for discussions
 */
export interface DiscussionDefaults {
  /** Default discussion mode */
  mode?: 'debate' | 'collaborative';
  /** Default number of rounds (1-10) */
  rounds?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Concurrency level for parallel agent calls */
  concurrency?: number;
  /** Show verbose output */
  verbose?: boolean;
  /** Keep sub-sessions after discussion (for debugging) */
  keep_sessions?: boolean;
  /** Maximum retries for failed agent calls */
  max_retries?: number;
}

/**
 * Consensus evaluation configuration
 */
export interface ConsensusConfigOverride {
  /** Consensus threshold (0.5-1.0) to recommend conclusion */
  threshold?: number;
  /** Enable convergence analysis between rounds */
  enable_convergence_analysis?: boolean;
  /** Number of rounds to detect stalemate */
  stalemate_window?: number;
  /** Custom keyword weights for consensus detection */
  keyword_weights?: Record<string, number>;
}

/**
 * Termination condition configuration
 */
export interface TerminationConfigOverride {
  /** Minimum confidence threshold (0.5-1.0) */
  min_confidence?: number;
  /** Enable stalemate detection */
  enable_stalemate_detection?: boolean;
  /** Number of rounds to detect stalemate */
  stalemate_rounds?: number;
  /** Disabled built-in termination conditions */
  disabled_conditions?: string[];
}

/**
 * Context compaction configuration
 */
export interface ContextCompactionConfigOverride {
  /** Maximum context character count */
  max_context_chars?: number;
  /** Compaction trigger threshold (0-1) */
  compaction_threshold?: number;
  /** Max characters per message */
  max_message_length?: number;
  /** Preserve full messages in last N rounds */
  preserve_recent_rounds?: number;
  /** Enable key info extraction */
  enable_key_info_extraction?: boolean;
  /** Keyword weights for importance scoring */
  keyword_weights?: Record<string, number>;

  /** Include current agent's own history in injected context */
  include_self_history?: boolean;
}

/**
 * Logging configuration
 */
export interface LoggingConfigOverride {
  /** Minimum log level */
  level?: 'error' | 'warn' | 'info' | 'debug';

  /** Enable console logging */
  console_enabled?: boolean;

  /** Enable file logging */
  file_enabled?: boolean;

  /** File path for logs (relative paths are resolved from process.cwd()) */
  file_path?: string;

  /** Include meta payload in log output */
  include_meta?: boolean;

  /** Max characters per log entry (message + meta) */
  max_entry_chars?: number;

  /** Max characters for meta JSON stringification */
  max_meta_chars?: number;
}

/**
 * Debug instrumentation switches
 */
export interface DebugConfigOverride {
  /** Log full prompts (truncated by logger limits) */
  log_prompts?: boolean;

  /** Log built context injected to agents (truncated by logger limits) */
  log_context?: boolean;

  /** Log context compaction decision + stats */
  log_compaction?: boolean;
}

/**
 * Main configuration interface for group-discuss.json
 */
export interface GroupDiscussConfig {
  /** JSON Schema URL (for editor validation) */
  $schema?: string;

  /** Default values for all discussions */
  defaults?: DiscussionDefaults;

  /** Named presets for quick reuse */
  presets?: Record<string, DiscussionPreset>;

  /** Consensus evaluation configuration */
  consensus?: ConsensusConfigOverride;

  /** Termination condition configuration */
  termination?: TerminationConfigOverride;

  /** Context compaction configuration */
  context_compaction?: ContextCompactionConfigOverride;

  /** Logging configuration */
  logging?: LoggingConfigOverride;

  /** Debug instrumentation */
  debug?: DebugConfigOverride;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: {
  defaults: Required<DiscussionDefaults>;
  presets: Record<string, DiscussionPreset>;
  consensus: Required<ConsensusConfigOverride>;
  termination: Required<TerminationConfigOverride>;
  context_compaction: Required<ContextCompactionConfigOverride>;
  logging: Required<LoggingConfigOverride>;
  debug: Required<DebugConfigOverride>;
} = {
  defaults: {
    mode: 'debate',
    rounds: 3,
    timeout: 600000, // 10 minutes
    concurrency: 2,
    verbose: true,
    keep_sessions: false,
    max_retries: 3,
  },
  presets: {},
  consensus: {
    threshold: 0.8,
    enable_convergence_analysis: true,
    stalemate_window: 2,
    keyword_weights: {},
  },
  termination: {
    min_confidence: 0.7,
    enable_stalemate_detection: true,
    stalemate_rounds: 3,
    disabled_conditions: [],
  },
  context_compaction: {
    max_context_chars: 32000,
    compaction_threshold: 0.8,
    max_message_length: 500,
    preserve_recent_rounds: 1,
    enable_key_info_extraction: true,
    keyword_weights: {},
    include_self_history: false,
  },

  logging: {
    level: 'info',
    console_enabled: true,
    file_enabled: true,
    file_path: 'group_discuss.log',
    include_meta: true,
    max_entry_chars: 8000,
    max_meta_chars: 4000,
  },

  debug: {
    log_prompts: false,
    log_context: false,
    log_compaction: false,
  },
};

/**
 * Configuration file name
 */
export const CONFIG_FILE_NAME = 'group-discuss.json';

/**
 * Configuration file locations (in order of precedence)
 */
export const CONFIG_LOCATIONS = {
  /** Project-level config (highest priority) */
  project: `.opencode/${CONFIG_FILE_NAME}`,
  /** Global-level config */
  global: `~/.config/opencode/${CONFIG_FILE_NAME}`,
};
