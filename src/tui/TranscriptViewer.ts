import blessed from 'blessed';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

// Get log file path from args
const liveLogFilePath = process.argv[2];

if (!liveLogFilePath) {
  console.error('Usage: node TranscriptViewer.js <logFilePath>');
  process.exit(1);
}

// Global State
let isLiveMode = true;
let tailProcess: ChildProcess | null = null;
let autoScroll = true;

// Terminal Size Validation
function validateTerminalSize(): void {
  const minWidth = 80;
  const minHeight = 24;

  const columns = process.stdout.columns;
  const rows = process.stdout.rows;

  if (columns < minWidth || rows < minHeight) {
    console.error('\nError: Terminal size is too small.');
    console.error(`Minimum required: ${minWidth}x${minHeight} (columns x rows)`);
    console.error(`Current terminal: ${columns}x${rows}`);
    console.error('\nPlease resize your terminal and try again.\n');
    process.exit(1);
  }
}

// Validate terminal size before creating screen
validateTerminalSize();

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  title: '📢 OpenCode Group Discussion Transcript'
});

// --- Widgets ---

// Header
const header = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  content: '{bold}📢 Group Discussion Transcript{/bold}\n{center}Initializing...{/center}',
  tags: true,
  style: {
    fg: 'cyan',
    bg: 'black',
    border: { fg: 'cyan' } // If border renders
  }
});

// Log Box (Main Content)
const logBox = blessed.log({
  top: 3,
  left: 0,
  width: '100%',
  height: '100%-4',
  content: '',
  tags: true,
  border: { type: 'line' },
  scrollable: true,
  alwaysScroll: true,
  keys: true, // Enable keyboard scrolling (arrows, page up/down)
  vi: true,   // Enable vi-style keys (j/k/g/G)
  mouse: true, // Enable mouse wheel scrolling
  scrollbar: {
    ch: ' ',
    style: { bg: 'cyan' }, // Handle
    track: { bg: 'black' } // Invisible track
  },
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: '#333333' }
  }
});

// Footer
const footer = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: ' q: Quit | h: History | Space: Pause',
  style: {
    fg: 'gray',
    bg: 'black'
  }
});

// Helper function to calculate responsive overlay size
function calculateOverlaySize() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // For small terminals (80x24 minimum), use more space
  // For larger terminals, use smaller percentage for better aesthetics
  let widthPct, heightPct;

  if (cols <= 100 || rows <= 30) {
    // Small terminals: use more space (90-95%)
    widthPct = cols <= 80 ? '95%' : '90%';
    heightPct = rows <= 24 ? '90%' : '85%';
  } else {
    // Larger terminals: use standard 80%
    widthPct = '80%';
    heightPct = '80%';
  }

  return { width: widthPct, height: heightPct };
}

// History List (Overlay - initially hidden)
const overlaySize = calculateOverlaySize();
const historyList = blessed.list({
  top: 'center',
  left: 'center',
  width: overlaySize.width,
  height: overlaySize.height,
  label: ' {bold}Select History Log{/bold} ',
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'cyan' },
    track: { bg: 'black' }
  },
  border: { type: 'line' },
  style: {
    fg: 'white',
    bg: 'black',
    selected: { bg: 'blue', fg: 'white', bold: true },
    border: { fg: 'yellow' }
  },
  hidden: true
});

// --- Layout Composition ---
screen.append(header);
screen.append(logBox);
screen.append(footer);
screen.append(historyList);

// --- Key Bindings ---

// General Shortcuts
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  if (!historyList.hidden) {
      // Close history menu if open
      hideHistoryMenu();
      return;
  }
  if (!isLiveMode) {
      // If in history viewing mode, return to live
      startLiveMode();
      return;
  }
  return process.exit(0);
});

// Toggle Auto-scroll
screen.key(['space'], function(ch, key) {
  if (!historyList.hidden) return; // Ignore in menu
  autoScroll = !autoScroll;
  updateFooter();
  screen.render();
});

// Open History Menu
screen.key(['h'], function(ch, key) {
    if (!historyList.hidden) {
        hideHistoryMenu();
    } else {
        showHistoryMenu();
    }
});

// --- Logic ---

function updateFooter() {
    let status = '';
    if (isLiveMode) {
        status = autoScroll ? 'Live (Auto-scrolling)' : 'Live (Paused)';
    } else {
        status = 'History Mode (Read-only)';
    }

    footer.setContent(` q: Quit | h: History | Space: ${autoScroll ? 'Pause' : 'Resume'} | Esc: ${isLiveMode ? 'Quit' : 'Back to Live'} | [${status}]`);
}

function startLiveMode() {
    isLiveMode = true;
    hideHistoryMenu(); // Ensure menu is gone

    // Clear and reset UI
    logBox.setContent('');
    logBox.setLabel(' {bold}Live Transcript{/bold} ');
    logBox.focus();

    header.style.bg = 'black'; // Keep black
    header.style.fg = 'cyan';
    header.setContent('{bold}📢 Group Discussion Transcript{/bold}\n{center}Waiting for updates...{/center}');

    updateFooter();

    // Ensure file exists
    if (!fs.existsSync(liveLogFilePath)) {
        fs.writeFileSync(liveLogFilePath, '', { flag: 'a' });
    }

    // Kill existing tail if any
    if (tailProcess) {
        tailProcess.kill();
        tailProcess = null;
    }

    // Start tail
    tailProcess = spawn('tail', ['-f', '-n', '100', liveLogFilePath]);

    tailProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                processMessage(msg);
            } catch (e) {
                logBox.log(`{gray-fg}${line}{/gray-fg}`);
            }
        }
        if (autoScroll) {
            logBox.setScrollPerc(100);
        }
        screen.render();
    });

    screen.render();
}

