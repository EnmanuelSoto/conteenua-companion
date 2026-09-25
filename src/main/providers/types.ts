export type CodingProviderId = 'chatgpt';
export type CodingAdapterId = 'chatgpt_official_mcp' | 'chatgpt_browser';

export type CodingProviderAvailability = {
  provider: CodingProviderId;
  adapter: CodingAdapterId;
  available: boolean;
  writableTools: boolean;
  detail: string;
};

export interface LocalCodingProvider {
  readonly provider: CodingProviderId;
  readonly adapter: CodingAdapterId;
  availability(): Promise<CodingProviderAvailability>;
  start(projectId: string, prompt: string): Promise<{ localSessionId: string | null; inputId: string }>;
  followup(localSessionId: string, text: string): Promise<{ inputId: string }>;
  stop(localSessionId: string): Promise<void>;
  pause(localSessionId: string): Promise<void>;
  resume(localSessionId: string): Promise<void>;
  open(localSessionId: string): Promise<void>;
}
