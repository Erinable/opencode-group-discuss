
/**
 * panel_control tool - manage the transcript tui panel
 */

import { tool } from "@opencode-ai/plugin/tool";
import { Logger } from "../utils/Logger.js";
import { TmuxManager } from "../core/tui/TmuxManager.js";
import { getConfigLoader } from "../config/ConfigLoader.js";
import * as fs from 'fs';
import * as path from 'path';

export function createPanelControlTool(client: any, directory: string): any {
  const logger = new Logger(client);

  return tool({
    description: `管理右侧的 Transcript Panel (TUI 面板)。

功能：
1. open: 打开面板，自动加载最新的 Transcript 历史记录。如果是 live 状态则显示 live。
2. close: 强制关闭面板。

使用场景：
- 用户想要手动查看讨论记录。
- 任务结束后，重新呼出面板进行复盘。
- 只有在 Tmux 环境下有效。`,

    args: {
      action: tool.schema
        .enum(["open", "close"])
        .describe("操作动作: open (打开/重置面板) | close (关闭面板)"),
    },

    async execute(args, context) {
      const { action } = args;

      // Resolve project root from directory
      const configLoader = getConfigLoader(directory);
      const projectRoot = configLoader.getProjectRoot();

      if (action === "close") {
          await TmuxManager.cleanupPane(projectRoot);
          return "✅ Panel closed.";
      }

      if (action === "open") {
          // Find latest log
          const logDir = path.join(projectRoot, '.opencode', 'logs');
          if (!fs.existsSync(logDir)) {
              return "❌ No logs directory found.";
          }

          const files = fs.readdirSync(logDir);
          const logs = files
              .filter(f => f.startsWith('transcript-') && f.endsWith('.log'))
              .map(f => {
                  try {
                      const stats = fs.statSync(path.join(logDir, f));
                      return { name: f, time: stats.mtime.getTime() };
                  } catch {
                      return { name: f, time: 0 };
                  }
              })
              .sort((a, b) => b.time - a.time);

          const latestLog = logs[0];
          if (!latestLog) {
              return "❌ No transcript logs found to display.";
          }

          const logPath = path.join(logDir, latestLog.name);

          try {
             // initTranscriptPane will kill existing pane automatically due to shared state
             const paneId = await TmuxManager.initTranscriptPane(logPath, projectRoot);

             if (paneId) {
                 // Persist it so it doesn't close immediately if we were to treat this as ephemeral process
                 // But TmuxManager persistence is per-process.
                 // Here we are running inside the Plugin Server process (likely).
                 // If the Plugin Server runs long-term (daemon), we DO want to persist it?
                 // Wait, if the Plugin Server exits, the pane closes (if cleanup listeners are active).
                 // Yes, we want the pane to stay open even if the plugin server restarts or whatever.
                 // So we call persistPane().
                 TmuxManager.persistPane();
                 return `✅ Panel opened (ID: ${paneId}) showing ${latestLog.name}`;
             } else {
                 return "❌ Failed to create Tmux pane (Tmux not active?)";
             }
          } catch (e: any) {
              return `❌ Error opening pane: ${e.message}`;
          }
      }

      return `❌ Unknown action: ${action}`;
    }
  });
}
