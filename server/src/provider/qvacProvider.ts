import { startQVACProvider } from '@qvac/sdk';
import { registrar } from '../metrics/performanceLog.js';

export interface ProviderState {
  providerPublicKey: string | null;
  status: 'starting' | 'ready' | 'error';
  error: string | null;
}

const state: ProviderState = {
  providerPublicKey: null,
  status: 'starting',
  error: null,
};

export async function initQVACProvider(): Promise<ProviderState> {
  const t0 = performance.now();
  try {
    const result = await startQVACProvider();
    if (!result.success) {
      throw new Error(result.error ?? 'Unknown provider error');
    }
    state.providerPublicKey = result.publicKey ?? null;
    state.status = 'ready';
    state.error = null;
    registrar({
      stage: 'provider_startup',
      status: 'ok',
      provider_public_key: result.publicKey?.slice(0, 12) ?? null,
      startup_ms: Math.round(performance.now() - t0),
    });
    return state;
  } catch (e) {
    state.status = 'error';
    state.error = String(e);
    registrar({
      stage: 'provider_startup',
      status: 'error',
      error: String(e),
      startup_ms: Math.round(performance.now() - t0),
    });
    throw e;
  }
}

export function getProviderState(): ProviderState {
  return { ...state };
}
