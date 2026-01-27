import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const TARGET_FILE = path.join(CONFIG_DIR, 'group-discuss.json');
const SOURCE_FILE = path.join(__dirname, '..', 'examples', 'group-discuss.json');

function copyConfig() {
    try {
        // Check if source file exists
        if (!fs.existsSync(SOURCE_FILE)) {
            console.warn('[opencode-group-discuss] Warning: Example config file not found at:', SOURCE_FILE);
            return;
        }

        // Create config directory if it doesn't exist
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }

        // Check if target file already exists
        if (fs.existsSync(TARGET_FILE)) {
            console.log('[opencode-group-discuss] Config file already exists at:', TARGET_FILE);
            return;
        }

        // Copy file
        fs.copyFileSync(SOURCE_FILE, TARGET_FILE);
        console.log('[opencode-group-discuss] Successfully created default config at:', TARGET_FILE);

    } catch (error) {
        console.error('[opencode-group-discuss] Failed to setup default config:', error.message);
    }
}

copyConfig();
