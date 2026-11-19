/// <reference types="vite/client" />

import type { GraphSnapshot, UltraSnapshot } from './types';

declare global {
  interface Window {
    __PINWHY_DATA__?: GraphSnapshot;
    __PINWHY_ULTRA__?: UltraSnapshot;
  }
}

export {};
