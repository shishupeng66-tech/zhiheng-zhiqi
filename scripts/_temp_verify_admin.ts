import { loadEnvConfig } from '@next/env';
import { createUser } from '../src/services/users';

loadEnvConfig(process.cwd());

(async () => {
  const u = await createUser({
    username: 'vlayout_verify',
    name: 'Layout Verify',
    employeeNo: 'V9999',
    password: 'VLayout@2026',
    role: 'super_admin',
    status: 'active',
    mustChangePassword: false
  });
  console.log('CREATED ' + u.id);
  process.exit(0);
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
