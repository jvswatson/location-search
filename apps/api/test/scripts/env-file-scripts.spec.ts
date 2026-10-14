import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Guards the host scripts that must read the repo-root .env (the same file Docker Compose reads).
// If one stops loading it, it silently falls back to defaults and the app and database disagree.

const API_DIR = path.resolve(import.meta.dirname, '../..');
const REPO_ROOT = path.resolve(API_DIR, '../..');
const scripts: Record<string, string> = JSON.parse(
  readFileSync(path.join(API_DIR, 'package.json'), 'utf8'),
).scripts;

/** Script name → the file it runs, relative to apps/api (dist entries are checked via src). */
const ENTRIES: Record<string, string> = {
  dev: 'node_modules/@nestjs/cli/bin/nest.js',
  seed: 'dist/database/seed/seed.cli.js',
  'migration:run': 'node_modules/typeorm/cli.js',
};

/** `<env assignments> node --env-file-if-exists=<file> <entry> <args>` */
const LAUNCH = /^((?:[A-Z_]+=\S+ )*node --env-file-if-exists=(\S+)) (\S+)(.*)$/;

function parse(name: string) {
  const command = scripts[name];
  const match = command ? LAUNCH.exec(command) : null;
  if (!match) throw new Error(`script "${name}" no longer launches via node --env-file-if-exists`);
  const [, prefix, envFile, entry] = match;
  return { prefix: prefix!, envFile: envFile!, entry: entry! };
}

describe.each(Object.keys(ENTRIES))('the "%s" script', (name) => {
  it('loads the repo-root .env, next to docker-compose.yml', () => {
    const { envFile } = parse(name);
    expect(path.resolve(API_DIR, envFile)).toBe(path.join(REPO_ROOT, '.env'));
    expect(existsSync(path.join(REPO_ROOT, 'docker-compose.yml'))).toBe(true);
  });

  it('still runs the expected entry point', () => {
    const { entry } = parse(name);
    expect(entry).toBe(ENTRIES[name]);
    const onDisk = entry.startsWith('dist/')
      ? entry.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts')
      : entry;
    expect(existsSync(path.join(API_DIR, onDisk))).toBe(true);
  });

  describe('launch prefix, run for real against a scratch copy of the repo layout', () => {
    let root: string;
    let cwd: string;
    let probe: string;

    beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'env-file-scripts-'));
      cwd = path.join(root, path.relative(REPO_ROOT, API_DIR)); // <root>/apps/api
      mkdirSync(cwd, { recursive: true });
      probe = path.join(root, 'probe.mjs');
      writeFileSync(
        probe,
        `const { FROM_FILE, OVERRIDE, NODE_ENV } = process.env;
         console.log(JSON.stringify({ FROM_FILE, OVERRIDE, NODE_ENV }));`,
      );
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    /** Runs the script's own prefix (via sh, as pnpm does) with the probe as the entry point. */
    const run = (shellEnv: Record<string, string> = {}) => {
      const { NODE_ENV: _ignored, ...inherited } = process.env; // Vitest sets NODE_ENV=test
      const out = execFileSync('sh', ['-c', `${parse(name).prefix} "${probe}"`], {
        cwd,
        env: { ...inherited, ...shellEnv },
        encoding: 'utf8',
      });
      return JSON.parse(out) as Record<string, string | undefined>;
    };

    it('passes values from the root .env through, with the shell taking precedence', () => {
      writeFileSync(path.join(root, '.env'), 'FROM_FILE=file\nOVERRIDE=file\n');
      expect(run({ OVERRIDE: 'shell' })).toMatchObject({ FROM_FILE: 'file', OVERRIDE: 'shell' });
    });

    it('works when there is no .env (fresh clone) and defaults NODE_ENV to development', () => {
      expect(run()).toEqual({ NODE_ENV: 'development' });
    });
  });
});
