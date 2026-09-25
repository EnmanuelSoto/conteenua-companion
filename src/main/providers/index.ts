import { chatgptBrowserProvider } from './chatgpt-browser.js';
import { chatgptOfficialMcpProvider } from './chatgpt-official-mcp.js';
import type { CodingAdapterId, LocalCodingProvider } from './types.js';

const providers: Record<CodingAdapterId, LocalCodingProvider> = {
  chatgpt_browser: chatgptBrowserProvider,
  chatgpt_official_mcp: chatgptOfficialMcpProvider,
};

export function codingProvider(adapter: CodingAdapterId): LocalCodingProvider {
  const provider = providers[adapter];
  if (!provider) throw new Error(`Unsupported coding provider adapter: ${adapter}`);
  return provider;
}

export async function codingProviderStatus() {
  return Promise.all(Object.values(providers).map(provider => provider.availability()));
}
