'use client';

import * as React from 'react';

/**
 * 工作空间 Header Actions 注入机制。
 *
 * 用于让子页面把操作按钮（如「一键生成视频」）注入到工作空间 Header 的右侧，
 * 而不需要把业务逻辑提升到 layout 层。
 *
 * 用法：
 *   // 子页面（Client Component）：
 *   <WorkspaceHeaderActions>
 *     <Button onClick={...}>一键生成视频</Button>
 *   </WorkspaceHeaderActions>
 *
 *   // Header 里（WorkspaceShell）：
 *   <WorkspaceHeaderSlot />
 */

type WorkspaceHeaderContextValue = {
  actions: React.ReactNode;
  setActions: (actions: React.ReactNode) => void;
};

const WorkspaceHeaderContext = React.createContext<WorkspaceHeaderContextValue | null>(null);

export function WorkspaceHeaderProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<React.ReactNode>(null);

  const value = React.useMemo(() => ({ actions, setActions }), [actions]);

  return (
    <WorkspaceHeaderContext.Provider value={value}>{children}</WorkspaceHeaderContext.Provider>
  );
}

function useWorkspaceHeader() {
  const ctx = React.useContext(WorkspaceHeaderContext);
  if (!ctx) {
    throw new Error('useWorkspaceHeader must be used within WorkspaceHeaderProvider');
  }
  return ctx;
}

/**
 * 在子页面中使用，将 children 注入到工作空间 Header 右侧。
 * 卸载时自动清空。
 */
export function WorkspaceHeaderActions({ children }: { children: React.ReactNode }) {
  const { setActions } = useWorkspaceHeader();

  React.useEffect(() => {
    setActions(children);
    return () => setActions(null);
  }, [children, setActions]);

  return null;
}

/**
 * 在 WorkspaceShell 中使用，渲染注入的 actions。
 */
export function WorkspaceHeaderSlot() {
  const { actions } = useWorkspaceHeader();
  return <>{actions}</>;
}
