import type http from "node:http";
import { type WebSocket, WebSocketServer } from "ws";
import { extractBearerToken, tokensMatch } from "../auth.js";
import type { Engine } from "../engine/engine.js";
import type { EngineEvent, IEventBusAdapter } from "../engine/event-types.js";

export interface WebSocketBroadcasterDeps {
  server: http.Server;
  engine: Engine;
  adminToken: string;
}

export class WebSocketBroadcaster implements IEventBusAdapter {
  private wss: WebSocketServer;
  private engine: Engine;
  private adminToken: string;

  constructor(deps: WebSocketBroadcasterDeps) {
    this.engine = deps.engine;
    this.adminToken = deps.adminToken;
    this.wss = new WebSocketServer({ noServer: true });

    deps.server.on("upgrade", (req, socket, head) => {
      if (!this.isWsPath(req.url)) {
        socket.destroy();
        return;
      }

      if (!this.authenticate(req)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit("connection", ws, req);
      });
    });

    this.wss.on("connection", (ws) => {
      this.sendSnapshot(ws);
      ws.on("close", () => {
        // Client removed automatically from wss.clients on close
      });
    });
  }

  private isWsPath(url: string | undefined): boolean {
    if (!url) return false;
    const pathname = url.split("?")[0];
    return pathname === "/ws";
  }

  private authenticate(req: http.IncomingMessage): boolean {
    // Require Authorization header — query-string tokens are rejected
    // to prevent token exposure in server logs and browser history.
    const callerToken = extractBearerToken(req.headers.authorization);
    if (!callerToken) return false;
    return tokensMatch(this.adminToken, callerToken);
  }

  private async sendSnapshot(ws: WebSocket): Promise<void> {
    try {
      const status = await this.engine.getStatus();
      const msg = JSON.stringify({
        type: "snapshot",
        payload: { status },
        timestamp: new Date().toISOString(),
      });
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    } catch {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "snapshot",
            payload: { status: { flows: {}, activeInvocations: 0, pendingClaims: 0 } },
            timestamp: new Date().toISOString(),
          }),
        );
      }
    }
  }

  async emit(event: EngineEvent): Promise<void> {
    const { type, emittedAt, ...rest } = event;
    const msg = JSON.stringify({
      type,
      payload: rest,
      timestamp: emittedAt.toISOString(),
    });
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(msg);
      }
    }
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  close(): Promise<void> {
    for (const client of this.wss.clients) {
      client.terminate();
    }
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
