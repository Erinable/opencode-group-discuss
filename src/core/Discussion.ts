import type {
  DiscussionConfig,
  DiscussionResult,
} from "../types/index.js";
import { Logger } from "../utils/Logger.js";
import { DiscussionEngine } from "./engine/DiscussionEngine.js";
import { DiscussionFacade } from "./engine/DiscussionFacade.js";

/**
 * Facade class to maintain backward compatibility with the original Discussion class.
 * Delegates actual logic to the new DiscussionEngine.
 */
export class Discussion {
  private engine: DiscussionEngine;
  private config: DiscussionConfig;

  constructor(config: DiscussionConfig, client: any, sessionID: string, logger?: Logger) {
    this.config = config;
    this.engine = new DiscussionEngine(client, sessionID, logger);
  }

  async start(): Promise<DiscussionResult> {
    // 1. Adapter Logic: Convert legacy Config (with instantiated Mode) to EngineOptions (with string Mode)
    let modeStr = 'debate';
    const modeInstance = this.config.mode;
    const ctorName = modeInstance?.constructor?.name || '';
    
    if (ctorName.includes('Collaborative')) {
        modeStr = 'collaborative';
    } else {
        modeStr = 'debate';
    }

    // 2. Prepare raw input for Facade validation
    const participants = this.config.participants?.map((p) => ({
      ...p,
      subagent_type: (p as any).subagent_type ?? p.subagentType
    }));

    const keep_sessions = (this.config as any).keep_sessions ?? this.config.keepSessions;

    const rawInput = {
      ...this.config,
      participants,
      keep_sessions,
      mode: modeStr
    };

    // 3. Transform and Validate (async)
    const options = await DiscussionFacade.transform(rawInput);
    
    // 4. Init Engine
    await this.engine.init(options);
    
    // 5. Run
    return await this.engine.run();
  }
}
