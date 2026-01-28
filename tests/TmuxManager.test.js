
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TmuxManager, setExecAsyncForTest, execAsync } from '../dist/core/tui/TmuxManager.js';

describe('TmuxManager', () => {
    let originalExec;
    let originalEnvTmux;

    beforeEach(() => {
        originalExec = execAsync;
        originalEnvTmux = process.env.TMUX;
    });

    afterEach(() => {
        setExecAsyncForTest(originalExec);
        if (originalEnvTmux === undefined) {
            delete process.env.TMUX;
        } else {
            process.env.TMUX = originalEnvTmux;
        }
        // Reset paneId state (not directly accessible, but cleanup relies on it)
        // We can't easily reset private static paneId, but we can ensure cleanup calls don't fail
    });

    test('isActive returns true if TMUX env var is set', () => {
        process.env.TMUX = '/tmp/tmux-1000/default,123,0';
        assert.strictEqual(TmuxManager.isActive(), true);
    });

    test('isActive returns false if TMUX env var is missing', () => {
        delete process.env.TMUX;
        assert.strictEqual(TmuxManager.isActive(), false);
    });

    test('initTranscriptPane splits window active', async () => {
        process.env.TMUX = '1';
        const mockPaneId = '%10';

        let capturedCmd = '';
        const mockExec = async (cmd) => {
            capturedCmd = cmd;
            return { stdout: mockPaneId + '\n', stderr: '' };
        };

        setExecAsyncForTest(mockExec);

        const paneId = await TmuxManager.initTranscriptPane('/tmp/log.txt', '/project/root');

        assert.strictEqual(paneId, mockPaneId);
        assert.ok(capturedCmd.includes('tmux split-window -h -l 40%'));
        assert.ok(capturedCmd.includes('node'));
        assert.ok(capturedCmd.includes('TranscriptViewer.js'));
        assert.ok(capturedCmd.includes('"/tmp/log.txt"'));
    });

    test('initTranscriptPane returns undefined/failure if exec throws', async () => {
        process.env.TMUX = '1';

        const mockExec = async () => {
            throw new Error('Tmux failed');
        };

        setExecAsyncForTest(mockExec);

        const paneId = await TmuxManager.initTranscriptPane('/tmp/log.txt', '/root');
        assert.strictEqual(paneId, undefined);
    });

    test('cleanupPane kills the pane if it was created', async () => {
        process.env.TMUX = '1';

        // Setup: Create pane first
        let execCalls = [];
        const mockExec = async (cmd) => {
            execCalls.push(cmd);
            return { stdout: '%20\n', stderr: '' };
        };
        setExecAsyncForTest(mockExec);

        await TmuxManager.initTranscriptPane('/log', '/root');

        // Act: Cleanup
        await TmuxManager.cleanupPane();

        // Assert
        const killCmd = execCalls.find(cmd => cmd.includes('tmux kill-pane'));
        assert.ok(killCmd, 'Should have called kill-pane');
        assert.ok(killCmd.includes('-t %20'), 'Should target correct pane ID');
    });

    test('cleanupPane does nothing if no pane created', async () => {
        // We can't easily access the private state, so we just run it and assume no error.
        // However, if we didn't init, it shouldn't call exec with kill-pane.

        // Since it is a static singleton, state might persist from previous tests if we are not careful?
        // In this test file, previous tests ran initTranscriptPane.
        // But `TmuxManager` module is loaded once.
        // Wait, the static `paneId` WILL persist across tests in the same process!
        // This is a downside of static singleton pattern in tests.

        // For this test to validity, we assume `cleanupPane` was called in previous test, resetting paneId to undefined?
        // In `cleanupPane logic`:
        // await execAsync(`tmux kill-pane -t ${this.paneId}`);
        // this.paneId = undefined;

        // So if the previous test called cleanupPane, the state is clear.
        // The previous test DID call cleanupPane.

        let execCalls = [];
        const mockExec = async (cmd) => {
            execCalls.push(cmd);
            return { stdout: '', stderr: '' };
        };
        setExecAsyncForTest(mockExec);

        await TmuxManager.cleanupPane();
        assert.strictEqual(execCalls.length, 0, 'Should not have called kill-pane');
    });
});
