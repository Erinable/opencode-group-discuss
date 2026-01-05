import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { EngineOptions } from './interfaces.js';
import { DiscussionParticipant } from '../../types/index.js';

const ParticipantInputSchema = z.object({
  name: z.string(),
  subagent_type: z.string().default('general'),
  role: z.string().optional()
});

const InputSchema = z.object({
  topic: z.string(),
  agents: z.array(z.string()).optional(),
  participants: z.array(ParticipantInputSchema).optional(),
  mode: z.enum(['debate', 'collaborative']).default('debate'),
  rounds: z.number().min(1).max(10).default(3),
  verbose: z.boolean().default(true),
  context: z.string().optional(),
  files: z.array(z.string()).optional(),
  keep_sessions: z.boolean().default(false),
  maxRetries: z.number().default(3),
  timeout: z.number().default(600000), // 10 minutes
  concurrency: z.number().default(2) // Default to 2 for better performance
});

export class DiscussionFacade {
  static transform(input: any): EngineOptions {
    const result = InputSchema.safeParse(input);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }
    
    const data = result.data;
    const knownAgentIDs = this.loadKnownAgentIDs();

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

  private static getDefaultAgents(mode: string): string[] {
    switch (mode) {
      case 'debate':
        return ['advocate', 'critic', 'moderator'];
      default:
        // For collaborative or others, we can default to general agents or specific ones
        // But the original code defaulted to debate agents for everything.
        // Let's stick to original behavior or improve?
        // Original: default: return ["advocate", "critic", "moderator"];
        return ['advocate', 'critic', 'moderator'];
    }
  }

  private static loadKnownAgentIDs(): Set<string> {
    const ids = new Set<string>(['general', 'explore']);
    try {
      const configPath = path.resolve(process.cwd(), 'opencode.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const agent = parsed?.agent;
        if (agent && typeof agent === 'object') {
          for (const key of Object.keys(agent)) {
            ids.add(key);
          }
        }
      }
    } catch {
      // ignore
    }
    return ids;
  }
}