function startHistoryMode(selectedPath: string) {
    isLiveMode = false;
    hideHistoryMenu();

    // Stop live tail
    if (tailProcess) {
        tailProcess.kill();
        tailProcess = null;
    }

    // Reset UI
    logBox.setContent('');
    logBox.setLabel(` {bold}History: ${path.basename(selectedPath)}{/bold} `);
    logBox.focus();

    header.style.bg = 'magenta'; // Visual cue for history mode
    header.setContent(`{bold}📜 History Viewer{/bold}\n{center}${path.basename(selectedPath)}{/center}`);

    updateFooter();

    // Read full file
    try {
        const content = fs.readFileSync(selectedPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                processMessage(msg);
            } catch (e) {
                logBox.log(`{gray-fg}${line}{/gray-fg}`);
            }
        }
    } catch (e) {
        logBox.log(`{red-fg}Error reading file: ${e}{/red-fg}`);
    }

    screen.render();
}

function showHistoryMenu() {
    const logDir = path.dirname(liveLogFilePath);

    fs.readdir(logDir, (err, files) => {
        if (err) {
            logBox.log(`{red-fg}Failed to list logs: ${err}{/red-fg}`);
            return;
        }

        // Filter for transcript-*.log and sort descending
        const logs = files
            .filter(f => f.startsWith('transcript-') && f.endsWith('.log'))
            .map(f => {
                try {
                    const stats = fs.statSync(path.join(logDir, f));
                    return { name: f, time: stats.mtime.getTime(), mtime: stats.mtime };
                } catch {
                    return { name: f, time: 0, mtime: new Date(0) };
                }
            })
            .sort((a, b) => b.time - a.time);

        const items = logs.map(l => `${l.name} (${l.mtime.toLocaleString()})`);

        historyList.setItems(items);
        historyList.show();
        historyList.focus();
        screen.render();

        // Handle selection
        historyList.once('select', (item, index) => {
             const selectedLog = logs[index];
             if (selectedLog) {
                 startHistoryMode(path.join(logDir, selectedLog.name));
             } else {
                 hideHistoryMenu();
             }
        });
    });
}

function hideHistoryMenu() {
    historyList.hide();
    logBox.focus();
    screen.render();
}


function processMessage(msg: any) {
    switch (msg.type) {
        case 'meta':
             const prefix = isLiveMode ? '📢 Group Discussion' : '📜 History';
             header.setContent(`{bold}${prefix}: ${msg.payload.topic}{/bold}\n{center}Round ${msg.payload.round || '?'}{/center}`);
             break;

        case 'round_start':
             logBox.log(`\n{center}{bold}--- Round ${msg.payload.round} ---{/bold}{/center}\n`);
             break;

        case 'message':
             const agentColor = getAgentColor(msg.payload.subagentType);
             logBox.log(`{${agentColor}-fg}{bold}@${msg.payload.agent}{/bold} (${msg.payload.role || msg.payload.subagentType}){/${agentColor}-fg}`);

             // Markdown Rendering (Line-by-line)
             const rawContent = msg.payload.content || '';
             const lines = rawContent.split('\n');
             let inCodeBlock = false;

             for (let line of lines) {
                 // 1. Code Blocks
                 if (line.trim().startsWith('```')) {
                     inCodeBlock = !inCodeBlock;
                     if (inCodeBlock) {
                         // Entering code block
                         logBox.log(`{gray-fg}${escapeTags(line)}`);
                     } else {
                         // Exiting code block
                         logBox.log(`${escapeTags(line)}{/gray-fg}`);
                     }
                     continue;
                 }

                 if (inCodeBlock) {
                     // Inside code block: Raw escape only, no formatting
                     logBox.log(escapeTags(line));
                 } else {
                     // Normal text: Apply Markdown Formatters
                     logBox.log(formatMarkdownLine(line));
                 }
             }
             logBox.log(''); // Trailing newline for separation
             break;

        case 'error':
             logBox.log(`{red-fg}{bold}⚠️ Error (@${msg.payload.agent}){/bold}: ${msg.payload.message}{/red-fg}`);
             break;

        case 'conclusion':
             logBox.log(`\n{green-bg}{black-fg}{bold} ✅ Consensus Reached {/bold}{/black-fg}{/green-bg}`);
             logBox.log(formatMarkdownLine(msg.payload.content || ''));
             break;

        default:
             logBox.log(JSON.stringify(msg));
    }
}

function getAgentColor(type: string): string {
    switch (type) {
        case 'human': return 'cyan';
        case 'planner': return 'magenta';
        case 'critic': return 'red';
        default: return 'green';
    }
}

function escapeTags(str: string): string {
    return str.replace(/[{}]/g, (match) => match === '{' ? '\{' : '\}');
}

function formatMarkdownLine(line: string): string {
    let output = escapeTags(line);

    // Bold: **text**
    output = output.replace(/\*\*(.*?)\*\*/g, '{bold}$1{/bold}');

    // Italic: *text* (Basic check, might clash with lists but acceptable)
    // output = output.replace(/\*([^\*]+)\*/g, '{u}$1{/u}'); // Disabled to avoid unwanted * list conflicts

    // Inline Code: `text`
    output = output.replace(/`([^`]+)`/g, '{magenta-fg}$1{/magenta-fg}');

    // Headers: # Title
    if (output.startsWith('#')) {
       output = output.replace(/^(#+)\s+(.*)$/, '{bold}{underline}$2{/underline}{/bold}');
    }

    // Lists: - Item (Highlight bullet)
    if (output.trim().startsWith('- ')) {
        output = output.replace(/^- /, '{cyan-fg}- {/cyan-fg}');
    }

    return output;
}

// Start in Live Mode
startLiveMode();


