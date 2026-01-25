/**
 * group_discuss_context tool - show effective context budgeting
 */

import { tool } from "@opencode-ai/plugin";
import { getConfigLoader } from "../config/ConfigLoader.js";

export function createGroupDiscussContextTool(): any {
  return tool({
    description: "Show effective context budget and derived limits for group_discuss.",
    args: {
      help: tool.schema
        .boolean()
        .default(false)
        .describe("Show usage help"),
    },
    async execute(args) {
      if (args.help) {
        return `## group_discuss_context\n\nShows the resolved context budgeting configuration and derived character limits used by group_discuss.`;
      }

      const configLoader = getConfigLoader();
      const config = await configLoader.loadConfig();

      const budget = config.context_budget;
      const cc = config.context_compaction;

      const availableTokens = Math.max(
        0,
        (budget.input_tokens || 0) - (budget.min_output_tokens || 0) - (budget.reasoning_headroom_tokens || 0)
      );
      const derivedChars = Math.max(2000, Math.floor(availableTokens * (budget.chars_per_token || 4)));

      return [
        "## group_discuss context budget",
        "",
        `profile: ${budget.profile}`,
        `input_tokens: ${budget.input_tokens}`,
        `min_output_tokens: ${budget.min_output_tokens}`,
        `reasoning_headroom_tokens: ${budget.reasoning_headroom_tokens}`,
        `chars_per_token: ${budget.chars_per_token}`,
        "",
        `available_input_tokens: ${availableTokens}`,
        `derived_max_context_chars: ${derivedChars}`,
        "",
        "## effective context_compaction",
        "",
        `max_context_chars: ${cc.max_context_chars}`,
        `max_message_length: ${cc.max_message_length}`,
        `preserve_recent_rounds: ${cc.preserve_recent_rounds}`,
        `compaction_threshold: ${cc.compaction_threshold}`,
        `enable_key_info_extraction: ${cc.enable_key_info_extraction}`,
        `include_self_history: ${cc.include_self_history}`,
      ].join("\n");
    },
  });
}
