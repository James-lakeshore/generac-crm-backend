require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

let Lead = null;
const MONGO_URI = process.env.MONGO_URI;

// connect to Mongo and define the Lead model if configured
(async function connectIfConfigured() {
  if (!MONGO_URI) {
    console.warn('MONGO_URI not set — API will run without DB');
    return;
  }
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    const schema = new mongoose.Schema({
      name: String, email: String, phone: String, message: String,
      source: { type: String, default: 'tally' },
      status: { type: String, default: 'new' },
      meta: Object
    }, { timestamps: true });
    Lead = mongoose.models.Lead || mongoose.model('Lead', schema);
    console.log('MongoDB connected');
  } catch (e) {
    console.error('MongoDB connection error:', e.message);
  }
})();

// healthcheck
app.get('/api/health', (_req, res) => {
  const dbState = mongoose.connection && mongoose.connection.readyState;
  res.status(200).json({ ok: true, time: new Date().toISOString(), dbState: dbState ?? -1 });
});

// ---- Leads API ----
app.get('/api/leads', async (_req, res) => {
  try {
    if (!Lead) return res.status(200).json({ ok: true, count: 0, leads: [] });
    const leads = await Lead.find({}).sort({ createdAt: -1 }).limit(200);
    res.json({ ok: true, count: leads.length, leads });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    if (!Lead) return res.status(503).json({ ok: false, error: 'DB not connected' });
    const b = req.body || {};
    const lead = await Lead.create({
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      message: b.message || '',
      source: 'api',
      status: 'new',
      meta: b.meta || {}
    });
    res.status(201).json({ ok: true, lead });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ---- Tally webhook ----
app.post('/api/webhooks/tally', async (req, res) => {
  const p = req.body || {};
  const name = p.name || p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim();
  const email = p.email || (p.answers && p.answers.email);
  const phone = p.phone || (p.answers && p.answers.phone);
  const message = p.message || p.notes || JSON.stringify(p.answers || p, null, 2);

  if (Lead && mongoose.connection.readyState === 1) {
    try {
      const lead = await Lead.create({ name, email, phone, message, source: 'tally', status: 'new', meta: p });
      return res.status(200).json({ ok: true, received: true, saved: true, leadId: lead._id.toString() });
    } catch (e) {
      console.error('DB save error:', e.message);
    }
  } else {
    console.log('Webhook received (no DB configured):', { name, email, phone });
  }
  return res.status(200).json({ ok: true, received: true, saved: !!Lead });
});

// 404 last
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
