import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, 'src', 'renderer', 'companion.html'), 'utf8');
const renderer = readFileSync(path.join(root, 'src', 'renderer', 'companion.ts'), 'utf8');

describe('Conteenua Companion stable ChatGPT setup', () => {
  it('presents the persistent OpenAI tunnel as the recommended connection and labels Cloudflare temporary', () => {
    expect(html).toContain('Stable OpenAI tunnel (recommended)');
    expect(html).toContain('Temporary Cloudflare fallback');
    expect(html).toContain('the public Server URL can rotate when Companion restarts');
    expect(html).toContain('Open ChatGPT Plugins');
  });

  it('collects the tunnel key only in a password field and sends it through secure secret IPC', () => {
    expect(html).toMatch(/id="openAiTunnelKey"\s+type="password"/);
    expect(renderer).toContain('api.setApiKey(key, appState.config.tunnel.profileId)');
    expect(renderer).toContain("api.setApiKey('',appState.config.tunnel.profileId)");
    expect(renderer).not.toMatch(/localStorage[^\n]*openAiTunnelKey|sessionStorage[^\n]*openAiTunnelKey/);
  });

  it('validates persistent tunnel IDs and keeps both stable and temporary transports explicit', () => {
    expect(renderer).toContain("const TUNNEL_ID = /^tunnel_[0-9a-f]{32}$/");
    expect(renderer).toContain("await saveTunnel('openai',id)");
    expect(renderer).toContain("await saveTunnel('cloudflared')");
    expect(renderer).toContain("api.openLink('https://chatgpt.com/plugins')");
    expect(renderer).toContain("api.openLink('https://platform.openai.com/')");
  });
});
