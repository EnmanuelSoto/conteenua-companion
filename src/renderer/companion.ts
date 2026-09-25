import type { AppApi, SettingsPatch } from '../preload/index.js';
import type { AppState } from '../shared/types.js';
import type { ConteenuaCloudStatus } from '../shared/conteenua-cloud.js';
import type { LocalProject } from '../shared/projects.js';

declare global { interface Window { api: AppApi; } }
const api = window.api;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let cloud: ConteenuaCloudStatus | null = null;
let appState: AppState | null = null;
let projects: LocalProject[] = [];
const TUNNEL_ID = /^tunnel_[0-9a-f]{32}$/;

function value<T>(reply: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}
function platformName(): string {
  if (!appState) return 'Computer';
  return appState.platform.name || appState.platform.family;
}

function settingsSnapshot(config: AppState['config']): SettingsPatch {
  return {
    capabilities: config.capabilities,
    readOnly: config.readOnly,
    tunnel: config.tunnel,
    ui: config.ui,
    sessions: config.sessions,
    compaction: config.compaction,
    multiAgent: config.multiAgent,
    goal: config.goal,
    mcp: config.mcp ?? { instructions: '' },
  };
}

function paintTunnelMode(): void {
  if (!appState) return;
  const mode = $<HTMLSelectElement>('connectorMode');
  if (document.activeElement !== mode) mode.value = appState.config.tunnel.kind === 'cloudflared' ? 'cloudflared' : 'openai';
  const stable = mode.value === 'openai';
  $('stableTunnelSetup').hidden = !stable;
  $('temporaryTunnelSetup').hidden = stable;
  const tunnelId = $<HTMLInputElement>('openAiTunnelId');
  if (document.activeElement !== tunnelId) tunnelId.value = appState.config.tunnel.tunnelId || '';
  const key = $<HTMLInputElement>('openAiTunnelKey');
  key.placeholder = appState.hasApiKey ? 'Stored securely — leave blank to keep it' : 'Paste once — stored by your operating system';
  $('clearTunnelKey').toggleAttribute('disabled', !appState.hasApiKey);
  $('stableTunnelHint').textContent = appState.hasApiKey
    ? 'A restricted tunnel key is stored securely on this computer. Save the persistent tunnel ID, connect local tools, then pick that tunnel when creating the ChatGPT developer plugin.'
    : 'Create the tunnel in the OpenAI workspace you use with ChatGPT. Use a restricted API key with only the tunnel permissions it needs. The key authenticates the local tunnel transport; this path never uses Conteenua AI credits.';
}

