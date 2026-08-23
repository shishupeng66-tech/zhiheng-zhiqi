import { loadEnvConfig } from '@next/env';
import { runMoneyPrinterTask } from '../src/lib/workspaces/moneyprinter-engine';

loadEnvConfig(process.cwd());

function getTaskId() {
  const taskIdIndex = process.argv.indexOf('--task-id');
  const taskId = taskIdIndex >= 0 ? process.argv[taskIdIndex + 1] : '';
  if (!taskId) {
    throw new Error('Missing --task-id');
  }
  return taskId;
}

runMoneyPrinterTask(getTaskId())
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  });
