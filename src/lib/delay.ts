/**
 * 通用延迟工具：返回一个在指定毫秒后 resolve 的 Promise。
 * 从原 src/constants/mock-api.ts 抽离，使 overview 仪表盘等模块
 * 不再依赖 mock 数据文件。
 */
export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
