import { createChat } from '@shadcn/helpers/ai-sdk';
import type { UIMessage } from 'ai';

type Tools = {
  getRevenue: {
    input: { period: string };
    output: {
      period: string;
      revenue: number;
      changePct: number;
      topDriver: string;
    };
  };
};

/** The message shape for this demo (typed tools, no data parts). */
export type DemoUIMessage = UIMessage<unknown, Record<string, never>, Tools>;

/**
 * A scripted AI conversation. It streams through the real `useChat` lifecycle
 * via `transport()` — no model, API route, network request, or API key. The
 * script shows off reasoning, a tool call, and streamed text across two turns.
 */
export const demoChat = createChat<unknown, Record<string, never>, Tools>()
  .user('上个月营收表现如何？接下来我应该把精力放在哪里？')
  .sleep(500)
  .assistant(({ writer }) => {
    writer.reasoning(
      '用户问了两件事——上个月的营收走势，以及接下来的建议。我先调用指标工具拉取数据，再依据数据给出建议。'
    );
    writer
      .tool('getRevenue', {
        title: '正在获取营收指标',
        input: { period: 'last-month' }
      })
      .sleep(900)
      .output({
        period: 'last-month',
        revenue: 1250,
        changePct: 12.5,
        topDriver: '老客户复购'
      });
    writer.text('上个月您共获得 1250 美元营收，比前一个月增长 12.5%，营收整体明显呈上升趋势。');
    writer.text('这波增长主要来自于老客户复购。');
  })
  .user('很好。那接下来我应该把精力放在哪里？')
  .sleep(500)
  .assistant(({ writer }) => {
    writer.reasoning(
      '营收健康且主要由留存驱动，因此短板在获客。我用一个具体、低成本的动作来引导他。'
    );
    writer.text(
      '既然增长主要靠老客户复购，我会把重心转向新客获客——本周期获客下滑了约 20%。一个推荐返利或一场小规模精准投放，就能以很低的成本重新平衡转化漏斗。'
    );
  });

/** Empty initial transcript — the demo streams as the user presses Send. */
export const initialMessages = demoChat.get(0);

/** Local transport that streams the scripted responses through `useChat`. */
export const chatTransport = demoChat.transport({ delayMs: 30 });
