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
  if (!MONGO_URI) { console.warn('MONGO_URI not set — API will run without DB'); return; }
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    const schema = new mongoose.Schema({
      name: String,
      email: String,
      phone: String,
      message: String,
      source: { type: String, default: 'tally' },
      status: { type: String, default: 'new' },
      meta: Object
    }, { timestamps: true });
    Lead = mongoose.models.Lead || mongoose.model('Lead', schema);
    console.log('MongoDB connected');
  } catch (e) { console.error('MongoDB connection error:', e.message); }
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
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
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
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

// helper: find a field by label from Tally's fields[]
function findField(fields, labelOptions) {
  if (!Array.isArray(fields)) return null;
  const norm = s => String(s || '').trim().toLowerCase();
  const wanted = labelOptions.map(norm);
  const hit = fields.find(f => wanted.includes(norm(f.label)));
  return hit ? hit.value : null;
}

// ---- Tally webhook (parses labels) ----
app.post('/api/webhooks/tally', async (req, res) => {
  // Optional shared secret (safe to leave unset)
  const required = process.env.TALLY_SECRET;
  const provided = req.query.secret || req.get('x-tally-secret');
  if (required && provided !== required) {
    return res.status(401).json({ ok: false, error: 'Unauthorized webhook' });
  }

  const p = req.body || {};
  const fields = p?.data?.fields;

  // Parse common labels from your Tally form
  const first = findField(fields, ['First name', 'First Name', 'First']);
  const last  = findField(fields,  ['Last name', 'Last Name', 'Last']);
  const email = findField(fields,  ['Email', 'E-mail']);
  const phone = findField(fields,  ['Phone number', 'Phone', 'Phone Number']);
  const msg   = findField(fields,  ['Your question', 'Message', 'Notes', 'Comments']);

  const name = `${first || ''} ${last || ''}`.trim() || p.name || p.fullName || '';

  if (Lead && mongoose.connection.readyState === 1) {
    try {
      const lead = await Lead.create({
        name, email, phone,
        message: msg || '',
        source: 'tally',
        status: 'new',
        meta: p
      });
      return res.status(200).json({ ok: true, received: true, saved: true, leadId: lead._id.toString() });
    } catch (e) {
      console.error('DB save error:', e.message);
      return res.status(500).json({ ok: false, error: 'DB save error' });
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
