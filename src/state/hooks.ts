import { useSyncExternalStore } from 'react';
import { transport } from './transport';

export function useTransportTime(): number {
  return useSyncExternalStore(transport.subscribe, transport.getTime, transport.getTime);
}

export function useTransportPlaying(): boolean {
  return useSyncExternalStore(transport.subscribeState, transport.getPlaying, transport.getPlaying);
}

export function useTransportDuration(): number {
  return useSyncExternalStore(transport.subscribeState, transport.getDuration, transport.getDuration);
}
