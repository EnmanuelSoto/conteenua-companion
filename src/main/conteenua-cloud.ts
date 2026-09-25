import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { ipcMain } from 'electron';
import { CONTEENUA_SUPABASE_ANON_KEY, CONTEENUA_SUPABASE_URL } from '../shared/conteenua-cloud-defaults.js';
import type { ConteenuaCloudStatus } from '../shared/conteenua-cloud.js';
import { getSecret, setSecret } from './secrets.js';
import { readDurable, writeDurableNow } from './durable.js';
import { listProjects } from './projects.js';
import { getConfig } from './config.js';
import { codingProvider, codingProviderStatus } from './providers/index.js';
import type { CodingAdapterId } from './providers/types.js';
import { getSession, readRecentEvents } from './session/store.js';
import { logInfo, logWarn } from './logger.js';

const DEVICE_STATE = 'conteenua-cloud-device';
const SESSION_SECRET = 'conteenua:supabaseSession' as const;
const HEARTBEAT_MS = 25_000;
const COMMAND_POLL_MS = 4_000;
const SESSION_SYNC_MS = 2_000;
const safePlatform = (): 'windows' | 'macos' | 'linux' | 'other' => process.platform === 'win32' ? 'windows'
  : process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'other';

type DeviceState = { id: string; name: string; ownerId?: string };
type RemoteSessionMap = { localSessionId: string; lastEventSeq: number; lastStatus: string; adapter: CodingAdapterId };

let client: SupabaseClient | null = null;
let session: Session | null = null;
let device: DeviceState | null = null;
let commandChannel: RealtimeChannel | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let syncTimer: NodeJS.Timeout | null = null;
let lastHeartbeatAt: number | null = null;
let realtime: ConteenuaCloudStatus['realtime'] = 'disconnected';
let lastError: string | null = null;
const remoteSessions = new Map<string, RemoteSessionMap>();
let providerFlags: Record<string, boolean> = {
  chatgpt_official_mcp: true,
  chatgpt_browser_bridge: true,
  claude_code: false,
  codex: false,
};
const listeners = new Set<(status: ConteenuaCloudStatus) => void>();

function deterministicUuid(input: string): string {
  const bytes = createHash('sha256').update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function snapshot(): ConteenuaCloudStatus {
  return { configured: Boolean(CONTEENUA_SUPABASE_URL && CONTEENUA_SUPABASE_ANON_KEY), signedIn: Boolean(session?.user),
    userId: session?.user?.id ?? null, email: session?.user?.email ?? null, deviceId: device?.id ?? null,
    deviceName: device?.name ?? os.hostname(), lastHeartbeatAt, realtime, error: lastError };
}
function emit(): void { const value = snapshot(); for (const listener of listeners) listener(value); }
export function onConteenuaCloudStatus(listener: (status: ConteenuaCloudStatus) => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener);
}
export function conteenuaCloudStatus(): ConteenuaCloudStatus { return snapshot(); }

function adapterFlagKey(adapter: CodingAdapterId): string {
  return adapter === 'chatgpt_browser' ? 'chatgpt_browser_bridge' : adapter;
}

async function refreshProviderFlags(): Promise<Record<string, boolean>> {
  if (!client || !session?.user) return providerFlags;
  const result = await client.from('conteenua_companion_provider_flags').select('key,enabled');
  if (result.error) throw result.error;
  providerFlags = { ...providerFlags, ...Object.fromEntries((result.data || []).map((row: any) => [String(row.key), row.enabled === true])) };
  return providerFlags;
}

async function providerAdapterEnabled(adapter: CodingAdapterId): Promise<boolean> {
  const flags = await refreshProviderFlags();
  return flags[adapterFlagKey(adapter)] !== false;
}

async function saveSession(value: Session | null): Promise<void> {
  session = value;
  await setSecret(SESSION_SECRET, value ? JSON.stringify({ access_token: value.access_token, refresh_token: value.refresh_token }) : '');
}

