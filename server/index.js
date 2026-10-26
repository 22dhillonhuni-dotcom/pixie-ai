import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMime = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.txt', '.md', '.json', '.csv'];

    if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
      return;
    }

    cb(new Error('Unsupported file type. Please upload .txt, .md, .json, or .csv files.'));
  },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (req, res) => {
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY);
  res.json({
    aiConfigured,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    signModelConfigured: false,
    voiceSupport: 'browser',
  });
});

app.post('/api/chat', async (req, res) => {
  const { messages, personality, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'A valid message history is required.' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: 'AI service is not configured. Add OPENAI_API_KEY to the backend environment to enable live chat responses.',
      code: 'config_missing',
    });
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: personality || 'You are Pixiegurlll, a helpful AI companion.' },
          ...messages.map(({ role, content }) => ({ role, content })),
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const detail = errorPayload?.error?.message || 'The AI provider rejected the request.';
      res.status(response.status).json({ error: detail });
      return;
    }

    const payload = await response.json();
    const reply = payload.choices?.[0]?.message?.content;

    if (!reply) {
      res.status(502).json({ error: 'The provider returned an empty response.' });
      return;
    }

    res.json({ message: reply, model: payload.model || model || process.env.OPENAI_MODEL || 'gpt-4o-mini' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error while contacting the AI provider.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/analyze-document', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file was uploaded.' });
    return;
  }

  const text = req.file.buffer.toString('utf-8').trim();
  if (!text) {
    res.status(400).json({ error: 'The uploaded file is empty.' });
    return;
  }

  const summary = `Validated ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB). The document content is available for analysis in a secure backend workflow.`;
  res.json({
    filename: req.file.originalname,
    size: req.file.size,
    summary,
    content: text.slice(0, 1800),
  });
});

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Pixiegurlll AI server listening on http://localhost:${port}`);
});
