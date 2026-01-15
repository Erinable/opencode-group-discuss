import { z } from 'zod';
import { EngineOptions } from './interfaces.js';
import { DiscussionParticipant } from '../../types/index.js';
import { AgentRegistry } from './AgentRegistry.js';

const ParticipantInputSchema = z.object({
  name: z.string().min(1, 'Participant name cannot be empty'),
  subagent_type: z.string().min(1).default('general'),
  role: z.string().optional()
});

const InputSchema = z.object({
  topic: z.string().min(1, 'Topic cannot be empty'),
  agents: z.array(z.string().min(1)).optional(),
  participants: z.array(ParticipantInputSchema).optional(),
  mode: z.enum(['debate', 'collaborative']).default('debate'),
  rounds: z.number().int().min(1, 'Rounds must be at least 1').max(10, 'Rounds cannot exceed 10').default(3),
  verbose: z.boolean().default(true),
  context: z.string().optional(),
  files: z.array(z.string()).optional(),
  keep_sessions: z.boolean().default(false),
  maxRetries: z.number().int().min(0, 'maxRetries cannot be negative').default(3),
  timeout: z.number().int().min(1000, 'Timeout must be at least 1000ms').default(600000),
  concurrency: z.number().int().min(1, 'Concurrency must be at least 1').default(2)
});

export class DiscussionFacade {
  static async transform(input: any): Promise<EngineOptions> {
    const normalized = this.normalizeInput(input);
    const result = InputSchema.safeParse(normalized);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }

    const data = result.data;
    const knownAgentIDs = await AgentRegistry.getAgentIDs();

    // 1. Validate 'agents' are known
    if (data.agents && data.agents.length > 0) {
      const unknown = data.agents.filter(id => !knownAgentIDs.has(id));
      if (unknown.length > 0) {
        throw new Error(
          `Unknown agents: ${unknown.join(', ')}. Available: ${Array.from(knownAgentIDs).join(', ')}`
        );
      }
    }

    // 2. Validate 'participants.subagent_type' are known
    if (data.participants && data.participants.length > 0) {
      const invalidTypes = data.participants
        .map(p => p.subagent_type)
        .filter(t => !knownAgentIDs.has(t));

      if (invalidTypes.length > 0) {
         const uniq = Array.from(new Set(invalidTypes));
         throw new Error(
           `Unknown subagent_type in participants: ${uniq.join(', ')}. Available: ${Array.from(knownAgentIDs).join(', ')}`
         );
      }
    }

    // 3. Determine final participants list
    // If no agents and no participants provided, use defaults based on mode
    let inputAgentIDs: string[] = [];

    if ((!data.agents || data.agents.length === 0) && (!data.participants || data.participants.length === 0)) {
       inputAgentIDs = this.getDefaultAgents(data.mode);
    } else {
       inputAgentIDs = data.agents || [];
    }

    const registeredConfigs = inputAgentIDs.map(id => ({
      name: id,
      subagentType: id,
      role: undefined
    }));

    const tempConfigs = (data.participants || []).map(p => ({
      name: p.name,
      subagentType: p.subagent_type,
      role: p.role
    }));

    // Merge: participants overwrite agents with same name
    const byName = new Map<string, any>();
    const order: string[] = [];

    for (const p of registeredConfigs) {
      if (!byName.has(p.name)) order.push(p.name);
      byName.set(p.name, p);
    }
    for (const p of tempConfigs) {
      if (!byName.has(p.name)) order.push(p.name);
      byName.set(p.name, p);
    }

    const finalParticipants = order.map(name => byName.get(name)).filter(Boolean);

    if (finalParticipants.length === 0) {
      throw new Error("No valid participants determined.");
    }

    return {
      topic: data.topic,
      participants: finalParticipants,
      maxRounds: data.rounds,
      mode: data.mode,
      verbose: data.verbose,
      context: data.context,
      files: data.files,
      keepSessions: data.keep_sessions,
      maxRetries: data.maxRetries,
      timeout: data.timeout,
      concurrency: data.concurrency
    };
   }

   private static normalizeInput(input: any) {
     const normalized: any = { ...input };

     if (Array.isArray(normalized.participants)) {
       normalized.participants = normalized.participants.map((p: any) => {
         const subagent_type = p?.subagent_type ?? p?.subagentType ?? 'general';
         return {
           ...p,
           subagent_type
         };
       });
     }

     if (normalized.keep_sessions === undefined && normalized.keepSessions !== undefined) {
       normalized.keep_sessions = normalized.keepSessions;
     }

     if (normalized.rounds === undefined && typeof normalized.maxRounds === 'number') {
       normalized.rounds = normalized.maxRounds;
     }

     return normalized;
   }

   private static getDefaultAgents(mode: string): string[] {
     switch (mode) {

      case 'debate':
        return ['advocate', 'critic', 'moderator'];
      default:
        return ['advocate', 'critic', 'moderator'];
    }
  }
}
