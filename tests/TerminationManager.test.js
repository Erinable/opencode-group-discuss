
import { test } from 'node:test';
import assert from 'node:assert';
import { TerminationManager } from '../dist/core/termination/TerminationManager.js';

// Helper to create minimal consensus report
const createConsensusReport = (overallScore = 0.5, convergenceRate = 0, disagreements = []) => ({
    overallScore,
    convergenceRate,
    agreementMatrix: {},
    mainClaims: [],
    stances: [],
    disagreements,
    recommendation: overallScore >= 0.8 ? 'conclude' : 'continue'
});

// Helper to create termination context
const createContext = (options = {}) => ({
    messages: options.messages || [],
    currentRound: options.currentRound || 1,
    maxRounds: options.maxRounds || 5,
    consensusReport: options.consensusReport || createConsensusReport(),
    mode: options.mode || 'debate',
    elapsedTime: options.elapsedTime || 0
});

test('TerminationManager: does not terminate on empty messages', async (t) => {
    const manager = new TerminationManager();
    
    const signal = await manager.shouldTerminate(createContext());
    
    assert.strictEqual(signal.shouldStop, false);
});

test('TerminationManager: terminates on explicit consensus tag', async (t) => {
    const manager = new TerminationManager();
    
    const context = createContext({
        messages: [
            { agent: 'A', content: '【达成共识】方案确定', round: 1, timestamp: 1 }
        ]
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, true);
    assert.ok(signal.reason.includes('explicit_consensus'), `Reason should include condition name: ${signal.reason}`);
    assert.strictEqual(signal.confidence, 1.0);
});

test('TerminationManager: terminates on high consensus score', async (t) => {
    const manager = new TerminationManager();
    
    const context = createContext({
        messages: [
            { agent: 'A', content: 'agree', round: 1, timestamp: 1 },
            { agent: 'B', content: 'agree', round: 1, timestamp: 2 }
        ],
        consensusReport: createConsensusReport(0.9)
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, true);
    assert.ok(signal.reason.includes('high_consensus'), `Reason should include high_consensus: ${signal.reason}`);
});

test('TerminationManager: terminates on convergence plateau', async (t) => {
    const manager = new TerminationManager();
    
    const context = createContext({
        messages: [
            { agent: 'A', content: 'proposal', round: 1, timestamp: 1 },
            { agent: 'B', content: 'agree', round: 1, timestamp: 2 },
            { agent: 'A', content: 'confirmed', round: 2, timestamp: 3 },
            { agent: 'B', content: 'ok', round: 2, timestamp: 4 }
        ],
        currentRound: 2,
        consensusReport: createConsensusReport(0.65, 0.02) // Low convergence rate, moderate consensus
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, true);
    assert.ok(signal.reason.includes('convergence_plateau'), `Reason should include convergence_plateau: ${signal.reason}`);
});

test('TerminationManager: terminates on timeout', async (t) => {
    const manager = new TerminationManager();
    
    const context = createContext({
        messages: [
            { agent: 'A', content: 'test', round: 1, timestamp: 1 }
        ],
        elapsedTime: 11 * 60 * 1000 // 11 minutes (> 10 min timeout)
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, true);
    assert.ok(signal.reason.includes('timeout'), `Reason should include timeout: ${signal.reason}`);
});

test('TerminationManager: terminates on stalemate with blocking disagreement', async (t) => {
    const manager = new TerminationManager([], { 
        enableStalemateDetection: true,
        stalemateRounds: 2
    });
    
    const context = createContext({
        messages: [
            { agent: 'A', content: 'X', round: 1, timestamp: 1 },
            { agent: 'B', content: 'disagree', round: 1, timestamp: 2 },
            { agent: 'A', content: 'still X', round: 2, timestamp: 3 },
            { agent: 'B', content: 'still disagree', round: 2, timestamp: 4 }
        ],
        currentRound: 3,
        consensusReport: createConsensusReport(0.3, -0.1, [
            { claimId: 'c1', supporters: ['A'], opposers: ['B'], severity: 'blocking' }
        ])
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, true);
    assert.ok(signal.reason.includes('stalemate'), `Reason should include stalemate: ${signal.reason}`);
});

test('TerminationManager: collaborative mode terminates at lower threshold', async (t) => {
    const manager = new TerminationManager();
    
    const context = createContext({
        messages: [
            { agent: 'A', content: 'plan', round: 1, timestamp: 1 },
            { agent: 'B', content: 'ok', round: 1, timestamp: 2 }
        ],
        mode: 'collaborative',
        consensusReport: createConsensusReport(0.78) // 78% > 75% collaborative threshold
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, true);
    assert.ok(signal.reason.includes('collaborative_consensus'), `Reason should include collaborative_consensus: ${signal.reason}`);
});

test('TerminationManager: custom conditions take priority', async (t) => {
    const customCondition = {
        name: 'custom_stop',
        priority: 200, // Higher than default
        check: async (ctx) => ({
            shouldStop: ctx.messages.some(m => m.content.includes('STOP_NOW')),
            reason: 'Custom stop triggered',
            confidence: 1.0
        })
    };
    
    const manager = new TerminationManager([customCondition]);
    
    const context = createContext({
        messages: [
            { agent: 'A', content: 'STOP_NOW please', round: 1, timestamp: 1 }
        ]
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, true);
    assert.ok(signal.reason.includes('custom_stop'), `Reason should include custom_stop: ${signal.reason}`);
});

test('TerminationManager: respects min confidence threshold', async (t) => {
    const lowConfidenceCondition = {
        name: 'low_confidence_stop',
        priority: 200,
        check: async () => ({
            shouldStop: true,
            reason: 'Low confidence trigger',
            confidence: 0.5 // Below default 0.7 threshold
        })
    };
    
    const manager = new TerminationManager([lowConfidenceCondition], { minConfidence: 0.7 });
    
    const context = createContext({
        messages: [{ agent: 'A', content: 'test', round: 1, timestamp: 1 }]
    });
    
    const signal = await manager.shouldTerminate(context);
    
    assert.strictEqual(signal.shouldStop, false, 'Should not stop with low confidence');
});

test('TerminationManager: addCondition works correctly', async (t) => {
    const manager = new TerminationManager();
    
    const initialNames = manager.getConditionNames();
    
    manager.addCondition({
        name: 'new_condition',
        priority: 50,
        check: async () => ({ shouldStop: false, confidence: 0 })
    });
    
    const newNames = manager.getConditionNames();
    
    assert.strictEqual(newNames.length, initialNames.length + 1);
    assert.ok(newNames.includes('new_condition'));
});

test('TerminationManager: removeCondition works correctly', async (t) => {
    const manager = new TerminationManager();
    
    const initialNames = manager.getConditionNames();
    assert.ok(initialNames.includes('timeout'));
    
    const removed = manager.removeCondition('timeout');
    
    assert.strictEqual(removed, true);
    assert.ok(!manager.getConditionNames().includes('timeout'));
});

test('TerminationManager: getConditionNames returns sorted by priority', async (t) => {
    const manager = new TerminationManager();
    
    const names = manager.getConditionNames();
    
    // explicit_consensus should be first (priority 100)
    assert.strictEqual(names[0], 'explicit_consensus');
    // timeout should be last among defaults (priority 50)
    assert.ok(names.indexOf('timeout') > names.indexOf('high_consensus'));
});
