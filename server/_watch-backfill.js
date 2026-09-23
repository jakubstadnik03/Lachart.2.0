require('dotenv').config();
const mongoose = require('mongoose');
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const Garmin = require('./models/GarminActivity');
  for (let i = 0; i < 14; i++) {
    const acts = await Garmin.find({ userId: '6aa15d709be1ce4583178671' })
      .select('garminId sport startDate distance laps updatedAt').sort({ startDate: -1 }).limit(12).lean();
    const touched = acts.filter(a => new Date(a.updatedAt) >= TODAY);
    if (touched.length) {
      console.log(`PŘEPOČÍTÁNO: ${touched.length}/${acts.length} aktivit má dnešní updatedAt\n`);
      console.log('datum       sport        celkem   lapů  součet   poměr');
      for (const a of acts) {
        const laps = a.laps || [];
        const sum = laps.reduce((s,l) => s + (Number(l.distance)||0), 0);
        const tot = Number(a.distance) || 0;
        console.log(
          new Date(a.startDate).toISOString().slice(0,10).padEnd(12),
          String(a.sport||'').slice(0,11).padEnd(12),
          String(Math.round(tot)).padStart(6),
          String(laps.length).padStart(5),
          String(Math.round(sum)).padStart(8),
          (tot>0 ? (sum/tot*100).toFixed(1) : '0').padStart(6)+'%',
          new Date(a.updatedAt) >= TODAY ? '← nově' : ''
        );
      }
      await mongoose.disconnect(); process.exit(0);
    }
    await new Promise(r => setTimeout(r, 90000));
  }
  console.log('TIMEOUT po ~21 min — backfill zatím žádnou z těch 12 aktivit nepřepsal');
  await mongoose.disconnect(); process.exit(1);
})().catch(e => { console.error('CHYBA:', e.message); process.exit(1); });
