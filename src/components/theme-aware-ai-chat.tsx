'use client';

import type { ComponentProps } from 'react';
import { V0AiChat } from '@/components/ui/v0-ai-chat';
import styles from './theme-aware-ai-chat.module.css';

/** Theme adapter for the shared chat UI, scoped to this composer. */
export function ThemeAwareAiChat(props: ComponentProps<typeof V0AiChat>) {
  return (
    <div className={styles.theme}>
      <V0AiChat {...props} />
    </div>
  );
}