async function restoreSession(): Promise<void> {
  const raw = await getSecret(SESSION_SECRET);
  if (!raw || !client) return;
  try {
    const stored = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
    if (!stored.access_token || !stored.refresh_token) return;
    const result = await client.auth.setSession({ access_token: stored.access_token, refresh_token: stored.refresh_token });
    if (result.error) throw result.error;
    session = result.data.session;
    if (session) await saveSession(session);
  } catch (error) {
    lastError = `Could not restore Conteenua sign-in: ${(error as Error).message}`;
  }
}

async function ensureDevice(): Promise<DeviceState> {
  if (device) return device;
  const stored = await readDurable<DeviceState>(DEVICE_STATE);
  device = stored?.id ? stored : { id: randomUUID(), name: os.hostname() || 'My computer' };
  await writeDurableNow(DEVICE_STATE, device);
  return device;
}

async function projectGitMetadata(projectPath: string): Promise<{ host: string | null; owner: string | null; repo: string | null; branch: string | null }> {
  let branch: string | null = null, remote: string | null = null;
  try {
    const head = (await fs.readFile(path.join(projectPath, '.git', 'HEAD'), 'utf8')).trim();
    if (head.startsWith('ref: refs/heads/')) branch = head.slice('ref: refs/heads/'.length).slice(0, 200);
  } catch {}
  try {
    const config = await fs.readFile(path.join(projectPath, '.git', 'config'), 'utf8');
    remote = config.match(/\[remote\s+"origin"\][\s\S]*?\n\s*url\s*=\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
  } catch {}
  if (!remote) return { host: null, owner: null, repo: null, branch };
  const normalized = remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/i, '');
  try {
    const url = new URL(normalized);
    const parts = url.pathname.split('/').filter(Boolean);
    return { host: url.hostname.slice(0, 200), owner: parts[0]?.slice(0, 200) ?? null,
      repo: parts[1]?.slice(0, 200) ?? null, branch };
  } catch { return { host: null, owner: null, repo: null, branch }; }
}

async function heartbeat(): Promise<void> {
  if (!client || !session?.user) return;
  let localDevice = await ensureDevice();
  if (localDevice.ownerId && localDevice.ownerId !== session.user.id) {
    localDevice = { id: randomUUID(), name: localDevice.name, ownerId: session.user.id };
    device = localDevice;
    await writeDurableNow(DEVICE_STATE, localDevice);
  } else if (!localDevice.ownerId) {
    localDevice = { ...localDevice, ownerId: session.user.id };
    device = localDevice;
    await writeDurableNow(DEVICE_STATE, localDevice);
  }
  const existingDevice = await client.from('conteenua_companion_devices').select('revoked_at')
    .eq('id', localDevice.id).eq('owner_id', session.user.id).maybeSingle();
  if (existingDevice.error) throw existingDevice.error;
  if (existingDevice.data?.revoked_at) {
    stopTimers();
    realtime = 'disconnected';
    lastError = 'This computer was revoked in Conteenua. Sign in again to pair it as a new device.';
    await saveSession(null);
    emit();
    return;
  }
  const flags = await refreshProviderFlags();
  const provider = (await codingProviderStatus()).map((row) => {
    const serverEnabled = flags[adapterFlagKey(row.adapter)] !== false;
    return { ...row, serverEnabled, available: row.available && serverEnabled,
      detail: serverEnabled ? row.detail : 'This provider adapter is temporarily disabled by Conteenua.' };
  });
  const capabilities = getConfig().capabilities;
  const now = new Date().toISOString();
  const deviceResult = await client.from('conteenua_companion_devices').upsert({ id: localDevice.id, owner_id: session.user.id,
    name: localDevice.name, platform: safePlatform(), architecture: process.arch, companion_version: '0.1.0',
    capabilities, provider_status: Object.fromEntries(provider.map(row => [row.adapter, row])), online: true,
    last_seen_at: now, updated_at: now }, { onConflict: 'id' });
  if (deviceResult.error) throw deviceResult.error;
  const projects = (await listProjects()).filter(row => !row.ungrouped);
  for (const project of projects) {
    const metadata = await projectGitMetadata(project.path);
    const cloudId = deterministicUuid(`${localDevice.id}:${project.id}`);
    const result = await client.from('conteenua_companion_projects').upsert({ id: cloudId, owner_id: session.user.id,
      device_id: localDevice.id, local_project_id: project.id, display_name: project.name,
      git_remote_host: metadata.host, git_owner: metadata.owner, git_repo: metadata.repo,
      current_branch: metadata.branch, capabilities, last_seen_at: now, updated_at: now }, { onConflict: 'device_id,local_project_id' });
    if (result.error) throw result.error;
  }
  const mirrored = await client.from('conteenua_companion_projects').select('id,local_project_id')
    .eq('owner_id', session.user.id).eq('device_id', localDevice.id);
  if (mirrored.error) throw mirrored.error;
  const localProjectIds = new Set(projects.map(project => project.id));
  const staleCloudIds = (mirrored.data || [])
    .filter(row => !localProjectIds.has(String(row.local_project_id)))
    .map(row => String(row.id));
  if (staleCloudIds.length > 0) {
    const removed = await client.from('conteenua_companion_projects').delete()
      .eq('owner_id', session.user.id).eq('device_id', localDevice.id).in('id', staleCloudIds);
    if (removed.error) throw removed.error;
  }
  lastHeartbeatAt = Date.now(); lastError = null; emit();
}

