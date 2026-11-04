export interface Peer {
  id: string;
  name: string | null;
}

export interface GameClientOptions {
  /** 注入 WebSocket 实现（Node 下传入 ws 包的 WebSocket）。 */
  WebSocketImpl?: typeof WebSocket;
}

export class GameClient {
  constructor(url: string, opts?: GameClientOptions);
  id: string | null;
  game: string | null;
  room: string | null;
  ws: WebSocket | null;

  on(event: string, fn: (data: any) => void): this;
  off(event: string, fn: (data: any) => void): this;
  connect(): Promise<this>;
  join(options?: {
    game?: string;
    room?: string;
    name?: string;
    token?: string;
  }): void;
  send(payload: Record<string, unknown>): void;
  leave(): void;
  close(): void;
}
