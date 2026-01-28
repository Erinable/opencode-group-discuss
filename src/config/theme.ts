/**
 * Theme Configuration for opencode-group-discuss TUI
 *
 * Provides configurable color themes with support for multiple color schemes
 * including high-contrast and color-blind-friendly palettes.
 *
 * Theme Configuration Location:
 * - group-discuss.json: tui.theme = 'default' | 'high-contrast' | 'protanopia' | 'deuteranopia' | 'tritanopia'
 * - Custom themes can be defined via tui.custom_theme
 */

/**
 * Color name type (blessed widget colors)
 */
export type ThemeColor =
  | 'black' | 'red' | 'green' | 'yellow' | 'blue'
  | 'magenta' | 'cyan' | 'white'
  | 'bright-black' | 'bright-red' | 'bright-green' | 'bright-yellow'
  | 'bright-blue' | 'bright-magenta' | 'bright-cyan' | 'bright-white'
  | 'grey' | 'gray';

/**
 * Color style for UI elements (foreground/background pair)
 */
export interface ColorStyle {
  /** Foreground color */
  fg?: ThemeColor;
  /** Background color */
  bg?: ThemeColor;
  /** Bold text */
  bold?: boolean;
  /** Underline text */
  underline?: boolean;
  /** Italic text */
  italic?: boolean;
}

/**
 * Border color style
 */
export interface BorderStyle {
  /** Border foreground color */
  fg?: ThemeColor;
  /** Border background color */
  bg?: ThemeColor;
}

/**
 * UI element colors
 */
export interface UIElementColors {
  /** Header style */
  header: ColorStyle;
  /** Header border style */
  headerBorder?: BorderStyle;
  /** Footer style */
  footer: ColorStyle;
  /** Footer border style */
  footerBorder?: BorderStyle;
  /** Log box style */
  logBox: ColorStyle;
  /** Log box border style */
  logBoxBorder?: BorderStyle;
  /** Scrollbar handle style */
  scrollbarHandle: ColorStyle;
  /** Scrollbar track style */
  scrollbarTrack: ColorStyle;
  /** History list style */
  historyList: ColorStyle;
  /** History list border style */
  historyListBorder?: BorderStyle;
  /** History list selected item style */
  historyListSelected: ColorStyle;
}

/**
 * Agent-specific colors for participant identification
 */
export interface AgentColors {
  /** Human agent color */
  human: ThemeColor;
  /** Planner agent color */
  planner: ThemeColor;
  /** Critic agent color */
  critic: ThemeColor;
  /** Default/unknown agent color */
  default: ThemeColor;
}

/**
 * Message type colors for semantic highlighting
 */
export interface MessageColors {
  /** Error message color */
  error: ThemeColor;
  /** Consensus message background color */
  consensusBg: ThemeColor;
  /** Consensus message foreground color */
  consensusFg: ThemeColor;
  /** Inline code color */
  inlineCode: ThemeColor;
  /** List bullet color */
  listBullet: ThemeColor;
}

/**
 * Complete theme definition
 */
export interface Theme {
  /** Theme name (for reference) */
  name: string;
  /** Theme description */
  description?: string;
  /** UI element colors */
  ui: UIElementColors;
  /** Agent colors */
  agents: AgentColors;
  /** Message colors */
  messages: MessageColors;
}

/**
 * Theme configuration override (for user customization)
 */
export interface ThemeOverride {
  /** Override UI colors */
  ui?: Partial<UIElementColors>;
  /** Override agent colors */
  agents?: Partial<AgentColors>;
  /** Override message colors */
  messages?: Partial<MessageColors>;
}

/**
 * Predefined theme names
 */
export type PredefinedTheme =
  | 'default'
  | 'high-contrast'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia';

/**
 * Default theme - matches current hardcoded colors for backward compatibility
 */
export const DEFAULT_THEME: Theme = {
  name: 'default',
  description: 'Default color scheme (backward compatible)',
  ui: {
    header: { fg: 'cyan', bg: 'black' },
    headerBorder: { fg: 'cyan' },
    footer: { fg: 'white', bg: 'black' },
    logBox: { fg: 'white', bg: 'black' },
    logBoxBorder: { fg: 'gray' },
    scrollbarHandle: { bg: 'cyan' },
    scrollbarTrack: { bg: 'black' },
    historyList: { fg: 'white', bg: 'black' },
    historyListBorder: { fg: 'yellow' },
    historyListSelected: { bg: 'blue', fg: 'white', bold: true },
  },
  agents: {
    human: 'cyan',
    planner: 'magenta',
    critic: 'red',
    default: 'green',
  },
  messages: {
    error: 'red',
    consensusBg: 'green',
    consensusFg: 'black',
    inlineCode: 'magenta',
    listBullet: 'cyan',
  },
};

/**
 * High-contrast theme - enhanced contrast for better visibility
 */
export const HIGH_CONTRAST_THEME: Theme = {
  name: 'high-contrast',
  description: 'High contrast theme for better visibility',
  ui: {
    header: { fg: 'bright-white', bg: 'black' },
    headerBorder: { fg: 'bright-white' },
    footer: { fg: 'bright-white', bg: 'black' },
    logBox: { fg: 'bright-white', bg: 'black' },
    logBoxBorder: { fg: 'bright-white' },
    scrollbarHandle: { bg: 'bright-white' },
    scrollbarTrack: { bg: 'black' },
    historyList: { fg: 'bright-white', bg: 'black' },
    historyListBorder: { fg: 'bright-white' },
    historyListSelected: { bg: 'bright-blue', fg: 'bright-white', bold: true },
  },
  agents: {
    human: 'bright-cyan',
    planner: 'bright-magenta',
    critic: 'bright-red',
    default: 'bright-green',
  },
  messages: {
    error: 'bright-red',
    consensusBg: 'bright-green',
    consensusFg: 'black',
    inlineCode: 'bright-magenta',
    listBullet: 'bright-cyan',
  },
};

