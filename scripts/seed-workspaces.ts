import { loadEnvConfig } from '@next/env';
import { runMigrations } from '../src/lib/db';
import { ensureDefaultWorkspaceSeed } from '../src/lib/workspaces/service';

loadEnvConfig(process.cwd());

runMigrations();
const workspace = ensureDefaultWorkspaceSeed();

console.log('[seed-workspaces] Default workspace is ready:');
console.log(`  name: ${workspace.name}`);
console.log(`  slug: ${workspace.slug}`);
console.log(`  type: ${workspace.workspaceType}`);
