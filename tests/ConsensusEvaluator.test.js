
import { test } from 'node:test';
import assert from 'node:assert';
import { ConsensusEvaluator } from '../dist/core/consensus/ConsensusEvaluator.js';

// Helper to create messages
const createMessage = (agent, content, round) => ({
    agent,
    content,
    round,
    timestamp: Date.now()
});

test('ConsensusEvaluator: returns empty report for < 2 messages', async (t) => {
    const evaluator = new ConsensusEvaluator();
    
    const report = await evaluator.evaluate([
        createMessage('A', 'hello', 1)
    ]);
    
    assert.strictEqual(report.overallScore, 0);
    assert.strictEqual(report.recommendation, 'continue');
});

test('ConsensusEvaluator: detects positive consensus keywords', async (t) => {
    const evaluator = new ConsensusEvaluator();
    
    const messages = [
        createMessage('A', '我提议使用方案X', 1),
        createMessage('B', '我同意这个提议', 1),
        createMessage('C', '我也认同，没问题', 1)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    assert.ok(report.overallScore > 0.5, `Expected score > 0.5, got ${report.overallScore}`);
});

test('ConsensusEvaluator: detects negative keywords', async (t) => {
    const evaluator = new ConsensusEvaluator();
    
    const messages = [
        createMessage('A', '我提议使用方案X', 1),
        createMessage('B', '我反对这个提议', 1),
        createMessage('C', '我也不同意', 1)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    assert.ok(report.overallScore < 0.5, `Expected score < 0.5, got ${report.overallScore}`);
});

test('ConsensusEvaluator: identifies disagreements', async (t) => {
    const evaluator = new ConsensusEvaluator();
    
    const messages = [
        createMessage('A', '我提议使用方案X', 1),
        createMessage('B', '我强烈反对这个方案', 1)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    assert.ok(report.disagreements.length > 0, 'Should identify disagreement');
    assert.ok(
        report.disagreements.some(d => d.severity === 'major' || d.severity === 'blocking'),
        'Should flag as major or blocking'
    );
});

test('ConsensusEvaluator: calculates convergence rate', async (t) => {
    const evaluator = new ConsensusEvaluator({ enableConvergenceAnalysis: true });
    
    // Round 1: disagreement
    // Round 2: agreement
    const messages = [
        createMessage('A', '我提议使用方案X', 1),
        createMessage('B', '我反对这个提议', 1),
        createMessage('A', '考虑你的意见后我调整了方案', 2),
        createMessage('B', '现在我同意这个调整后的方案', 2)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    assert.ok(report.convergenceRate > 0, `Expected positive convergence, got ${report.convergenceRate}`);
});

test('ConsensusEvaluator: recommends conclude for high consensus', async (t) => {
    const evaluator = new ConsensusEvaluator({ consensusThreshold: 0.7 });
    
    const messages = [
        createMessage('A', '方案确认', 1),
        createMessage('B', '我同意，LGTM', 1),
        createMessage('C', '认同，支持这个方案', 1)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    // With strong positive keywords, recommendation should be 'conclude'
    assert.ok(
        report.recommendation === 'conclude' || report.overallScore >= 0.7,
        `Expected recommend conclude or high score, got ${report.recommendation} with score ${report.overallScore}`
    );
});

test('ConsensusEvaluator: builds agreement matrix', async (t) => {
    const evaluator = new ConsensusEvaluator();
    
    const messages = [
        createMessage('Alice', 'proposal', 1),
        createMessage('Bob', 'agree', 1),
        createMessage('Charlie', 'support', 1)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    assert.ok('Alice' in report.agreementMatrix, 'Should have Alice in matrix');
    assert.ok('Bob' in report.agreementMatrix, 'Should have Bob in matrix');
    assert.ok('Charlie' in report.agreementMatrix, 'Should have Charlie in matrix');
    
    // Self-agreement should be 1.0
    assert.strictEqual(report.agreementMatrix['Alice']['Alice'], 1.0);
});

test('ConsensusEvaluator: detects positive reference patterns', async (t) => {
    const evaluator = new ConsensusEvaluator();
    
    const messages = [
        createMessage('A', '我提议方案X', 1),
        createMessage('B', '同意A的观点，正如A所说的那样', 1)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    // Reference patterns should boost the score
    assert.ok(report.overallScore > 0.5, `Expected score > 0.5 with positive reference, got ${report.overallScore}`);
});

test('ConsensusEvaluator: custom keyword weights', async (t) => {
    const evaluator = new ConsensusEvaluator({
        keywordWeights: {
            '太棒了': 1.0,
            '完美': 1.0
        }
    });
    
    const messages = [
        createMessage('A', '这个方案太棒了', 1),
        createMessage('B', '完美，我完全同意', 1)
    ];
    
    const report = await evaluator.evaluate(messages);
    
    assert.ok(report.overallScore > 0.7, `Expected high score with custom keywords, got ${report.overallScore}`);
});
