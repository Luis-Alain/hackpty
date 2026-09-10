import { mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
export function localEnv() {
  const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_SKIP_SKILLS: '1' };
  for (const [key, dir] of Object.entries({ TEMP: 'tmp', TMP: 'tmp', USERPROFILE: 'profile', XDG_CONFIG_HOME: 'config', XDG_STATE_HOME: 'state', XDG_CACHE_HOME: 'cache', HYPERFRAMES_FONT_CACHE_DIR: 'fonts', HYPERFRAMES_EXTRACT_CACHE_DIR: 'frames', npm_config_cache: 'npm' })) {
    env[key] = resolve('.cache', dir); mkdirSync(env[key], { recursive: true });
  }
  const browser = process.env.HYPERFRAMES_BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  if (browser) env.HYPERFRAMES_BROWSER_PATH = browser;
  return env;
}
export function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { cwd: root, env: localEnv(), windowsHide: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${bin} failed (${result.status}): ${result.stderr || result.error || ''}`);
  return result.stdout;
}
export function report(text) { appendFileSync('REPORT.md', `\n${text}\n`); }
export function ffprobe(file) {
  return JSON.parse(command('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]));
}
export const cli = resolve('node_modules/hyperframes/bin/hyperframes.mjs');
