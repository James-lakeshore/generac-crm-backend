const express = require(express);
const Lead = require(../models/Lead);
const router = express.Router();
router.get(/, async (req, res) => {
  const { status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.$or = [
    { name: new RegExp(q, i) }, { email: new RegExp(q, i) },
    { phone: new RegExp(q, i) }, { message: new RegExp(q, i) },
  ];
  const leads = await Lead.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ ok: true, count: leads.length, leads });
});
router.get(/:id, async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ ok:false, error:Lead