async function saveTunnel(kind: 'openai' | 'cloudflared', tunnelId?: string): Promise<void> {
  if (!appState) throw new Error('Companion state is unavailable');
  const base = settingsSnapshot(appState.config);
  const patch: SettingsPatch = { ...base, tunnel: { ...base.tunnel, kind, ...(tunnelId === undefined ? {} : { tunnelId }) } };
  appState = value(await api.saveSettings(patch, base));
  paint();
}
function paint(): void {
  const signedIn = cloud?.signedIn === true;
  $('signInCard').hidden = signedIn;
  $('connectedContent').hidden = !signedIn;
  $('cloudPill').textContent = signedIn ? `${cloud?.deviceName || 'Computer'} · connected` : 'Not signed in';
  $('cloudPill').className = `pill ${signedIn ? 'good' : 'muted'}`;
  if (!signedIn) return;
  $('deviceName').textContent = cloud?.deviceName || 'This computer';
  $('accountEmail').textContent = cloud?.email || 'Conteenua account';
  $('realtimeState').textContent = cloud?.realtime === 'connected' ? 'Connected · outbound only' : cloud?.realtime || 'Connecting…';
  $('connectorState').textContent = appState?.status.state === 'connected' ? 'MCP connector ready' : appState?.status.detail || appState?.status.state || 'Not connected';
  $('browserState').textContent = appState?.bridge.present ? `Extension connected${appState.bridge.extensionVersion ? ` · v${appState.bridge.extensionVersion}` : ''}`
    : appState?.bridge.paired ? 'Paired · waiting for ChatGPT tab' : 'Extension not paired';
  paintTunnelMode();
  const coreSurface = appState?.status.surfaces.find(surface => surface.id === 'core') ?? null;
  $('connectorSetup').hidden = false;
  $('coreConnectorName').textContent = coreSurface?.connectorName || 'Conteenua Companion Core';
  const stableOpenAi = appState?.config.tunnel.kind === 'openai';
  $('connectorEndpointLabel').textContent = stableOpenAi ? 'Tunnel ID' : 'Connector URL';
  const connectorUrl = stableOpenAi ? appState?.config.tunnel.tunnelId || ''
    : coreSurface?.publicUrl || (appState?.config.tunnel.kind === 'manual' ? coreSurface?.localUrl : null) || '';
  $('coreConnectorUrl').textContent = connectorUrl || (stableOpenAi ? 'Save your stable tunnel first.' : 'Connect local tools to generate a URL.');
  const copyUrl = $<HTMLButtonElement>('copyConnectorUrl');
  copyUrl.disabled = !connectorUrl;
  $('connectorSetupHint').textContent = coreSurface?.lastToolCallAt
    ? 'ChatGPT has reached this Core connector and used a local tool.'
    : coreSurface?.lastRequestAt
      ? 'ChatGPT has reached this connector. If tools do not appear, confirm Developer mode and the plugin permissions in ChatGPT.'
      : stableOpenAi
        ? 'In ChatGPT Plugins → Create app, choose Tunnel, pick this tunnel, choose No Auth, then create the developer plugin. The browser bridge does not bypass plan or workspace limits.'
        : 'In ChatGPT Plugins → Create app, choose Server URL and use this temporary URL. It can rotate after Companion restarts, so prefer a stable OpenAI tunnel for normal use.';
  const permissionList = $('permissionList'); permissionList.replaceChildren();
  const labels: Array<[keyof AppState['config']['capabilities'], string]> = [['read','Read files'],['edit','Modify files'],['command','Run commands'],['deleteFile','Delete files'],['control','Browser/desktop control']];
  for (const [key,label] of labels) { const span=document.createElement('span'); span.className=`permission ${appState?.config.capabilities[key] ? '' : 'off'}`; span.textContent=label; permissionList.append(span); }
  const list = $('projectList'); list.replaceChildren();
  const visibleProjects = projects.filter(project => !project.ungrouped);
  $('projectsEmpty').hidden = visibleProjects.length > 0;
  for (const project of visibleProjects) {
    const row=document.createElement('div'); row.className='project';
    const copy=document.createElement('div'); const title=document.createElement('strong'); title.textContent=project.name;
    const meta=document.createElement('span'); meta.textContent=`Approved local project · ${platformName()}`; copy.append(title,meta);
    const remove=document.createElement('button'); remove.type='button'; remove.textContent='Remove'; remove.addEventListener('click', async()=>{ try{value(await api.removeProject(project.id)); value(await api.conteenuaCloudSync()); await refresh();}catch(error){alert((error as Error).message);} });
    row.append(copy,remove); list.append(row);
  }
}

async function refresh(): Promise<void> {
  const [cloudReply,stateReply,projectsReply] = await Promise.all([api.conteenuaCloudStatus(), api.getState(), api.listProjects()]);
  cloud=value(cloudReply); appState=value(stateReply); projects=value(projectsReply); paint();
}

