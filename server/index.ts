import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './session-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3002', 10);
const app = express();
const server = createServer(app);

app.use(express.json());

const manager = new SessionManager();

// REST API
app.get('/api/sessions', (_req, res) => {
  res.json(manager.list());
});

app.get('/api/sessions/:id', (req, res) => {
  const session = manager.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

app.post('/api/sessions', (req, res) => {
  try {
    const { cwd, prompt, permissionMode, name } = req.body;
    if (!cwd || !prompt) {
      res.status(400).json({ error: 'cwd and prompt are required' });
      return;
    }
    const session = manager.spawn(cwd, prompt, permissionMode || 'autonomous', name);
    res.status(201).json(session);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.patch('/api/sessions/:id', (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  manager.rename(req.params.id, name);
  res.json({ ok: true });
});

app.delete('/api/sessions/:id', async (req, res) => {
  await manager.kill(req.params.id);
  res.json({ ok: true });
});

app.post('/api/sessions/:id/retry', async (req, res) => {
  await manager.retrySession(req.params.id);
  res.json({ ok: true });
});

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientDir = join(__dirname, '..', 'client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDir, 'index.html'));
  });
}

// WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  manager.addClient(ws);

  // Send current sessions on connect
  const sessions = manager.list();
  ws.send(JSON.stringify({ event: 'init', data: { sessions } }));

  ws.on('message', async (raw: Buffer) => {
    try {
      const { event, data } = JSON.parse(raw.toString());

      switch (event) {
        case 'session:input':
          await manager.sendInput(data.id, data.text);
          break;
        case 'session:approve':
          manager.approve(data.id, data.requestId);
          break;
        case 'session:deny':
          manager.deny(data.id, data.requestId);
          break;
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Claude Monitor server running on http://localhost:${PORT}`);
});