/**
 * Protanopia theme - red-blind friendly palette
 * Avoids red/green confusion by substituting with blue/yellow shades
 */
export const PROTANOPIA_THEME: Theme = {
  name: 'protanopia',
  description: 'Red-blind friendly palette (avoids red/green confusion)',
  ui: {
    header: { fg: 'cyan', bg: 'black' },
    headerBorder: { fg: 'cyan' },
    footer: { fg: 'white', bg: 'black' },
    logBox: { fg: 'white', bg: 'black' },
    logBoxBorder: { fg: 'gray' },
    scrollbarHandle: { bg: 'cyan' },
    scrollbarTrack: { bg: 'black' },
    historyList: { fg: 'white', bg: 'black' },
    historyListBorder: { fg: 'yellow' },
    historyListSelected: { bg: 'blue', fg: 'white', bold: true },
  },
  agents: {
    human: 'cyan',
    planner: 'magenta',
    critic: 'blue',      // Changed from red to blue
    default: 'yellow',   // Changed from green to yellow
  },
  messages: {
    error: 'blue',       // Changed from red to blue
    consensusBg: 'yellow', // Changed from green to yellow
    consensusFg: 'black',
    inlineCode: 'magenta',
    listBullet: 'cyan',
  },
};

/**
 * Deuteranopia theme - green-blind friendly palette
 * Avoids red/green confusion by substituting with blue/yellow shades
 */
export const DEUTERANOPIA_THEME: Theme = {
  name: 'deuteranopia',
  description: 'Green-blind friendly palette (avoids red/green confusion)',
  ui: {
    header: { fg: 'cyan', bg: 'black' },
    headerBorder: { fg: 'cyan' },
    footer: { fg: 'white', bg: 'black' },
    logBox: { fg: 'white', bg: 'black' },
    logBoxBorder: { fg: 'gray' },
    scrollbarHandle: { bg: 'cyan' },
    scrollbarTrack: { bg: 'black' },
    historyList: { fg: 'white', bg: 'black' },
    historyListBorder: { fg: 'yellow' },
    historyListSelected: { bg: 'blue', fg: 'white', bold: true },
  },
  agents: {
    human: 'cyan',
    planner: 'magenta',
    critic: 'blue',      // Changed from red to blue
    default: 'yellow',   // Changed from green to yellow
  },
  messages: {
    error: 'blue',       // Changed from red to blue
    consensusBg: 'yellow', // Changed from green to yellow
    consensusFg: 'black',
    inlineCode: 'magenta',
    listBullet: 'cyan',
  },
};

/**
 * Tritanopia theme - blue-blind friendly palette
 * Avoids blue/yellow confusion by substituting with red/green shades
 */
export const TRITANOPIA_THEME: Theme = {
  name: 'tritanopia',
  description: 'Blue-blind friendly palette (avoids blue/yellow confusion)',
  ui: {
    header: { fg: 'green', bg: 'black' },
    headerBorder: { fg: 'green' },
    footer: { fg: 'white', bg: 'black' },
    logBox: { fg: 'white', bg: 'black' },
    logBoxBorder: { fg: 'gray' },
    scrollbarHandle: { bg: 'green' },
    scrollbarTrack: { bg: 'black' },
    historyList: { fg: 'white', bg: 'black' },
    historyListBorder: { fg: 'red' },
    historyListSelected: { bg: 'magenta', fg: 'white', bold: true },
  },
  agents: {
    human: 'green',
    planner: 'red',
    critic: 'red',
    default: 'green',
  },
  messages: {
    error: 'red',
    consensusBg: 'green',
    consensusFg: 'black',
    inlineCode: 'red',
    listBullet: 'green',
  },
};

/**
 * Map of predefined themes
 */
export const PREDEFINED_THEMES: Record<PredefinedTheme, Theme> = {
  default: DEFAULT_THEME,
  'high-contrast': HIGH_CONTRAST_THEME,
  protanopia: PROTANOPIA_THEME,
  deuteranopia: DEUTERANOPIA_THEME,
  tritanopia: TRITANOPIA_THEME,
};

/**
 * Get a predefined theme by name
 *
 * @param themeName - Name of the predefined theme
 * @returns Theme object or default theme if not found
 */
export function getPredefinedTheme(themeName: PredefinedTheme | string): Theme {
  return PREDEFINED_THEMES[themeName as PredefinedTheme] || DEFAULT_THEME;
}

/**
 * Merge theme overrides with a base theme
 *
 * @param baseTheme - Base theme to merge into
 * @param overrides - Theme overrides to apply
 * @returns Merged theme object
 */
export function mergeTheme(baseTheme: Theme, overrides: ThemeOverride): Theme {
  // Deep merge UI elements (each element is an object that may have partial overrides)
  const mergedUi: Theme['ui'] = { ...baseTheme.ui };
  if (overrides.ui) {
    for (const key in overrides.ui) {
      const elementKey = key as keyof Theme['ui'];
      const baseElement = baseTheme.ui[elementKey];
      const overrideElement = overrides.ui[elementKey];

      if (overrideElement && typeof overrideElement === 'object') {
        // Deep merge individual UI element properties
        mergedUi[elementKey] = { ...(baseElement || {}), ...overrideElement } as any;
      } else if (overrideElement) {
        mergedUi[elementKey] = overrideElement;
      }
    }
  }

  return {
    ...baseTheme,
    ui: mergedUi,
    agents: {
      ...baseTheme.agents,
      ...overrides.agents,
    },
    messages: {
      ...baseTheme.messages,
      ...overrides.messages,
    },
  };
}
