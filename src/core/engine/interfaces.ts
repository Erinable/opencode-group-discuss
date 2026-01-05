import { DiscussionMessage, DiscussionResult, DiscussionParticipant, DiscussionError } from '../../types/index.js';

export enum EngineState {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface EngineOptions {
  topic: string;
  participants: DiscussionParticipant[];
  maxRounds: number;
  mode: string; // 'debate' | 'collaborative' etc.
  verbose?: boolean;
  context?: string;
  files?: string[];
  keepSessions?: boolean;
  // Advanced options
  maxRetries?: number;
  timeout?: number;
  concurrency?: number;
}

export interface IDiscussionState {
  id: string;
  topic: string;
  status: EngineState;
  currentRound: number;
  maxRounds: number;
  messages: DiscussionMessage[];
  participants: DiscussionParticipant[];
  subSessionIds: Record<string, string>; // agentName -> sessionId
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
  error?: Error;
  errors?: DiscussionError[];
  stopReason?: string;
}

export interface IDiscussionContext {
  readonly id: string;
  readonly options: EngineOptions;
  state: IDiscussionState;
  
  getLogger(): any;
  getSessionId(agentName: string): string | undefined;
  setSessionId(agentName: string, sessionId: string): void;
}

export interface DispatchOptions {
  priority?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface IDispatcher {
  dispatch<T>(task: (signal: AbortSignal) => Promise<T>, options?: DispatchOptions): Promise<T>;
  shutdown(options?: { awaitIdle?: boolean }): Promise<void>;
  getPendingCount(): number;
}

export interface IDiscussionEngine {
  init(options: EngineOptions): Promise<void>;
  run(): Promise<DiscussionResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(reason?: string): Promise<void>;
  getState(): IDiscussionState;
}

export interface IContextPruner {
  prune(messages: DiscussionMessage[], maxTokens: number): Promise<DiscussionMessage[]>;
}