async function localProjectIdForCloudProject(cloudProjectId: string): Promise<string> {
  if (!client || !session?.user || !device) throw new Error('Conteenua Companion is not signed in');
  const result = await client.from('conteenua_companion_projects').select('local_project_id')
    .eq('id', cloudProjectId).eq('owner_id', session.user.id).eq('device_id', device.id).single();
  if (result.error || !result.data?.local_project_id) throw result.error || new Error('Project is unavailable on this computer');
  return String(result.data.local_project_id);
}

async function claimCommand(row: any): Promise<boolean> {
  if (!client || !session?.user || !device) return false;
  const result = await client.from('conteenua_companion_commands').update({ state: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', row.id).eq('owner_id', session.user.id).eq('device_id', device.id).eq('state', 'queued').select('id');
  return !result.error && (result.data || []).length === 1;
}

async function completeCommand(row: any, response: Record<string, unknown> = {}): Promise<void> {
  if (!client || !session?.user) return;
  await client.from('conteenua_companion_commands').update({ state: 'completed', completed_at: new Date().toISOString(), response, error_summary: null })
    .eq('id', row.id).eq('owner_id', session.user.id);
}
async function failCommand(row: any, error: unknown): Promise<void> {
  if (!client || !session?.user) return;
  const message = error instanceof Error ? error.message : String(error);
  await client.from('conteenua_companion_commands').update({ state: 'failed', completed_at: new Date().toISOString(), error_summary: message.slice(0, 2000) })
    .eq('id', row.id).eq('owner_id', session.user.id);
  if (row.session_id) await client.from('conteenua_companion_sessions').update({ status: 'failed', error_summary: message.slice(0, 2000),
    last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.session_id).eq('owner_id', session.user.id);
}

async function handleCommand(row: any): Promise<void> {
  if (!await claimCommand(row)) return;
  try {
    const payload = row.payload || {};
    if (row.kind === 'start') {
      const adapter = String(payload.adapter || 'chatgpt_browser') as CodingAdapterId;
      if (!await providerAdapterEnabled(adapter)) throw new Error('This ChatGPT provider adapter is temporarily disabled by Conteenua.');
      const provider = codingProvider(adapter);
      const localProjectId = await localProjectIdForCloudProject(String(payload.project_id || ''));
      const started = await provider.start(localProjectId, String(payload.instruction || ''));
      if (!started.localSessionId) throw new Error('ChatGPT session was queued but no local session identity was reserved');
      remoteSessions.set(row.session_id, { localSessionId: started.localSessionId, lastEventSeq: 0, lastStatus: 'starting', adapter });
      await client!.from('conteenua_companion_sessions').update({ status: 'starting', local_session_id: started.localSessionId,
        started_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', row.session_id).eq('owner_id', session!.user.id);
      await completeCommand(row, { local_session_id: started.localSessionId, input_id: started.inputId });
      return;
    }
    const map = remoteSessions.get(row.session_id) || (row.session_id ? await restoreRemoteSession(row.session_id) : null);
    if (!map) throw new Error('Local session is unavailable on this computer');
    const provider = codingProvider(map.adapter);
    if (row.kind === 'followup') await provider.followup(map.localSessionId, String(payload.text || ''));
    else if (row.kind === 'stop') {
      await provider.stop(map.localSessionId);
      map.lastStatus = 'cancelled';
      await client!.from('conteenua_companion_sessions').update({ status: 'cancelled', finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
        .eq('id', row.session_id).eq('owner_id', session!.user.id);
    } else if (row.kind === 'pause') {
      await provider.pause(map.localSessionId);
      map.lastStatus = 'paused';
      await client!.from('conteenua_companion_sessions').update({ status: 'paused', updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString() }).eq('id', row.session_id).eq('owner_id', session!.user.id);
    } else if (row.kind === 'resume') {
      await provider.resume(map.localSessionId);
      map.lastStatus = 'starting';
      await client!.from('conteenua_companion_sessions').update({ status: 'starting', updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString() }).eq('id', row.session_id).eq('owner_id', session!.user.id);
    }
    else if (row.kind === 'open_chat') await provider.open(map.localSessionId);
    else if (row.kind === 'approve' || row.kind === 'deny') {
      // Approval commands carry no shell text and never execute anything directly. The exact
      // fingerprinted exec retry consumes an approved row later at the tool boundary.
      await writeEvent(row.session_id, 'approval', row.kind === 'approve'
        ? 'Approval accepted. ChatGPT may retry the exact requested action once.'
        : 'Approval denied. The requested action remains blocked.', { approval_id: payload.approval_id });
      await client!.from('conteenua_companion_sessions').update({ status: 'working', updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString() }).eq('id', row.session_id).eq('owner_id', session!.user.id);
    }
    await completeCommand(row);
  } catch (error) { await failCommand(row, error); }
}

async function restoreRemoteSession(remoteSessionId: string): Promise<RemoteSessionMap | null> {
  if (!client || !session?.user || !device) return null;
  const result = await client.from('conteenua_companion_sessions').select('local_session_id,status,adapter')
    .eq('id', remoteSessionId).eq('owner_id', session.user.id).eq('device_id', device.id).single();
  if (result.error || !result.data?.local_session_id) return null;
  const map = { localSessionId: String(result.data.local_session_id), lastEventSeq: 0,
    lastStatus: String(result.data.status || ''), adapter: String(result.data.adapter || 'chatgpt_browser') as CodingAdapterId };
  remoteSessions.set(remoteSessionId, map); return map;
}

async function remoteSessionForLocal(localSessionId: string): Promise<{ id: string; deviceId: string } | null> {
  for (const [id, map] of remoteSessions) if (map.localSessionId === localSessionId) return { id, deviceId: device?.id || '' };
  if (!client || !session?.user || !device) return null;
  const result = await client.from('conteenua_companion_sessions').select('id,device_id,adapter,status')
    .eq('owner_id', session.user.id).eq('device_id', device.id).eq('local_session_id', localSessionId)
    .in('status', ['starting','working','waiting_approval','paused']).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error || !result.data?.id) return null;
  remoteSessions.set(String(result.data.id), { localSessionId, lastEventSeq: 0, lastStatus: String(result.data.status || ''),
    adapter: String(result.data.adapter || 'chatgpt_browser') as CodingAdapterId });
  return { id: String(result.data.id), deviceId: String(result.data.device_id) };
}

export type RemoteCommandRisk = 'package_install' | 'git_push' | 'deployment' | 'bulk_delete' | 'destructive_command';

export function classifyRemoteCommandRisk(commands: string[]): { category: RemoteCommandRisk; summary: string } | null {
  const text = commands.join('\n').toLowerCase();
  if (/\bgit\s+push\b/.test(text)) return { category: 'git_push', summary: 'ChatGPT wants to push Git changes from this project.' };
  if (/\b(?:vercel(?:\s+deploy|\s+--prod)|netlify\s+deploy|firebase\s+deploy|fly\s+deploy|railway\s+(?:up|deploy)|docker\s+push|kubectl\s+(?:apply|delete)|supabase\s+(?:db\s+push|functions\s+deploy))\b/.test(text))
    return { category: 'deployment', summary: 'ChatGPT wants to run a deployment or remote infrastructure command.' };
  if (/\b(?:npm\s+(?:install|i)\b|pnpm\s+(?:add|install)\b|yarn\s+(?:add|install)\b|pip(?:3)?\s+install\b|python(?:3)?\s+-m\s+pip\s+install\b|poetry\s+add\b|cargo\s+add\b|brew\s+install\b|choco\s+install\b|winget\s+install\b|apt(?:-get)?\s+install\b)/.test(text))
    return { category: 'package_install', summary: 'ChatGPT wants to install or add software packages.' };
  if (/\b(?:git\s+clean\s+-[^\s]*f|rm\s+-[^\s]*r[^\s]*f|rmdir\s+\/s\b|remove-item\b[^\n]*-recurse\b)/.test(text))
    return { category: 'bulk_delete', summary: 'ChatGPT wants to delete files recursively or clean untracked files.' };
  if (/\b(?:git\s+reset\s+--hard|git\s+checkout\s+--\s+\.|format-volume\b|clear-disk\b)/.test(text))
    return { category: 'destructive_command', summary: 'ChatGPT wants to run a destructive reset or disk command.' };
  return null;
}

export async function gateRemoteCommandApproval(localSessionId: string | null | undefined, commands: string[]): Promise<{ allowed: true } | { allowed: false; message: string }> {
  if (!localSessionId || !client || !session?.user || !device) return { allowed: true };
  const risk = classifyRemoteCommandRisk(commands);
  if (!risk) return { allowed: true };
  const remote = await remoteSessionForLocal(localSessionId);
  if (!remote) return { allowed: true };
  const fingerprint = createHash('sha256').update(JSON.stringify(commands)).digest('hex');
  const approvals = await client.from('conteenua_companion_approvals')
    .select('id,status,request_payload,consumed_at,created_at').eq('owner_id', session.user.id)
    .eq('session_id', remote.id).order('created_at', { ascending: false }).limit(30);
  if (approvals.error) throw approvals.error;
  const matching = (approvals.data || []).find((row: any) => row.request_payload?.fingerprint === fingerprint);
  if (matching?.status === 'approved' && !matching.consumed_at) {
    const consumed = await client.from('conteenua_companion_approvals').update({ consumed_at: new Date().toISOString() })
      .eq('id', matching.id).eq('owner_id', session.user.id).eq('status', 'approved').is('consumed_at', null).select('id');
    if (consumed.error) throw consumed.error;
    if ((consumed.data || []).length === 1) {
      await writeEvent(remote.id, 'approval', 'Approved action is being executed once.', { approval_id: matching.id, category: risk.category });
      return { allowed: true };
    }
  }
  if (matching?.status === 'denied') return { allowed: false, message: `REMOTE_APPROVAL_DENIED: ${risk.summary} The Conteenua user denied this action.` };
  if (matching?.status === 'pending') return { allowed: false, message: `REMOTE_APPROVAL_REQUIRED: ${risk.summary} Approval is pending in Conteenua. Do not run a different command; after approval, retry this exact command once.` };

  const approval = await client.from('conteenua_companion_approvals').insert({ owner_id: session.user.id,
    session_id: remote.id, device_id: remote.deviceId, risk_category: risk.category, action_summary: risk.summary,
    request_payload: { fingerprint } }).select('id').single();
  if (approval.error) throw approval.error;
  await client.from('conteenua_companion_sessions').update({ status: 'waiting_approval', updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString() }).eq('id', remote.id).eq('owner_id', session.user.id);
  await writeEvent(remote.id, 'approval', risk.summary, { approval_id: approval.data.id, category: risk.category });
  return { allowed: false, message: `REMOTE_APPROVAL_REQUIRED: ${risk.summary} An approval request was sent to Conteenua. After the user approves it, retry this exact command once.` };
}

async function writeEvent(remoteSessionId: string, kind: string, summary: string, safeMetadata: Record<string, unknown> = {}): Promise<void> {
  if (!client || !session?.user) return;
  await client.from('conteenua_companion_events').insert({ owner_id: session.user.id, session_id: remoteSessionId,
    kind, summary: summary.slice(0, 2000), safe_metadata: safeMetadata });
}

function safeEventSummary(event: any): { kind: string; summary: string; metadata: Record<string, unknown> } | null {
  if (event.kind === 'tool_call') return { kind: 'status', summary: `Using ${String(event.tool || 'local tool').slice(0, 120)}`, metadata: {} };
  if (event.kind === 'turn_start') return { kind: 'status', summary: 'ChatGPT started working.', metadata: {} };
  if (event.kind === 'turn_end') return { kind: event.outcome === 'completed' ? 'complete' : 'status',
    summary: event.outcome === 'completed' ? 'ChatGPT finished this turn.' : `ChatGPT turn ${String(event.outcome || 'ended')}.`, metadata: {} };
  if (event.kind === 'error') return { kind: 'error', summary: String(event.message || 'Local session error').slice(0, 2000), metadata: {} };
  return null;
}

export function deriveRemoteSessionStatus(local: { activeTurnId?: string | null; lastTurnOutcome?: string | null }, lastStatus: string): string {
  if (lastStatus === 'cancelled') return 'cancelled';
  if (lastStatus === 'paused') return 'paused';
  if (local.activeTurnId) return 'working';
  if (local.lastTurnOutcome === 'completed') return 'completed';
  if (local.lastTurnOutcome === 'failed') return 'failed';
  return 'starting';
}

async function syncRemoteSessions(): Promise<void> {
  if (!client || !session?.user) return;
  for (const [remoteId, map] of remoteSessions) {
    const local = await getSession(map.localSessionId);
    if (!local) continue;
    const status = deriveRemoteSessionStatus(local, map.lastStatus);
    if (status !== map.lastStatus || local.conversationId) {
      await client.from('conteenua_companion_sessions').update({ status, conversation_ref: local.conversationId,
        safe_summary: status === 'completed' ? 'ChatGPT finished the latest turn on your computer.' : null,
        last_activity_at: new Date(local.updatedAt).toISOString(), updated_at: new Date().toISOString(),
        ...(['completed', 'failed', 'cancelled'].includes(status) ? { finished_at: new Date().toISOString() } : {}) })
        .eq('id', remoteId).eq('owner_id', session.user.id);
      map.lastStatus = status;
    }
    const events = await readRecentEvents(map.localSessionId, 80);
    for (const event of events.filter((entry: any) => Number(entry.seq || 0) > map.lastEventSeq)) {
      map.lastEventSeq = Math.max(map.lastEventSeq, Number((event as any).seq || 0));
      const safe = safeEventSummary(event);
      if (safe) await writeEvent(remoteId, safe.kind, safe.summary, safe.metadata);
    }
  }
}

async function pollCommands(): Promise<void> {
  if (!client || !session?.user || !device) return;
  const result = await client.from('conteenua_companion_commands').select('*').eq('owner_id', session.user.id)
    .eq('device_id', device.id).eq('state', 'queued').order('created_at', { ascending: true }).limit(20);
  if (result.error) throw result.error;
  for (const row of result.data || []) await handleCommand(row);
}

async function subscribeCommands(): Promise<void> {
  if (!client || !session?.user || !device) return;
  if (commandChannel) await client.removeChannel(commandChannel);
  realtime = 'connecting'; emit();
  commandChannel = client.channel(`conteenua-companion-device-${device.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conteenua_companion_commands', filter: `device_id=eq.${device.id}` },
      payload => { void handleCommand(payload.new).catch(error => logWarn(`remote command: ${(error as Error).message}`)); })
    .subscribe(status => {
      realtime = status === 'SUBSCRIBED' ? 'connected' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'connecting'; emit();
    });
}

function stopTimers(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (syncTimer) clearInterval(syncTimer);
  heartbeatTimer = pollTimer = syncTimer = null;
}
async function startCloudLoop(): Promise<void> {
  if (!session?.user) return;
  await ensureDevice();
  await heartbeat();
  await subscribeCommands();
  await pollCommands();
  heartbeatTimer = setInterval(() => void heartbeat().catch(error => { lastError = (error as Error).message; emit(); }), HEARTBEAT_MS);
  pollTimer = setInterval(() => void pollCommands().catch(error => { lastError = (error as Error).message; emit(); }), COMMAND_POLL_MS);
  syncTimer = setInterval(() => void syncRemoteSessions().catch(error => logWarn(`remote session sync: ${(error as Error).message}`)), SESSION_SYNC_MS);
}

export async function initializeConteenuaCloud(): Promise<void> {
  client = createClient(CONTEENUA_SUPABASE_URL, CONTEENUA_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: true } });
  await ensureDevice();
  await restoreSession();
  if (session?.user) await startCloudLoop().catch(error => { lastError = (error as Error).message; emit(); });
}

export async function signInConteenuaCloud(email: string, password: string): Promise<ConteenuaCloudStatus> {
  if (!client) await initializeConteenuaCloud();
  const result = await client!.auth.signInWithPassword({ email: email.trim(), password });
  if (result.error || !result.data.session) throw result.error || new Error('Conteenua sign-in failed');
  stopTimers(); session = result.data.session;
  let localDevice = await ensureDevice();
  if (localDevice.ownerId && localDevice.ownerId !== session.user.id) {
    localDevice = { id: randomUUID(), name: localDevice.name, ownerId: session.user.id };
    device = localDevice;
    await writeDurableNow(DEVICE_STATE, localDevice);
  } else if (!localDevice.ownerId) {
    localDevice = { ...localDevice, ownerId: session.user.id };
    device = localDevice;
    await writeDurableNow(DEVICE_STATE, localDevice);
  }
  const existingDevice = await client!.from('conteenua_companion_devices').select('revoked_at')
    .eq('id', localDevice.id).eq('owner_id', session.user.id).maybeSingle();
  if (existingDevice.error) throw existingDevice.error;
  if (existingDevice.data?.revoked_at) {
    device = { id: randomUUID(), name: localDevice.name, ownerId: session.user.id };
    await writeDurableNow(DEVICE_STATE, device);
  }
  await saveSession(session); lastError = null;
  await startCloudLoop(); emit(); return snapshot();
}
export async function signOutConteenuaCloud(): Promise<ConteenuaCloudStatus> {
  stopTimers();
  if (client && session?.user && device) {
    try { await client.from('conteenua_companion_devices').update({ online: false, updated_at: new Date().toISOString() })
      .eq('id', device.id).eq('owner_id', session.user.id); } catch {}
  }
  if (commandChannel && client) await client.removeChannel(commandChannel).catch(() => undefined);
  commandChannel = null; realtime = 'disconnected'; remoteSessions.clear();
  await client?.auth.signOut().catch(() => undefined); await saveSession(null); emit(); return snapshot();
}
export async function syncConteenuaCloudNow(): Promise<ConteenuaCloudStatus> {
  await heartbeat(); await pollCommands(); await syncRemoteSessions(); return snapshot();
}

export function registerConteenuaCloudIpc(push: (channel: string, payload: unknown) => void): void {
  const wrap = <T>(handler: (payload: any) => Promise<T> | T) => async (_event: unknown, payload?: unknown) => {
    try { return { ok: true as const, data: await handler(payload) }; }
    catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : String(error) }; }
  };
  ipcMain.handle('conteenuaCloud:status', wrap(() => snapshot()));
  ipcMain.handle('conteenuaCloud:signIn', wrap((payload) => signInConteenuaCloud(String(payload?.email || ''), String(payload?.password || ''))));
  ipcMain.handle('conteenuaCloud:signOut', wrap(() => signOutConteenuaCloud()));
  ipcMain.handle('conteenuaCloud:sync', wrap(() => syncConteenuaCloudNow()));
  onConteenuaCloudStatus(status => push('conteenuaCloud:changed', status));
}

export async function shutdownConteenuaCloud(): Promise<void> {
  stopTimers();
  if (client && session?.user && device) {
    try { await client.from('conteenua_companion_devices').update({ online: false, updated_at: new Date().toISOString() })
      .eq('id', device.id).eq('owner_id', session.user.id); } catch {}
  }
  if (commandChannel && client) await client.removeChannel(commandChannel).catch(() => undefined);
  commandChannel = null;
  logInfo('Conteenua cloud control stopped');
}
