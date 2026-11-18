export type MemoryItem = {
  id: string;
  memory: string;
  kind: "static" | "dynamic" | "match";
  similarity?: number;
};

export type MemoryProfile = { static: MemoryItem[]; dynamic: MemoryItem[] };

export type RememberInput = {
  id: string;
  content: string;
  metadata: Record<string, string | number | boolean>;
  instant: boolean;
};

export interface MemoryProvider {
  profile(namespace: string): Promise<MemoryProfile>;
  search(
    namespace: string,
    query: string,
    options: { limit: number; threshold?: number },
  ): Promise<MemoryItem[]>;
  remember(namespace: string, input: RememberInput): Promise<void>;
  previewForget(namespace: string, query: string): Promise<MemoryItem[]>;
  forget(namespace: string, ids: string[]): Promise<void>;
  dropNamespace(namespace: string): Promise<void>;
}