$<HTMLFormElement>('signInForm').addEventListener('submit', async event => {
  event.preventDefault(); const error=$('authError'); error.hidden=true; $('signInButton').setAttribute('disabled','true');
  try { cloud=value(await api.conteenuaCloudSignIn($<HTMLInputElement>('email').value,$<HTMLInputElement>('password').value)); $<HTMLInputElement>('password').value=''; await refresh(); }
  catch (cause) { error.textContent=(cause as Error).message; error.hidden=false; }
  finally { $('signInButton').removeAttribute('disabled'); }
});
$('addProject').addEventListener('click', async()=>{ try{value(await api.addProject()); value(await api.conteenuaCloudSync()); await refresh();}catch(error){alert((error as Error).message);} });
$('syncButton').addEventListener('click', async()=>{ try{cloud=value(await api.conteenuaCloudSync()); await refresh();}catch(error){alert((error as Error).message);} });
$<HTMLSelectElement>('connectorMode').addEventListener('change', paintTunnelMode);
$('saveStableTunnel').addEventListener('click', async()=>{
  try {
    if (!appState) throw new Error('Companion state is unavailable');
    const id=$<HTMLInputElement>('openAiTunnelId').value.trim();
    if (!TUNNEL_ID.test(id)) throw new Error('Tunnel ID must look like tunnel_ followed by 32 hexadecimal characters.');
    const key=$<HTMLInputElement>('openAiTunnelKey').value.trim();
    if (!key && !appState.hasApiKey) throw new Error('Paste the restricted tunnel API key once so it can be stored securely on this computer.');
    if (key) { appState=value(await api.setApiKey(key, appState.config.tunnel.profileId)); $<HTMLInputElement>('openAiTunnelKey').value=''; }
    await saveTunnel('openai',id);
  } catch(error) { alert((error as Error).message); }
});
$('clearTunnelKey').addEventListener('click', async()=>{ try{if(!appState) return; appState=value(await api.setApiKey('',appState.config.tunnel.profileId)); paint();}catch(error){alert((error as Error).message);} });
$('useTemporaryTunnel').addEventListener('click', async()=>{ try{await saveTunnel('cloudflared');}catch(error){alert((error as Error).message);} });
$('connectTools').addEventListener('click', async()=>{ try{appState=value(await api.connect()); paint();}catch(error){alert((error as Error).message);} });
$('openExtension').addEventListener('click', async()=>{ try{value(await api.openExtensionFolder());}catch(error){alert((error as Error).message);} });
$('copyConnectorName').addEventListener('click', async()=>{ try{await api.writeClipboard($('coreConnectorName').textContent || 'Conteenua Companion Core');}catch(error){alert((error as Error).message);} });
$('copyConnectorUrl').addEventListener('click', async()=>{ const url=$('coreConnectorUrl').textContent || ''; if(!/^https?:\/\//i.test(url)) return; try{await api.writeClipboard(url);}catch(error){alert((error as Error).message);} });
$('openChatGPT').addEventListener('click', async()=>{ try{value(await api.openLink('https://chatgpt.com/'));}catch(error){alert((error as Error).message);} });
$('openChatGPTPlugins').addEventListener('click', async()=>{ try{value(await api.openLink('https://chatgpt.com/plugins'));}catch(error){alert((error as Error).message);} });
$('openOpenAiPlatform').addEventListener('click', async()=>{ try{value(await api.openLink('https://platform.openai.com/'));}catch(error){alert((error as Error).message);} });
$('openConteenua').addEventListener('click', async()=>{ try{value(await api.openLink('https://app.conteenua.com'));}catch(error){alert((error as Error).message);} });
$('legalNotices').addEventListener('click', async()=>{ try{value(await api.openLegalNotices());}catch(error){alert((error as Error).message);} });
$('signOutButton').addEventListener('click', async()=>{ if(!confirm('Disconnect this Conteenua account from this computer?')) return; cloud=value(await api.conteenuaCloudSignOut()); await refresh(); });
api.onConteenuaCloudChanged(status=>{cloud=status;paint();});
api.onStateChanged(state=>{appState=state;paint();});
void refresh().catch(error=>{ $('authError').textContent=(error as Error).message; $('authError').hidden=false; });
