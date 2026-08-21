import type { Conversation } from './types';

export const initialConversations: Conversation[] = [
  {
    id: 'billing-issue',
    name: '客服小艾',
    title: '账单问题 #4821',
    status: 'online',
    unread: 2,
    initials: '艾',
    messages: [
      {
        id: 'billing-1',
        sender: 'contact',
        author: '小艾',
        text: '您好！我注意到您本月的高级版（Pro）套餐被重复扣费了两次。重复扣款的部分我已经为您发起了退款。',
        timestamp: '10:02'
      },
      {
        id: 'billing-2',
        sender: 'user',
        author: '你',
        text: '谢谢您及时发现。请问退款大概需要多久能到账？',
        timestamp: '10:05'
      },
      {
        id: 'billing-3',
        sender: 'contact',
        author: '小艾',
        text: '通常需要 3-5 个工作日，具体取决于您所在银行的处理速度。不过 24 小时内您应该能看到一笔待入账的退款。还有其他我可以帮您的吗？',
        timestamp: '10:08'
      }
    ],
    quickReplies: [
      '这样就好，太感谢了！',
      '能给我补开一张退款凭证吗？',
      '我还想咨询一下升级套餐的事。'
    ],
    autoReplies: [
      '不客气！作为此次重复扣费的补偿，我已为您的下一个计费周期申请了 9 折优惠。',
      '没问题——退款确认函我已经发送到您注册时填写的邮箱了。',
      '当然可以！我很乐意为您介绍目前可选的套餐方案。'
    ]
  },
  {
    id: 'api-integration',
    name: '工程师普里雅',
    title: 'API 接入咨询',
    status: 'online',
    unread: 0,
    initials: '普',
    messages: [
      {
        id: 'api-1',
        sender: 'user',
        author: '你',
        text: '我调用 /api/products 接口时一直收到 429 限流错误。我们每分钟大概只发 50 个请求。',
        timestamp: '09:15'
      },
      {
        id: 'api-2',
        sender: 'contact',
        author: '普里雅',
        text: '我查了您的 API Key——您目前是入门版（Starter），限流是每分钟 30 次。要支持每分钟 200 次需要升级到成长版（Growth）。需要我帮您升级吗？',
        timestamp: '09:18'
      },
      {
        id: 'api-3',
        sender: 'user',
        author: '你',
        text: '好的，麻烦了。另外，有没有办法实现尊重 Retry-After 头的重试逻辑？',
        timestamp: '09:22'
      },
      {
        id: 'api-4',
        sender: 'contact',
        author: '普里雅',
        text: '问得好——只要在配置里开启 `autoRetry: true`，我们的 SDK 就会自动处理。我稍后把代码片段发您。',
        timestamp: '09:25'
      }
    ],
    quickReplies: [
      '那太有帮助了。',
      '能把限流相关的文档也发我一份吗？',
      '我们的 Webhook 接口也出现了超时。'
    ],
    autoReplies: [
      '代码片段在这里——只要在客户端配置里加上 `autoRetry: true` 和 `maxRetries: 3` 即可。',
      '没问题！限流指南我已经发到您收件箱了，其中也涵盖了突发流量的限制说明。',
      '我帮您查一下账号下的 Webhook 日志。方便把您使用的接口 URL 发我吗？'
    ]
  },
  {
    id: 'account-access',
    name: '安全专家乔丹',
    title: '账号访问申请',
    status: 'offline',
    unread: 1,
    initials: '乔',
    messages: [
      {
        id: 'access-1',
        sender: 'contact',
        author: '乔丹',
        text: '我们监测到一次来自圣保罗（São Paulo）的陌生设备登录尝试。是您本人操作吗？为安全起见，我们已临时锁定该会话。',
        timestamp: 'Yesterday'
      },
      {
        id: 'access-2',
        sender: 'user',
        author: '你',
        text: '不是我。我在纽约。能帮我把那个会话注销掉，并给我的账号开启两步验证（2FA）吗？',
        timestamp: 'Yesterday'
      }
    ],
    quickReplies: [
      '能让我看看当前所有活跃会话的列表吗？',
      '顺便也帮我重置一下密码吧。',
      '那个会话有没有读取过什么数据？'
    ],
    autoReplies: [
      '我已经注销了除当前会话外的所有会话，并开启了两步验证（2FA）。您会收到一封包含设置二维码的邮件。',
      '已处理——稍后您会收到密码重置链接。请务必使用独立且唯一的密码。',
      '没有任何数据被读取——该会话在发起任何 API 调用前就被拦截了。您的账号是安全的。'
    ]
  }
];
