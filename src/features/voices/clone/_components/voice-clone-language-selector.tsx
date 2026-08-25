'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, type CloneLanguageKey } from '../types';

interface LanguageSelectorProps {
  value: CloneLanguageKey;
  onChange: (next: CloneLanguageKey) => void;
  disabled?: boolean;
}

export function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as CloneLanguageKey)}
      disabled={disabled}
    >
      <SelectTrigger className='w-full'>
        <SelectValue placeholder='选择语言' />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang.key} value={lang.key}>
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
