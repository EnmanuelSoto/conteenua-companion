import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import { getStatus } from '../connection.js';
import { bridgeStatus, sessionControlsFor, setSessionAutomation, stopSessionTurn } from '../bridge.js';
import { getSession } from '../session/store.js';
import { sendDesktopInput } from '../session/start-input.js';
import { openInPreferredBrowser } from '../browser.js';
import type { CodingProviderAvailability, LocalCodingProvider } from './types.js';

async function availabilitySnapshot(): Promise<CodingProviderAvailability> {
  const bridge = await bridgeStatus();
  const connector = getStatus();
  const writable = getConfig().capabilities.edit === true && getConfig().capabilities.command === true;
  const tunnelReady = connector.state === 'connected';
  const browserReady = bridge.paired === true || bridge.present === true;
  return {
    provider: 'chatgpt', adapter: 'chatgpt_browser',
    available: tunnelReady && browserReady && writable,
    writableTools: tunnelReady && writable,
    detail: !tunnelReady ? 'Connect the ChatGPT MCP connector first.'
      : !browserReady ? 'Pair the Conteenua Companion browser extension with ChatGPT.'
        : !writable ? 'Enable local file editing and command permissions in Conteenua Companion.'
          : 'Normal ChatGPT is connected to this computer with writable local tools.',
  };
}

export const chatgptBrowserProvider: LocalCodingProvider = {
  provider: 'chatgpt',
  adapter: 'chatgpt_browser',
  async availability() { return availabilitySnapshot(); },
  async start(projectId, prompt) {
    const available = await availabilitySnapshot();
    if (!available.available) throw new Error(available.detail);
    const id = randomUUID();
    const entry = await sendDesktopInput({ id, projectId, sessionId: null, text: prompt, mode: 'auto',
      automation: 'off', dueAt: Date.now(), model: null, reasoningEffort: null });
    return { localSessionId: entry.sessionId ?? null, inputId: entry.id };
  },
  async followup(localSessionId, text) {
    const id = randomUUID();
    const session = await getSession(localSessionId);
    if (!session) throw new Error('Local ChatGPT session is unavailable');
    const entry = await sendDesktopInput({ id, projectId: session.projectId ?? null, sessionId: localSessionId,
      text, mode: 'auto', automation: 'off', dueAt: Date.now(), model: null, reasoningEffort: null });
    return { inputId: entry.id };
  },
  async stop(localSessionId) {
    const controls = await sessionControlsFor(localSessionId);
    if (controls.activeTurnId) await stopSessionTurn(localSessionId, controls.activeTurnId);
  },
  async pause(localSessionId) {
    await setSessionAutomation(localSessionId, 'off');
    const controls = await sessionControlsFor(localSessionId);
    if (controls.activeTurnId) await stopSessionTurn(localSessionId, controls.activeTurnId);
  },
  async resume(localSessionId) { await setSessionAutomation(localSessionId, 'off'); },
  async open(localSessionId) {
    const session = await getSession(localSessionId);
    if (!session?.conversationId) throw new Error('This session has not been bound to a ChatGPT conversation yet');
    await openInPreferredBrowser(`https://chatgpt.com/c/${encodeURIComponent(session.conversationId)}`);
  },
};
