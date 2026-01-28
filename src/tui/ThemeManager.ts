/**
 * ThemeManager - Theme management utility for TUI components
 *
 * Provides centralized theme loading, caching, and color resolution
 * for terminal UI components. Integrates with ConfigLoader to access
 * theme configuration.
 */

import type { Theme, ColorStyle, ThemeColor } from '../config/theme.js';
import { ConfigLoader } from '../config/ConfigLoader.js';

/**
 * Blessed widget style (compatible with blessed library)
 */
export interface BlessedStyle {
  fg?: ThemeColor;
  bg?: ThemeColor;
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
}

/**
 * Blessed border style
 */
export interface BlessedBorderStyle {
  fg?: ThemeColor;
  bg?: ThemeColor;
}

/**
 * ThemeManager singleton for loading and caching theme configuration
 */
export class ThemeManager {
  private static instance: ThemeManager;
  private cachedTheme: Theme | null = null;
  private configLoader: ConfigLoader;

  private constructor() {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    ThemeManager.instance = undefined as any;
  }

  /**
   * Load and cache theme configuration
   */
  async loadTheme(forceReload: boolean = false): Promise<Theme> {
    if (this.cachedTheme && !forceReload) {
      return this.cachedTheme;
    }

    const themeConfig = await this.configLoader.getThemeConfig();
    const theme = themeConfig.resolved_theme;
    if (!theme) {
      throw new Error('Failed to load theme configuration');
    }
    this.cachedTheme = theme;

    return this.cachedTheme;
  }

  /**
   * Get the current theme (loads if not cached)
   */
  async getTheme(): Promise<Theme> {
    if (!this.cachedTheme) {
      return this.loadTheme();
    }
    return this.cachedTheme;
  }

  /**
   * Get UI element color style in blessed-compatible format
   */
  async getUIElementColor(elementName: keyof Theme['ui']): Promise<BlessedStyle> {
    const theme = await this.getTheme();
    const colorStyle = theme.ui[elementName] as ColorStyle;

    return this.toBlessedStyle(colorStyle);
  }

  /**
   * Get UI element border style in blessed-compatible format
   */
  async getUIElementBorderStyle(elementName: keyof Theme['ui']): Promise<BlessedBorderStyle | undefined> {
    const theme = await this.getTheme();
    const borderKey = `${elementName}Border` as keyof Theme['ui'];
    const borderStyle = theme.ui[borderKey] as any;

    if (!borderStyle) {
      return undefined;
    }

    return this.toBlessedBorderStyle(borderStyle);
  }

  /**
   * Get agent color by agent type
   */
  async getAgentColor(agentType: string): Promise<ThemeColor> {
    const theme = await this.getTheme();
    const color = theme.agents[agentType as keyof Theme['agents']];
    return color || theme.agents.default;
  }

  /**
   * Get message color by message type
   */
  async getMessageColor(messageType: keyof Theme['messages']): Promise<ThemeColor> {
    const theme = await this.getTheme();
    return theme.messages[messageType];
  }

  /**
   * Get complete theme object (for advanced use cases)
   */
  async getCompleteTheme(): Promise<Theme> {
    return this.getTheme();
  }

  /**
   * Clear cached theme (force reload on next access)
   */
  clearCache(): void {
    this.cachedTheme = null;
  }

  /**
   * Convert ColorStyle to BlessedStyle format
   */
  private toBlessedStyle(colorStyle: ColorStyle): BlessedStyle {
    const style: BlessedStyle = {};

    if (colorStyle.fg) {
      style.fg = colorStyle.fg;
    }

    if (colorStyle.bg) {
      style.bg = colorStyle.bg;
    }

    if (colorStyle.bold) {
      style.bold = colorStyle.bold;
    }

    if (colorStyle.underline) {
      style.underline = colorStyle.underline;
    }

    if (colorStyle.italic) {
      style.italic = colorStyle.italic;
    }

    return style;
  }

  /**
   * Convert BorderStyle to BlessedBorderStyle format
   */
  private toBlessedBorderStyle(borderStyle: any): BlessedBorderStyle {
    const style: BlessedBorderStyle = {};

    if (borderStyle.fg) {
      style.fg = borderStyle.fg;
    }

    if (borderStyle.bg) {
      style.bg = borderStyle.bg;
    }

    return style;
  }
}

/**
 * Convenience function to get theme manager instance
 */
export function getThemeManager(): ThemeManager {
  return ThemeManager.getInstance();
}

/**
 * Convenience function to load theme
 */
export async function loadTheme(): Promise<Theme> {
  return getThemeManager().loadTheme();
}

/**
 * Convenience function to get current theme
 */
export async function getTheme(): Promise<Theme> {
  return getThemeManager().getTheme();
}
