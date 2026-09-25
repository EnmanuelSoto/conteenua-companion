import { describe, expect, it } from 'vitest';
import { deriveRemoteSessionStatus } from '../src/main/conteenua-cloud.js';

describe('Conteenua remote session status', () => {
  it('keeps cancelled terminal even while local browser state settles', () => {
    expect(deriveRemoteSessionStatus({ activeTurnId: 'turn-1', lastTurnOutcome: null }, 'cancelled')).toBe('cancelled');
    expect(deriveRemoteSessionStatus({ activeTurnId: null, lastTurnOutcome: 'completed' }, 'cancelled')).toBe('cancelled');
  });

  it('keeps paused ahead of transient local activity', () => {
    expect(deriveRemoteSessionStatus({ activeTurnId: 'turn-1', lastTurnOutcome: null }, 'paused')).toBe('paused');
  });

  it('otherwise follows the local ChatGPT turn lifecycle', () => {
    expect(deriveRemoteSessionStatus({ activeTurnId: 'turn-1', lastTurnOutcome: null }, 'starting')).toBe('working');
    expect(deriveRemoteSessionStatus({ activeTurnId: null, lastTurnOutcome: 'completed' }, 'working')).toBe('completed');
    expect(deriveRemoteSessionStatus({ activeTurnId: null, lastTurnOutcome: 'failed' }, 'working')).toBe('failed');
    expect(deriveRemoteSessionStatus({ activeTurnId: null, lastTurnOutcome: null }, 'working')).toBe('starting');
  });
});
