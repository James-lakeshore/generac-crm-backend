require('dotenv').config();
const express = require('express'); const cors = require('cors');
const helmet = require('helmet');   const morgan = require('morgan');
const mongoose = require('mongoose');

const app = express();
app.use(helmet()); app.use(cors()); app.use(express.json({limit:'1mb'})); app.use(morgan('dev'));

let Lead=null;
(async () => {
  if (!process.env.MONGO_URI) return;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    const schema = new mongoose.Schema({ name:String,email:String,phone:String,message:String,source:{type:String,default:'tally'},status:{type:String,default:'new'},meta:Object },{timestamps:true});
    Lead = mongoose.models.Lead || mongoose.model('Lead', schema);
    console.log('MongoDB connected');
  } catch (e) { console.error('MongoDB connection error:', e.message); }
})();

app.get('/api/health', (_req,res)=>res.status(200).json({ok:true,time:new Date().toISOString()}));
app.post('/api/webhooks/tally', async (req,res)=>{
  const p=req.body||{}; const name=p.name||p.fullName||`${p.firstName||''} ${p.lastName||''}`.trim();
  const email=p.email||(p.answers&&p.answers.email); const phone=p.phone||(p.answers&&p.answers.phone);
  const message=p.message||p.notes||JSON.stringify(p.answers||p);
  if(Lead && mongoose.connection.readyState===1){ try{ const d=await Lead.create({name,email,phone,message,source:'tally',status:'new',meta:p}); return res.json({ok:true,saved:true,leadId:d._id.toString()}); }catch(e){ console.error('DB save error:',e.message);} }
  return res.json({ok:true,received:true,saved:false});
});
app.use((_req,res)=>res.status(404).json({ok:false,error:'Not found'}));
const port=process.env.PORT||4000; app.listen(port,()=>console.log(`API listening on http://localhost:${port}`));
