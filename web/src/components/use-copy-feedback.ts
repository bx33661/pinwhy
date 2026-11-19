import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

/** Copy text to the clipboard with an auto-resetting confirmation flag and failure message. */
export function useCopyFeedback(timeoutMs = 2000, resetKey?: unknown) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => {
    clearTimer();
    setCopied(false);
    setError('');
  }, [resetKey, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError('');
      clearTimer();
      timer.current = setTimeout(() => { setCopied(false); }, timeoutMs);
      return true;
    } catch {
      setCopied(false);
      setError(t('app.clipboardFailed'));
      return false;
    }
  }, [timeoutMs, clearTimer]);

  return { copied, error, copy };
}
