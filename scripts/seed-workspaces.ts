import { loadEnvConfig } from '@next/env';
import { runMigrations } from '../src/lib/db';
import { ensureDefaultWorkspacesSeed } from '../src/lib/workspaces/service';

loadEnvConfig(process.cwd());

runMigrations();
const workspaces = ensureDefaultWorkspacesSeed();

console.log('[seed-workspaces] Default workspaces are ready:');
for (const workspace of workspaces) {
  console.log(`  - ${workspace.name} (${workspace.slug}, ${workspace.workspaceType})`);
}
