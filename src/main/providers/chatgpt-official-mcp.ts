import { getConfig } from '../config.js';
import { getStatus } from '../connection.js';
import { chatgptBrowserProvider } from './chatgpt-browser.js';
import type { CodingProviderAvailability, LocalCodingProvider } from './types.js';

/**
 * Official MCP still needs a normal ChatGPT conversation to receive the user's prompt. The browser
 * bridge is used only for opening/steering that conversation; local tool transport remains the
 * official Secure MCP connector. We never use this adapter to bypass plan/workspace availability.
 */
export const chatgptOfficialMcpProvider: LocalCodingProvider = {
  ...chatgptBrowserProvider,
  adapter: 'chatgpt_official_mcp',
  async availability(): Promise<CodingProviderAvailability> {
    const base = await chatgptBrowserProvider.availability();
    const officialTunnel = getConfig().tunnel.kind === 'openai' && getStatus().state === 'connected';
    return {
      provider: 'chatgpt', adapter: 'chatgpt_official_mcp',
      available: base.available && officialTunnel,
      writableTools: base.writableTools && officialTunnel,
      detail: !officialTunnel
        ? 'OpenAI Secure MCP Tunnel is not connected for this profile.'
        : base.detail,
    };
  },
};
