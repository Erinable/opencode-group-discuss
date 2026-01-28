import blessed from 'blessed';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { ThemeManager } from './ThemeManager.js';

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
let themeManager: ThemeManager;

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
let header: any;
let logBox: any;
let footer: any;
let historyList: any;

async function initializeWidgets() {
  // Initialize theme manager
  themeManager = ThemeManager.getInstance();
  await themeManager.loadTheme();

  // Get theme colors
  const headerStyle = await themeManager.getUIElementColor('header');
  const headerBorder = await themeManager.getUIElementBorderStyle('header');
  const footerStyle = await themeManager.getUIElementColor('footer');
  const logBoxStyle = await themeManager.getUIElementColor('logBox');
  const logBoxBorder = await themeManager.getUIElementBorderStyle('logBox');
  const scrollbarHandle = await themeManager.getUIElementColor('scrollbarHandle');
  const scrollbarTrack = await themeManager.getUIElementColor('scrollbarTrack');
  const historyListStyle = await themeManager.getUIElementColor('historyList');
  const historyListBorder = await themeManager.getUIElementBorderStyle('historyList');
  const historyListSelected = await themeManager.getUIElementColor('historyListSelected');

  // Header
  header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{bold}📢 Group Discussion Transcript{/bold}\n{center}Initializing...{/center}',
    tags: true,
    style: {
      ...headerStyle,
      border: headerBorder
    }
  });

  // Log Box (Main Content)
  logBox = blessed.log({
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
      style: scrollbarHandle,
      track: scrollbarTrack
    },
    style: {
      ...logBoxStyle,
      border: logBoxBorder
    }
  });

  // Footer
  footer = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' q: Quit | h: History | Space: Pause',
    style: footerStyle
  });
}

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

async function initializeHistoryList() {
  const overlaySize = calculateOverlaySize();

  // Theme colors
  const historyListStyle = await themeManager.getUIElementColor('historyList');
  const historyListBorder = await themeManager.getUIElementBorderStyle('historyList');
  const historyListSelected = await themeManager.getUIElementColor('historyListSelected');
  const scrollbarHandle = await themeManager.getUIElementColor('scrollbarHandle');
  const scrollbarTrack = await themeManager.getUIElementColor('scrollbarTrack');

  historyList = blessed.list({
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
      style: scrollbarHandle,
      track: scrollbarTrack
    },
    border: { type: 'line' },
    style: {
      ...historyListStyle,
      selected: historyListSelected,
      border: historyListBorder
    },
    hidden: true
  });
}

// --- Layout Composition ---
async function appendWidgets() {
  screen.append(header);
  screen.append(logBox);
  screen.append(footer);
  screen.append(historyList);
}

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
    if (!footer) return; // Guard: footer not initialized yet

    let status = '';
    if (isLiveMode) {
        status = autoScroll ? 'Live (Auto-scrolling)' : 'Live (Paused)';
    } else {
        status = 'History Mode (Read-only)';
    }

    footer.setContent(` q: Quit | h: History | Space: ${autoScroll ? 'Pause' : 'Resume'} | Esc: ${isLiveMode ? 'Quit' : 'Back to Live'} | [${status}]`);
}

