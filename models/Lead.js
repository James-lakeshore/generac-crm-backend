const mongoose = require(mongoose);
const LeadSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  message: { type: String, trim: true },
  source: { type: String, trim: true, default: tally },
  status: { type: String, enum: [new,contacted,quoted,closed_won,closed_lost], default: new },
  meta: { type: Object }
}, { timestamps: true });
module.exports = mongoose.model(Lead, LeadSchema);
