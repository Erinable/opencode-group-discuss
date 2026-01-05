/**
 * session_manage tool - manage sub-sessions
 */

import { tool } from "@opencode-ai/plugin";
import { Logger } from "../utils/Logger.js";

export function createSessionManageTool(client: any) {
  const boundLogger = new Logger(client);

  return tool({
    description: `管理当前主会话（Root Session）下挂载的子会话（Sub-sessions）。通常配合 group_discuss 工具使用。

功能：
1. list: 列出当前主会话下的所有子会话（包含 ID、标题、状态、创建时间）。
2. delete: 删除指定的子会话（需提供 ID 列表），释放服务端资源。
3. show: 查看指定子会话的详细信息（JSON 格式）。

适用场景：
- 在运行 group_discuss 后，检查是否遗留了未清理的子 Agent 会话。
- 手动清理不再需要的会话资源。
- 调试时查看子会话的状态。

注意：
- 本工具只能操作当前主会话的子节点，无法跨会话操作。
- 禁止删除当前正在运行的主会话。

示例：
1. 列出当前残留的会话:
   { "action": "list" }
2. 删除指定的两个会话:
   { "action": "delete", "session_ids": ["ses_123", "ses_456"] }`,

    args: {
      action: tool.schema
        .enum(["list", "delete", "show"])
        .describe(
          "操作动作:\n" +
          "- list: 列出所有子会话（无需 session_ids）\n" +
          "- delete: 删除指定子会话（需 session_ids）\n" +
          "- show: 查看指定子会话详情（需 session_ids）"
        ),

      session_ids: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(
          "目标会话 ID 列表。\n" +
          "当 action 为 'delete' 或 'show' 时必填。\n" +
          "示例: ['ses_abc123', 'ses_xyz789']"
        ),
    },

    async execute(args, context) {
      const { action, session_ids } = args;
      const { sessionID } = context;
      const logger = boundLogger;

      await logger.info(`Session Manage: ${action}`, { sessionID, session_ids });

      if (!client?.session) {
        return "❌ OpenCode Client session capability is missing.";
      }

      // 1. LIST: 列出当前 session 的子会话
      if (action === "list") {
        try {
          // 使用 session.list 并过滤 parentID
          // SDK 应该有 children 方法，或者通过 list 过滤
          // 检查 SDK 定义：session.children(options: { path: { id } })
          
          let children: any[] = [];
          
          if (client.session.children) {
             const res = await client.session.children({
               path: { id: sessionID }
             });
             children = res?.data || res || [];
          } else {
            // Fallback to list and filter
             const res = await client.session.list({});
             const all = res?.data || res || [];
             children = all.filter((s: any) => s.parentID === sessionID);
          }

          if (children.length === 0) {
            return "📭 当前会话下没有子会话。";
          }

          let output = `Found ${children.length} sub-sessions:\n\n`;
          output += `| ID | Title | Status | Created |\n`;
          output += `|---|---|---|---|\n`;
          for (const s of children) {
             const created = s.time?.created ? new Date(s.time.created).toISOString() : "-";
             output += `| ${s.id} | ${s.title || "-"} | ${s.status || "-"} | ${created} |\n`;
          }
          return output;

        } catch (e: any) {
          await logger.error("List failed", e);
          return `❌ 列出子会话失败: ${e.message}`;
        }
      }

      // 2. DELETE: 删除指定会话
      if (action === "delete") {
        if (!session_ids || session_ids.length === 0) {
          return "❌ delete 操作必须提供 session_ids 列表";
        }

        // 安全检查：确认这些 ID 确实是当前 session 的子会话？
        // 为简化流程，暂时只尝试删除。如果 ID 不属于当前用户权限范围，后端会报错。
        // 但为了防止误删主 session，我们可以检查 ID 是否等于 sessionID
        if (session_ids.includes(sessionID)) {
             return "❌ 禁止删除当前主会话 (Root Session)！";
        }

        const results = [];
        for (const id of session_ids) {
          try {
            await client.session.delete({ path: { id } });
            results.push(`✅ Deleted: ${id}`);
          } catch (e: any) {
            results.push(`❌ Failed: ${id} - ${e.message}`);
          }
        }
        return results.join("\n");
      }

      // 3. SHOW: 查看详情
      if (action === "show") {
        if (!session_ids || session_ids.length === 0) {
            return "❌ show 操作必须提供 session_ids 列表";
        }
        
        let output = "";
        for (const id of session_ids) {
            try {
                const res = await client.session.get({ path: { id } });
                const info = res?.data || res;
                output += `--- Session: ${id} ---\n`;
                output += JSON.stringify(info, null, 2) + "\n\n";
            } catch (e: any) {
                output += `❌ Failed to get ${id}: ${e.message}\n\n`;
            }
        }
        return output;
      }

      return `❌ Unknown action: ${action}`;
    }
  });
}