async function startLiveMode() {
    isLiveMode = true;
    hideHistoryMenu(); // Ensure menu is gone

    // Clear and reset UI
    logBox.setContent('');
    logBox.setLabel(' {bold}Live Transcript{/bold} ');
    logBox.focus();

    // Apply theme colors to header
    const headerStyle = await themeManager.getUIElementColor('header');
    header.style.bg = headerStyle.bg || 'black';
    header.style.fg = headerStyle.fg || 'cyan';
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

    tailProcess.stdout?.on('data', async (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                await processMessage(msg);
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

async function startHistoryMode(selectedPath: string) {
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

    // Apply theme colors to header with history mode visual cue
    // Note: Using magenta for history mode visual distinction
    // TODO: Consider adding ui.headerHistory to theme for customization
    const headerStyle = await themeManager.getUIElementColor('header');
    header.style.bg = 'magenta'; // Visual cue for history mode
    header.style.fg = headerStyle.fg || 'white';
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
                await processMessage(msg);
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
    if (!historyList || !logBox) return; // Guard: widgets not initialized yet

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
        historyList.once('select', (item: unknown, index: number) => {
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
    if (!historyList || !logBox) return; // Guard: widgets not initialized yet

    historyList.hide();
    logBox.focus();
    screen.render();
}


async function processMessage(msg: any) {
    switch (msg.type) {
        case 'meta':
             const prefix = isLiveMode ? '📢 Group Discussion' : '📜 History';
             header.setContent(`{bold}${prefix}: ${msg.payload.topic}{/bold}\n{center}Round ${msg.payload.round || '?'}{/center}`);
             break;

        case 'round_start':
             logBox.log(`\n{center}{bold}--- Round ${msg.payload.round} ---{/bold}{/center}\n`);
             break;

        case 'message':
             const agentColor = await getAgentColor(msg.payload.subagentType);
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
                     logBox.log(await formatMarkdownLine(line));
                 }
             }
             logBox.log(''); // Trailing newline for separation
             break;

        case 'error':
             const errorColor = await themeManager.getMessageColor('error');
             logBox.log(`{${errorColor}-fg}{bold}⚠️ Error (@${msg.payload.agent}){/bold}: ${msg.payload.message}{/${errorColor}-fg}`);
             break;

        case 'conclusion':
             const consensusBg = await themeManager.getMessageColor('consensusBg');
             const consensusFg = await themeManager.getMessageColor('consensusFg');
             logBox.log(`\n{${consensusBg}-bg}{${consensusFg}-fg}{bold} ✅ Consensus Reached {/bold}{/${consensusFg}-fg}{/${consensusBg}-bg}`);
             logBox.log(await formatMarkdownLine(msg.payload.content || ''));
             break;

        default:
             logBox.log(JSON.stringify(msg));
    }
}

async function getAgentColor(type: string): Promise<string> {
    const agentType = type as keyof import('../config/theme.js').AgentColors;
    try {
        return await themeManager.getAgentColor(agentType);
    } catch {
        // Fallback to default if agent type not found
        return await themeManager.getAgentColor('default');
    }
}

function escapeTags(str: string): string {
    return str.replace(/[{}]/g, (match) => match === '{' ? '\{' : '\}');
}

async function formatMarkdownLine(line: string): Promise<string> {
    let output = escapeTags(line);

    // Bold: **text**
    output = output.replace(/\*\*(.*?)\*\*/g, '{bold}$1{/bold}');

    // Italic: *text* (Basic check, might clash with lists but acceptable)
    // output = output.replace(/\*([^\*]+)\*/g, '{u}$1{/u}'); // Disabled to avoid unwanted * list conflicts

    // Inline Code: `text`
    const inlineCodeColor = await themeManager.getMessageColor('inlineCode');
    output = output.replace(/`([^`]+)`/g, `{${inlineCodeColor}-fg}$1{/${inlineCodeColor}-fg}`);

    // Headers: # Title
    if (output.startsWith('#')) {
       output = output.replace(/^(#+)\s+(.*)$/, '{bold}{underline}$2{/underline}{/bold}');
    }

    // Lists: - Item (Highlight bullet)
    if (output.trim().startsWith('- ')) {
        const listBulletColor = await themeManager.getMessageColor('listBullet');
        output = output.replace(/^- /, `{${listBulletColor}-fg}- {/${listBulletColor}-fg}`);
    }

    return output;
}

// Initialize and start in Live Mode
async function main() {
  await initializeWidgets();
  await initializeHistoryList();
  await appendWidgets();
  await startLiveMode();
}

main().catch(err => {
  console.error('Failed to start TranscriptViewer:', err);
  process.exit(1);
});


