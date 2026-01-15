import EventEmitter from 'events';

/**
 * Mock OpenCode Client for Integration Tests
 * Simulates session management and prompt execution with delay/signal support.
 */
export class MockAgentClient {
  constructor() {
    this.sessions = new Map();
    // Use a proxy-like pattern to allow prompt to be overridden
    const self = this;
    this.session = {
      create: this.createSession.bind(this),
      delete: this.deleteSession.bind(this),
      // Use getter so prompt can be dynamically overridden
      get prompt() {
        return self._promptOverride || self.prompt.bind(self);
      },
      set prompt(fn) {
        self._promptOverride = fn;
      }
    };
    this._promptOverride = null;
    // Root session mock
    this.sessions.set('root-session', { id: 'root-session', children: [] });
  }

  async createSession(args) {
    const { parentID, title, signal } = args;
    if (signal?.aborted) throw new Error('Aborted before create');

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 10));

    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sessions.set(id, { id, parentID, title });

    if (parentID && this.sessions.has(parentID)) {
      this.sessions.get(parentID).children = this.sessions.get(parentID).children || [];
      this.sessions.get(parentID).children.push(id);
    }

    return { data: { id } };
  }

  async deleteSession(args) {
    const { path: { id } } = args;
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 5));
    this.sessions.delete(id);
    return { data: { success: true } };
  }

  async prompt(args) {
    const { body, path: { id }, signal } = args;

    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }

    // Simulate processing time
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (signal?.aborted) {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }

        // Mock response based on agent type
        const agentType = body.agent || 'unknown';
        resolve({
          data: {
            parts: [{ type: 'text', text: `Response from ${agentType} in session ${id}` }]
          }
        });
      }, 50); // 50ms simulated latency

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  }
}
