import { withHyperswarm } from './hyperswarm-transfer';
import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType, RefAttributes } from 'react';
import type { ViewProps } from 'react-native';

export type Pairing = { version: 1; endpoint: string; certificateFingerprint: string; secret: string; encounterId: string; expiresAt: number; hyperswarmPublicKey?: string };
export type Credentials = Omit<Pairing, 'secret' | 'expiresAt'> & { deviceId: string; token: string };
export type Pending = { transferId: string; encounterId: string; sha256: string; createdAt: string };
export type CameraHandle = { capture(encounterId: string): Promise<Pending> };
export const NativeCamera = requireNativeViewManager('PsyRecTransfer') as ComponentType<ViewProps & RefAttributes<CameraHandle>>;
const NativeTransfer = requireNativeModule<{
  requireTunnel?(endpoint: string, pin: string): number;
  registerTunnel?(endpoint: string, pin: string, port: number, ticket: number): void;
  clearTunnel?(): void;
  useLocalNetwork?(endpoint: string, pin: string): void;
  pending(): Promise<Pending[]>;
  completed(encounterId: string): Promise<boolean>;
  pair(endpoint: string, pin: string, secret: string): Promise<string>;
  send(endpoint: string, pin: string, deviceId: string, token: string, encounterId: string, transferId: string): Promise<string>;
  verifyPending?(endpoint: string, pin: string, deviceId: string, token: string, encounterId: string, transferId: string, mode: 'wrong-certificate' | 'interrupted-upload'): Promise<string>;
  syncEvidence?(endpoint: string, pin: string, deviceId: string, token: string, encounterId: string): Promise<string>;
  historySync?(endpoint: string, pin: string, deviceId: string, token: string, encounterId: string): Promise<string>;
  historyLoad?(endpoint: string, pin: string, deviceId: string, encounterId: string): Promise<string>;
  historyClear?(): Promise<void>;
  historyLock?(): void;
  verifyHistoryModel?(uri: string): Promise<string>;
  historyNewRunId?(): string;
  historySaveRun?(endpoint: string, pin: string, deviceId: string, encounterId: string, runId: string, runJson: string): Promise<void>;
}>('PsyRecTransfer');
export const Transfer = withHyperswarm(NativeTransfer);

export function parseInvitation(text: string): Pairing {
  if (text.length > 2048) throw new Error('QR is too large. Scan the PsyRec PC pairing QR.');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('Invalid pairing QR.');
  const p = value as Pairing;
  if (p.version !== 1 || typeof p.endpoint !== 'string' || typeof p.encounterId !== 'string' || !p.encounterId ||
    typeof p.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(p.secret) || !/^[a-f0-9]{64}$/.test(p.certificateFingerprint) ||
    typeof p.expiresAt !== 'number' || p.expiresAt <= Date.now() || p.expiresAt > Date.now() + 125000) throw new Error('Pairing QR expired or invalid. Refresh it on the PC.');
  const url = new URL(p.endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Invalid PC address.');
  if (p.hyperswarmPublicKey !== undefined && !/^[a-f0-9]{64}$/.test(p.hyperswarmPublicKey)) throw new Error('Invalid Hyperswarm peer key.');
  return p;
}
