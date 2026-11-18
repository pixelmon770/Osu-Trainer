import type { TrainerApi } from '../shared/api.ts';

declare global {
  interface Window {
    api: TrainerApi;
  }
}

export {};
