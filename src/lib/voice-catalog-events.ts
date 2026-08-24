/**
 * 轻量级「业务音色目录变更」事件总线。
 *
 * 知衡语音页面对业务音色（enabledForProduction）的增删，需要通过一个
 * 跨页面的信号通知视频生产页的下拉框重新拉取最新业务音色列表。
 * 这里用 window CustomEvent 实现，不引入任何状态管理库：
 * - 知衡语音在每次业务音色变更后 emitVoiceCatalogChanged()
 * - 视频生产页 subscribeVoiceCatalogChanged(cb) 后，切换回来或同帧内都会收到通知并 refetch
 */
export const VOICE_CATALOG_CHANGED_EVENT = 'zhiheng:voice-catalog-changed';

export function emitVoiceCatalogChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VOICE_CATALOG_CHANGED_EVENT));
}

export function subscribeVoiceCatalogChanged(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = () => handler();
  window.addEventListener(VOICE_CATALOG_CHANGED_EVENT, listener);
  return () => window.removeEventListener(VOICE_CATALOG_CHANGED_EVENT, listener);
}
