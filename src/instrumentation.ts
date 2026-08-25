import * as Sentry from '@sentry/nextjs';

const sentryOptions: Sentry.NodeOptions | Sentry.EdgeOptions = {
  // Sentry DSN
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable Spotlight in development
  spotlight: process.env.NODE_ENV === 'development',

  // Adds request headers and IP for users, for more info visit
  sendDefaultPii: true,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false
};

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      // Node.js Sentry configuration
      Sentry.init(sentryOptions);
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      // Edge Sentry configuration
      Sentry.init(sentryOptions);
    }
  }

  // Service Manager：Next.js 启动后自动检查并恢复 Voice Service
  // 异步不阻塞 HTTP 服务启动；页面层 /api/services/voice/health 还会兜底一次
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    import('@/lib/service-manager/services')
      .then(() => import('@/lib/service-manager/auto-start'))
      .then(({ runAutoStartCheck }) => {
        runAutoStartCheck('voice');
      })
      .catch(() => {
        /* 静默失败，页面层兜底 */
      });
  }
}

export const onRequestError = Sentry.captureRequestError;
