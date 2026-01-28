import { exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';

export let execAsync = util.promisify(exec);

export function setExecAsyncForTest(mockFn: any) {
  execAsync = mockFn;
}

export class TmuxManager {
  private static paneId?: string;

  /**
   * Checks if the current process is running inside a Tmux session.
   */
  static isActive(): boolean {
    return !!process.env.TMUX;
  }

  /**
   * Initializes the transcript pane using a separate TUI viewer script.
   * Splits the current window horizontally (side-by-side) by default.
   * @param logFilePath The absolute path to the transcript log file.
   * @param projectRoot The project root to locate the viewer script.
   */
  static async initTranscriptPane(logFilePath: string, projectRoot: string): Promise<string | undefined> {
    if (!this.isActive()) return undefined;

    // Ensure any previous pane is closed to prevent accumulation
    await this.cleanupPane(projectRoot);

    try {
      // Path to the compiled viewer script
      // Assumes the code is compiled to dist/
      // We need to resolve the path relative to the package location
      // Using a heuristic based on projectRoot might be risky if installed globally vs locally.
      // But given this is a plugin, we can try to find the viewer script relative to THIS file's execution or projectRoot.

      // Better approach: Use the current module's path to find the viewer in basic dist structure
      // If we are in dist/core/tui/TmuxManager.js, viewer is at dist/tui/TranscriptViewer.js
      // ../../tui/TranscriptViewer.js

      // However, we are writing TS source here.
      // At runtime:
      // dist/src/core/tui/TmuxManager.js (if structure preserved) or dist/core/tui/...
      // Let's assume standard tsc output: dist/core/tui/TmuxManager.js

      // Actually, we can pass the viewer script path explicitly or calculate it.
      // For now, let's try to deduce it from __dirname (esm issue? we are using module types?)
      // The project seems to use "type": "module".

      // Let's rely on absolute path construction from projectRoot if possible,
      // but projectRoot is the *user's* project, not the *plugin's* source location.

      // We need to know where the plugin is installed.
      // We can use `import.meta.url` if this is ESM.

      const viewerScriptPath = path.resolve(
        new URL('.', import.meta.url).pathname,
        '../../tui/TranscriptViewer.js'
      );

      // Clean path for shell command
      const cleanLogPath = `"${logFilePath}"`;
      const cleanScriptPath = `"${viewerScriptPath}"`;

      // Command: node viewerScript logPath
      const cmd = `node ${cleanScriptPath} ${cleanLogPath}`;

      // Split window horizontally (-h) with size 40% (-l 40%)
      // -P to print information (we want the pane id)
      // -F "#{pane_id}" to get only the ID
      const { stdout } = await execAsync(`tmux split-window -h -l 40% -P -F "#{pane_id}" ${cmd}`);

      const paneId = stdout.trim();
      this.paneId = paneId;

      // Define cleanup handler
      this.cleanupHandler = () => {
         if (this.paneId) {
           try {
             require('child_process').execSync(`tmux kill-pane -t ${this.paneId}`);
           } catch (e) { /* ignore */ }
         }
      };

      // Register cleanup on process exit
      ['SIGINT', 'SIGTERM', 'exit'].forEach((signal) => {
        process.on(signal, this.cleanupHandler);
      });

      // Persist pane ID to file for cross-process coordination
      try {
          const pidFile = this.getPaneIdFile(projectRoot);
          require('fs').writeFileSync(pidFile, paneId);
      } catch (e) { /* ignore */ }

      return paneId;
    } catch (error) {
      console.error('Failed to init Tmux transcript pane:', error);
      return undefined;
    }
  }

  /**
   * Detaches the pane from the current process's lifecycle.
   * The pane will NOT be killed when this process exits.
   */
  static persistPane() {
    if (this.cleanupHandler) {
      ['SIGINT', 'SIGTERM', 'exit'].forEach((signal) => {
        process.removeListener(signal, this.cleanupHandler);
      });
      this.cleanupHandler = ()=> {};
      this.paneId = undefined; // Prevent manual cleanup
    }
  }

  private static cleanupHandler: () => void = () => {};

  /**
   * Closes the transcript pane if it was created by this manager OR found in lockfile.
   */
  static async cleanupPane(projectRoot?: string): Promise<void> {
    // 1. Check in-memory ID
    let pid = this.paneId;

    // 2. Check on-disk ID (if projectRoot provided) or try to resolve it
    if (!pid && projectRoot) {
        try {
            const pidFile = this.getPaneIdFile(projectRoot);
            if (require('fs').existsSync(pidFile)) {
                pid = require('fs').readFileSync(pidFile, 'utf8').trim();
            }
        } catch (e) { /* ignore */ }
    }

    if (pid) {
      try {
        await execAsync(`tmux kill-pane -t ${pid}`);
      } catch (error) {
        // Ignore error if pane is already gone
      }
      this.paneId = undefined;
    }

    // Always try to clean up the file
    if (projectRoot) {
        try {
            const pidFile = this.getPaneIdFile(projectRoot);
            if (require('fs').existsSync(pidFile)) {
                require('fs').unlinkSync(pidFile);
            }
        } catch (e) { /* ignore */ }
    }
  }

  private static getPaneIdFile(projectRoot: string): string {
      return path.join(projectRoot, '.opencode', '.tmux-pane-id');
  }
}

