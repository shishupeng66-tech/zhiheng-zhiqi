# Deployment

The project deploys to Vercel out of the box, or anywhere Docker runs. `next.config.ts` sets `output: 'standalone'`, so production builds are optimized for self-hosting.

## Vercel (Recommended)

1. Connect the repository to Vercel
2. Add environment variables in the dashboard
3. Deploy

For other platforms, see the [Next.js deployment docs](https://nextjs.org/docs/app/getting-started/deploying).

## Environment Variables for Production

Ensure these are set in your deployment platform:

- `DATABASE_PATH` — SQLite database file path (local deployment, e.g. `/var/lib/zhiheng/zhiheng_local.db`)
- `INITIAL_ADMIN_*` — first super-admin bootstrap variables (initialization only)
- All `NEXT_PUBLIC_*` variables for client-side access
- `SENTRY_*` variables if using error tracking

Sentry source maps are uploaded automatically in CI.

## Docker

Two production-ready Dockerfiles are included: `Dockerfile` (Node.js) and `Dockerfile.bun` (Bun). Pass `NEXT_PUBLIC_*` variables as `--build-arg` at build time and runtime secrets via `-e` at run time.

Build the image:

```bash
# Node.js
docker build \
  --build-arg NEXT_PUBLIC_SENTRY_DSN=https://...@....ingest.sentry.io/... \
  -t zhiheng-zhiqi .

# OR Bun
docker build -f Dockerfile.bun \
  --build-arg NEXT_PUBLIC_SENTRY_DSN=https://...@....ingest.sentry.io/... \
  -t zhiheng-zhiqi .
```

Run the container:

```bash
docker run -d -p 3000:3000 \
  -e DATABASE_PATH=/var/lib/zhiheng/zhiheng_local.db \
  -e INITIAL_ADMIN_USERNAME=admin \
  --restart unless-stopped \
  --name zhiheng-zhiqi \
  zhiheng-zhiqi
```
