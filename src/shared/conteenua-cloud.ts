export type ConteenuaCloudStatus = {
  configured: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  deviceId: string | null;
  deviceName: string;
  lastHeartbeatAt: number | null;
  realtime: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
};

export type ConteenuaRemoteSession = {
  id: string;
  projectId: string;
  localSessionId: string | null;
  status: string;
};
