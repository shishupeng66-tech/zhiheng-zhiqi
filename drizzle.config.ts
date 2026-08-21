import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/zhiheng.db'
  },
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  verbose: true,
  strict: true
});
