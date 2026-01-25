/**
 * OpenCode Group Discuss Plugin
 *
 * Enables multi-agent group discussions in OpenCode
 *
 * @see https://github.com/opencode-ai/opencode-group-discuss
 */

import type { Plugin } from "@opencode-ai/plugin";
import { createGroupDiscussTool } from "./tools/group-discuss.js";
import { createGroupDiscussContextTool } from "./tools/group-discuss-context.js";
import { createSessionManageTool } from "./tools/session-manage.js";
import { Logger } from "./utils/Logger.js";
import { getConfigLoader } from "./config/ConfigLoader.js";

/**
 * Main plugin export
 */
export const GroupDiscussPlugin: Plugin = async (ctx) => {
  const { client, directory } = ctx;
  const logger = new Logger(client);

  // Bind config loader singleton to OpenCode project root.
  // Downstream code that calls getConfigLoader() will inherit this root.
  getConfigLoader(directory);

  logger.info("插件已加载").catch(() => {});
  logger.info(`项目目录: ${directory}`).catch(() => {});

  return {
    // 注册自定义工具（绑定 client）
    tool: {
      group_discuss: createGroupDiscussTool(client, directory),
      group_discuss_context: createGroupDiscussContextTool(directory),
      session_manage: createSessionManageTool(client),
    },

    // 使用统一的 event 钩子监听所有事件
    event: async ({ event }) => {
      switch (event.type) {
        case "session.deleted":
          // 可以在这里清理该 session 的讨论数据
          const deletedSession = (event as any).properties?.info;
          if (deletedSession?.id) {
            await logger.info(`Session ${deletedSession.id} 已删除`);
          }
          break;
        case "session.created":
          const createdSession = (event as any).properties?.info;
          if (createdSession?.id) {
            await logger.info(`Session ${createdSession.id} 已创建`);
          }
          break;
        case "session.idle":
          // 会话空闲（任务完成）
          const idleSessionID = (event as any).properties?.sessionID;
          if (idleSessionID) {
            await logger.debug(`Session ${idleSessionID} 空闲`);
          }
          break;
      }
    },
  };
};

// Default export for CommonJS compatibility
export default GroupDiscussPlugin;
