import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './session-manager.js';
import { scanSkillsAndAgents } from './skills-scanner.js';
import { readClaudeMd, writeClaudeMd } from './claude-md.js';
import { loadConfig, saveConfig, clearConfigCache } from './config.js';
import { scanConfig } from './config-scanner.js';

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
    const { cwd, prompt, permissionMode, name, includeContext } = req.body;
    if (!cwd || !prompt) {
      res.status(400).json({ error: 'cwd and prompt are required' });
      return;
    }

    let fullPrompt = prompt;
    if (includeContext) {
      const context = manager.getRecentActivity();
      if (context) {
        fullPrompt = `<cross-session-context>\n${context}\n</cross-session-context>\n\n${prompt}`;
      }
    }

    const session = manager.spawn(cwd, fullPrompt, permissionMode || 'autonomous', name);
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

app.get('/api/skills', async (_req, res) => {
  const projectDirs = manager.list().map(s => s.cwd);
  const skills = await scanSkillsAndAgents(projectDirs);
  res.json(skills);
});

app.get('/api/context', (_req, res) => {
  res.json({ context: manager.getRecentActivity() });
});

app.get('/api/claude-md', async (req, res) => {
  const cwd = req.query.cwd as string;
  if (!cwd) { res.status(400).json({ error: 'cwd query param required' }); return; }
  const info = await readClaudeMd(cwd);
  res.json(info);
});

app.put('/api/claude-md', async (req, res) => {
  const { cwd, content } = req.body;
  if (!cwd || content === undefined) { res.status(400).json({ error: 'cwd and content required' }); return; }
  try {
    await writeClaudeMd(cwd, content);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Config
app.get('/api/config', async (_req, res) => {
  const config = await loadConfig();
  res.json(config);
});

app.put('/api/config', async (req, res) => {
  try {
    await saveConfig(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Extensions (MCP servers, plugins, hooks)
app.get('/api/extensions', async (_req, res) => {
  const projectDirs = manager.list().map(s => s.cwd);
  const overview = await scanConfig(projectDirs);
  res.json(overview);
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
