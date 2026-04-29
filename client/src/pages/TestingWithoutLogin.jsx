import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import TestingForm from '../components/Testing-page/TestingForm';
import LactateCurve from '../components/Testing-page/LactateCurve';
import { useNotification } from '../context/NotificationContext';
import Header from '../components/Header/Header';
import Menu from '../components/Menu';
import Footer from '../components/Footer';
import { trackEvent, trackConversionFunnel, trackUserRegistration } from '../utils/analytics';
import { Helmet } from 'react-helmet';
import { register } from '../services/api';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { saveUserToStorage } from '../utils/userStorage';
import { GoogleLogin } from '@react-oauth/google';
import { API_BASE_URL } from '../config/api.config';
import { logUserRegistration, logTestCreated } from '../utils/eventLogger';
import { isCapacitorNative } from '../utils/isNativeApp';
import {
  BeakerIcon,
  BoltIcon,
  HeartIcon,
  TrophyIcon,
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  SunIcon,
  ScaleIcon,
} from '@heroicons/react/24/outline';

// ─── Calculator helpers ────────────────────────────────────────────────────────
const secsToHMS = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
};
const parsePace = (str) => {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0]*60 + parts[1];
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  return null;
};
const calcFTP = (p20, weight) => {
  const ftp = Math.round(p20 * 0.95);
  const wkg = (ftp / weight).toFixed(2);
  const z = (pct) => Math.round(ftp * pct);
  const zones = [
    { name:'Z1 Active Recovery', range:`< ${z(0.55)} W`, color:'#60a5fa' },
    { name:'Z2 Endurance',       range:`${z(0.55)}–${z(0.75)} W`, color:'#34d399' },
    { name:'Z3 Tempo',           range:`${z(0.75)}–${z(0.90)} W`, color:'#fbbf24' },
    { name:'Z4 Threshold',       range:`${z(0.90)}–${z(1.05)} W`, color:'#f97316' },
    { name:'Z5 VO2max',          range:`${z(1.05)}–${z(1.20)} W`, color:'#ef4444' },
    { name:'Z6 Anaerobic',       range:`${z(1.20)}–${z(1.50)} W`, color:'#dc2626' },
    { name:'Z7 Neuromuscular',   range:`> ${z(1.50)} W`, color:'#7c3aed' },
  ];
  let profile = 'Recreational';
  if (wkg >= 6.4) profile = 'World Class';
  else if (wkg >= 5.5) profile = 'Pro/Elite';
  else if (wkg >= 4.6) profile = 'Cat 1/2';
  else if (wkg >= 3.7) profile = 'Cat 3/4';
  else if (wkg >= 2.5) profile = 'Trained';
  return { ftp, wkg, zones, profile };
};
const calcVO2max = (p5, weight) => {
  const vo2 = (p5 * 10.8 / weight) + 7;
  let cls, color;
  if (vo2 >= 70) { cls='Elite / World Class'; color='#7c3aed'; }
  else if (vo2 >= 60) { cls='Excellent'; color='#2563eb'; }
  else if (vo2 >= 50) { cls='Good'; color='#16a34a'; }
  else if (vo2 >= 40) { cls='Average'; color='#ca8a04'; }
  else if (vo2 >= 30) { cls='Below Average'; color='#ea580c'; }
  else { cls='Poor'; color='#dc2626'; }
  const fraction = Math.min(1, (vo2 - 20) / 60);
  return { vo2: vo2.toFixed(1), cls, color, fraction };
};
const calcRace = (refKm, refSecs) => [
  { name:'1 km',         km:1 },
  { name:'5 km',         km:5 },
  { name:'10 km',        km:10 },
  { name:'Half Marathon',km:21.0975 },
  { name:'Marathon',     km:42.195 },
].map(d => ({ ...d, secs: refSecs * Math.pow(d.km / refKm, 1.06) }));
const calcTSS = (durSecs, np, ftp) => {
  const h = durSecs / 3600;
  const IF = np / ftp;
  const tss = Math.round(h * IF * IF * 100);
  let label, color;
  if (tss < 50) { label='Recovery'; color='#16a34a'; }
  else if (tss < 100) { label='Moderate'; color='#ca8a04'; }
  else if (tss < 150) { label='High'; color='#ea580c'; }
  else { label='Very High'; color='#dc2626'; }
  return { IF: IF.toFixed(2), tss, label, color };
};
const calcZones = (ftp, lthr, threshPaceSecs) => {
  const pw = ftp ? [
    { n:'Z1', pct:'< 55%',  w:`0–${Math.round(ftp*0.55)} W` },
    { n:'Z2', pct:'55–75%', w:`${Math.round(ftp*0.55)}–${Math.round(ftp*0.75)} W` },
    { n:'Z3', pct:'75–90%', w:`${Math.round(ftp*0.75)}–${Math.round(ftp*0.90)} W` },
    { n:'Z4', pct:'90–105%',w:`${Math.round(ftp*0.90)}–${Math.round(ftp*1.05)} W` },
    { n:'Z5', pct:'105–120%',w:`${Math.round(ftp*1.05)}–${Math.round(ftp*1.20)} W` },
    { n:'Z6', pct:'120–150%',w:`${Math.round(ftp*1.20)}–${Math.round(ftp*1.50)} W` },
    { n:'Z7', pct:'> 150%', w:`> ${Math.round(ftp*1.50)} W` },
  ] : null;
  const hr = lthr ? [
    { n:'Z1',w:`< ${Math.round(lthr*0.68)} bpm` },
    { n:'Z2',w:`${Math.round(lthr*0.68)}–${Math.round(lthr*0.83)} bpm` },
    { n:'Z3',w:`${Math.round(lthr*0.83)}–${Math.round(lthr*0.94)} bpm` },
    { n:'Z4',w:`${Math.round(lthr*0.94)}–${Math.round(lthr*1.05)} bpm` },
    { n:'Z5',w:`> ${Math.round(lthr*1.05)} bpm` },
  ] : null;
  const run = threshPaceSecs ? [
    { n:'Z1',w:`> ${secsToHMS(threshPaceSecs*1.29)}/km` },
    { n:'Z2',w:`${secsToHMS(threshPaceSecs*1.14)}–${secsToHMS(threshPaceSecs*1.29)}/km` },
    { n:'Z3',w:`${secsToHMS(threshPaceSecs*1.06)}–${secsToHMS(threshPaceSecs*1.14)}/km` },
    { n:'Z4',w:`${secsToHMS(threshPaceSecs*0.99)}–${secsToHMS(threshPaceSecs*1.06)}/km` },
    { n:'Z5',w:`< ${secsToHMS(threshPaceSecs*0.99)}/km` },
  ] : null;
  return { pw, hr, run };
};
const calcHeat = (tempC, refSecs) => {
  const delta = Math.max(0, tempC - 15);
  const pct = delta * 0.5;
  return { pct: pct.toFixed(1), adjusted: secsToHMS(refSecs * (1 + pct/100)) };
};
const calcAlt = (altM, refSecs) => {
  const pct = altM < 1000 ? 0 : (altM - 1000) / 1000 * 1.1;
  return { pct: pct.toFixed(1), adjusted: secsToHMS(refSecs * (1 + pct/100)) };
};
const calcWeight = (curW, tarW, ftp) => {
  const wkgNow = (ftp / curW).toFixed(2);
  const wkgNew = (ftp / tarW).toFixed(2);
  const pct = ((tarW - curW) / curW * 100).toFixed(1);
  const flatDelta = (-pct * 0.4).toFixed(1);
  const climbDelta = (-pct * 1.8).toFixed(1);
  return { wkgNow, wkgNew, pct, flatDelta, climbDelta };
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────
const Label = ({ children }) => (
  <label className="block text-xs font-semibold text-gray-600 mb-1">{children}</label>
);
const Input = ({ ...props }) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
  />
);
const CalcBtn = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white text-sm font-semibold shadow hover:shadow-md hover:opacity-90 transition-all"
  >
    {children}
  </button>
);

// ─── Locked result overlay ────────────────────────────────────────────────────
const LockedResult = ({ onUnlock, children }) => (
  <div className="relative mt-6 rounded-2xl overflow-hidden min-h-[200px]">
    <div className="blur-sm pointer-events-none select-none opacity-60">{children}</div>
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md rounded-2xl p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <p className="text-base font-bold text-gray-900 mb-1">Your results are ready</p>
      <p className="text-xs text-gray-500 mb-4 max-w-[220px]">Create a free account to see the full analysis and save your data</p>
      <button
        onClick={onUnlock}
        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white text-sm font-semibold shadow hover:opacity-90 transition"
      >
        Unlock for free →
      </button>
    </div>
  </div>
);

// ─── Individual calculator panels ─────────────────────────────────────────────
function FTPCalc({ onUnlock }) {
  const [p20, setP20] = useState('');
  const [weight, setWeight] = useState('');
  const [result, setResult] = useState(null);
  const calc = () => {
    const r = calcFTP(+p20, +weight);
    setResult(r);
    trackEvent('calc_ftp');
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Best 20-min power (W)</Label><Input type="number" placeholder="e.g. 280" value={p20} onChange={e=>setP20(e.target.value)} /></div>
        <div><Label>Body weight (kg)</Label><Input type="number" placeholder="e.g. 72" value={weight} onChange={e=>setWeight(e.target.value)} /></div>
      </div>
      <CalcBtn onClick={calc}>Calculate FTP</CalcBtn>
      {result && (
        <LockedResult onUnlock={onUnlock}>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[{l:'FTP',v:`${result.ftp} W`},{l:'W/kg',v:result.wkg},{l:'Profile',v:result.profile}].map(i=>(
                <div key={i.l} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-gray-900">{i.v}</div>
                  <div className="text-[10px] text-gray-500">{i.l}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {result.zones.map(z=>(
                <div key={z.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{background:z.color}}/>
                  <span className="text-xs text-gray-700 flex-1">{z.name}</span>
                  <span className="text-xs font-semibold text-gray-800">{z.range}</span>
                </div>
              ))}
            </div>
          </div>
        </LockedResult>
      )}
    </div>
  );
}

function VO2maxCalc({ onUnlock }) {
  const [p5, setP5] = useState('');
  const [weight, setWeight] = useState('');
  const [result, setResult] = useState(null);
  return (
    <div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700 mb-3">
        Uses Sitko et al. (2022) formula from 5-min maximal cycling effort
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>5-min max power (W)</Label><Input type="number" placeholder="e.g. 350" value={p5} onChange={e=>setP5(e.target.value)} /></div>
        <div><Label>Body weight (kg)</Label><Input type="number" placeholder="e.g. 72" value={weight} onChange={e=>setWeight(e.target.value)} /></div>
      </div>
      <CalcBtn onClick={()=>{ setResult(calcVO2max(+p5,+weight)); trackEvent('calc_vo2max'); }}>
        Estimate VO2max
      </CalcBtn>
      {result && (
        <LockedResult onUnlock={onUnlock}>
          <div className="mt-4 space-y-4">
            <div className="text-center">
              <div className="text-4xl font-extrabold" style={{color:result.color}}>{result.vo2}</div>
              <div className="text-sm text-gray-500 mt-1">ml/kg/min</div>
              <div className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold text-white" style={{background:result.color}}>{result.cls}</div>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{width:`${result.fraction*100}%`,background:`linear-gradient(90deg,#34d399,#6366f1,#7c3aed)`}}/>
            </div>
            <div className="flex justify-between text-[9px] text-gray-400">
              <span>20 (Poor)</span><span>40</span><span>60</span><span>80+ (Elite)</span>
            </div>
          </div>
        </LockedResult>
      )}
    </div>
  );
}

function RaceCalc({ onUnlock }) {
  const [refDist, setRefDist] = useState('10');
  const [refTime, setRefTime] = useState('');
  const [result, setResult] = useState(null);
  const calc = () => {
    const s = parsePace(refTime);
    if (!s || !refDist) return;
    setResult(calcRace(+refDist, s));
    trackEvent('calc_race');
  };
  return (
    <div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700 mb-3">
        Riegel model: T₂ = T₁ × (D₂/D₁)^1.06
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Reference distance (km)</Label>
          <select value={refDist} onChange={e=>setRefDist(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 outline-none">
            {[1,5,10,21.0975,42.195].map(d=>(
              <option key={d} value={d}>{d===21.0975?'Half Marathon':d===42.195?'Marathon':`${d} km`}</option>
            ))}
          </select>
        </div>
        <div><Label>Reference time (h:mm:ss or mm:ss)</Label><Input placeholder="e.g. 42:00" value={refTime} onChange={e=>setRefTime(e.target.value)} /></div>
      </div>
      <CalcBtn onClick={calc}>Predict Race Times</CalcBtn>
      {result && (
        <LockedResult onUnlock={onUnlock}>
          <div className="mt-4 space-y-2">
            {result.map(d=>(
              <div key={d.name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700">{d.name}</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-gray-900">{secsToHMS(d.secs)}</span>
                  <div className="text-[10px] text-gray-400">{secsToHMS(d.secs/d.km*1000)} /km</div>
                </div>
              </div>
            ))}
          </div>
        </LockedResult>
      )}
    </div>
  );
}

function TSSCalc({ onUnlock }) {
  const [h,setH]=useState(''); const [m,setM]=useState(''); const [np,setNp]=useState(''); const [ftp,setFtp]=useState('');
  const [result,setResult]=useState(null);
  const calc=()=>{ const s=(+h||0)*3600+(+m||0)*60; if(!s||!np||!ftp) return; setResult(calcTSS(s,+np,+ftp)); trackEvent('calc_tss'); };
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Duration (hours)</Label><Input type="number" placeholder="1" value={h} onChange={e=>setH(e.target.value)}/></div>
        <div><Label>Duration (minutes)</Label><Input type="number" placeholder="30" value={m} onChange={e=>setM(e.target.value)}/></div>
        <div><Label>Normalized Power / avg (W)</Label><Input type="number" placeholder="240" value={np} onChange={e=>setNp(e.target.value)}/></div>
        <div><Label>Your FTP (W)</Label><Input type="number" placeholder="280" value={ftp} onChange={e=>setFtp(e.target.value)}/></div>
      </div>
      <CalcBtn onClick={calc}>Calculate Training Load</CalcBtn>
      {result && (
        <LockedResult onUnlock={onUnlock}>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[{l:'IF',v:result.IF},{l:'TSS',v:result.tss},{l:'Load',v:result.label}].map(i=>(
              <div key={i.l} className="rounded-xl p-3 text-center" style={{background:i.l==='Load'?result.color+'22':'#f9fafb'}}>
                <div className="text-xl font-bold" style={{color:i.l==='Load'?result.color:'#111827'}}>{i.v}</div>
                <div className="text-[10px] text-gray-500">{i.l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
            IF = {result.IF} — TSS = {result.tss} — {result.tss < 50?'Easy recovery day, minimal fatigue':result.tss<100?'Moderate session, 1–2 days to recover':result.tss<150?'Hard session, 2–3 days to full recovery':'Very demanding, 3+ days to recover'}
          </div>
        </LockedResult>
      )}
    </div>
  );
}

function ZonesCalc({ onUnlock }) {
  const [ftp,setFtp]=useState(''); const [lthr,setLthr]=useState(''); const [pace,setPace]=useState('');
  const [result,setResult]=useState(null);
  const calc=()=>{ const ps=parsePace(pace); if(!ftp&&!lthr&&!pace) return; setResult(calcZones(+ftp||null,+lthr||null,ps)); trackEvent('calc_zones'); };
  const ZTable=({rows})=>(
    <div className="space-y-1">
      {rows.map((r,i)=>(
        <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
          <span className="w-8 text-xs font-bold text-primary">{r.n}</span>
          <span className="text-xs text-gray-700 flex-1">{r.w}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">Fill in at least one field. All zones use your threshold values.</p>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>FTP (W) — power zones</Label><Input type="number" placeholder="280" value={ftp} onChange={e=>setFtp(e.target.value)}/></div>
        <div><Label>LTHR (bpm) — HR zones</Label><Input type="number" placeholder="165" value={lthr} onChange={e=>setLthr(e.target.value)}/></div>
        <div><Label>Threshold pace (mm:ss/km)</Label><Input placeholder="4:10" value={pace} onChange={e=>setPace(e.target.value)}/></div>
      </div>
      <CalcBtn onClick={calc}>Generate Zones</CalcBtn>
      {result && (
        <LockedResult onUnlock={onUnlock}>
          <div className="mt-4 grid grid-cols-1 gap-4">
            {result.pw && <div><p className="text-xs font-bold text-gray-700 mb-2">Power Zones (Coggan 7-zone)</p><ZTable rows={result.pw}/></div>}
            {result.hr && <div><p className="text-xs font-bold text-gray-700 mb-2">Heart Rate Zones</p><ZTable rows={result.hr}/></div>}
            {result.run && <div><p className="text-xs font-bold text-gray-700 mb-2">Run Pace Zones</p><ZTable rows={result.run}/></div>}
          </div>
        </LockedResult>
      )}
    </div>
  );
}

function EnvCalc({ onUnlock }) {
  const [tab,setTab]=useState('heat');
  const [temp,setTemp]=useState(''); const [alt,setAlt]=useState(''); const [time,setTime]=useState('');
  const [result,setResult]=useState(null);
  const calc=()=>{
    const s=parsePace(time); if(!s) return;
    setResult(tab==='heat'?{type:'heat',...calcHeat(+temp,s)}:{type:'alt',...calcAlt(+alt,s)});
    trackEvent('calc_env');
  };
  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[{k:'heat',l:'Heat & Humidity'},{k:'alt',l:'Altitude'}].map(t=>(
          <button key={t.k} onClick={()=>{setTab(t.k);setResult(null);}} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${tab===t.k?'bg-primary text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t.l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tab==='heat' ? (
          <div><Label>Temperature (°C)</Label><Input type="number" placeholder="28" value={temp} onChange={e=>setTemp(e.target.value)}/></div>
        ) : (
          <div><Label>Altitude (m)</Label><Input type="number" placeholder="2000" value={alt} onChange={e=>setAlt(e.target.value)}/></div>
        )}
        <div><Label>Sea-level time (h:mm:ss)</Label><Input placeholder="3:30:00" value={time} onChange={e=>setTime(e.target.value)}/></div>
      </div>
      {tab==='heat' && <p className="text-[10px] text-gray-400 mt-1">Based on Ely et al. (2007) — ~0.5% slowdown per °C above 15°C</p>}
      {tab==='alt' && <p className="text-[10px] text-gray-400 mt-1">~1.1% per 1000m above 1000m altitude (Péronnet model)</p>}
      <CalcBtn onClick={calc}>Calculate Adjustment</CalcBtn>
      {result && (
        <LockedResult onUnlock={onUnlock}>
          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Original time</div>
              <div className="text-xl font-bold text-gray-900">{secsToHMS(parsePace(time))}</div>
            </div>
            <div className="bg-orange-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Adjusted time</div>
              <div className="text-xl font-bold text-orange-600">{result.adjusted}</div>
            </div>
            <div className="col-span-2 bg-gray-50 rounded-xl p-3 text-sm">
              Expected slowdown: <span className="font-bold text-orange-600">+{result.pct}%</span>
            </div>
          </div>
        </LockedResult>
      )}
    </div>
  );
}

function WeightCalc({ onUnlock }) {
  const [curW,setCurW]=useState(''); const [tarW,setTarW]=useState(''); const [ftp,setFtp]=useState('');
  const [result,setResult]=useState(null);
  const calc=()=>{ if(!curW||!tarW||!ftp) return; setResult(calcWeight(+curW,+tarW,+ftp)); trackEvent('calc_weight'); };
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Current weight (kg)</Label><Input type="number" placeholder="80" value={curW} onChange={e=>setCurW(e.target.value)}/></div>
        <div><Label>Target weight (kg)</Label><Input type="number" placeholder="75" value={tarW} onChange={e=>setTarW(e.target.value)}/></div>
        <div><Label>Current FTP (W)</Label><Input type="number" placeholder="280" value={ftp} onChange={e=>setFtp(e.target.value)}/></div>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">Assumes same absolute power output. Flat: ~0.4% speed/kg, Climbing: ~1.8% speed/kg</p>
      <CalcBtn onClick={calc}>Calculate Impact</CalcBtn>
      {result && (
        <LockedResult onUnlock={onUnlock}>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{result.wkgNow} W/kg</div>
                <div className="text-[10px] text-gray-500">Current</div>
              </div>
              <div className="bg-primary/5 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-primary">{result.wkgNew} W/kg</div>
                <div className="text-[10px] text-gray-500">At target weight</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <div className="font-bold text-green-700">+{Math.abs(+result.flatDelta)}% speed</div>
                <div className="text-[10px] text-gray-500">Flat terrain</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <div className="font-bold text-emerald-700">+{Math.abs(+result.climbDelta)}% speed</div>
                <div className="text-[10px] text-gray-500">Climbing</div>
              </div>
            </div>
          </div>
        </LockedResult>
      )}
    </div>
  );
}

// ─── Registration modal ────────────────────────────────────────────────────────
function RegisterModal({ onClose, onGoogleSuccess, onGoogleError, onEmailSubmit, emailFormData, setEmailFormData, emailError, isSending }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('options'); // 'options' | 'email'
  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-primary to-violet-600 px-6 pt-6 pb-8 text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition">×</button>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <BeakerIcon className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold">Unlock your results</h2>
          <p className="text-sm text-white/80 mt-1">Free account — takes 30 seconds. Save all your tests and track progress over time.</p>
        </div>

        <div className="px-6 py-5">
          {/* Role selector — shown in all modes */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">I am a…</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEmailFormData(p => ({...p, role: 'athlete'}))}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  emailFormData.role === 'athlete'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="text-xl">🏃</span>
                <span>Athlete</span>
                <span className="text-[10px] font-normal text-gray-400 leading-tight text-center">Track my own tests &amp; training</span>
              </button>
              <button
                type="button"
                onClick={() => setEmailFormData(p => ({...p, role: 'coach'}))}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  emailFormData.role === 'coach'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="text-xl">📋</span>
                <span>Coach</span>
                <span className="text-[10px] font-normal text-gray-400 leading-tight text-center">Manage athletes &amp; their tests</span>
              </button>
            </div>
          </div>

          {mode === 'options' && (
            <div className="space-y-3">
              {!isCapacitorNative() && (
                <div className="flex justify-center">
                  <GoogleLogin onSuccess={onGoogleSuccess} onError={onGoogleError} width="360" text="signup_with" shape="rectangular" theme="outline" />
                </div>
              )}
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200"/><span className="text-xs text-gray-400">or</span><div className="flex-1 h-px bg-gray-200"/>
              </div>
              <button onClick={()=>setMode('email')} className="w-full py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:border-primary hover:text-primary transition">
                Sign up with Email
              </button>
              <p className="text-center text-xs text-gray-500">
                Already have an account?{' '}
                <button onClick={()=>navigate('/login')} className="text-primary font-semibold hover:underline">Sign in</button>
              </p>
            </div>
          )}

          {mode === 'email' && (
            <form onSubmit={onEmailSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First name</Label><Input required placeholder="Jan" value={emailFormData.name} onChange={e=>setEmailFormData(p=>({...p,name:e.target.value}))}/></div>
                <div><Label>Last name</Label><Input required placeholder="Novák" value={emailFormData.surname} onChange={e=>setEmailFormData(p=>({...p,surname:e.target.value}))}/></div>
              </div>
              <div><Label>Email</Label><Input type="email" required placeholder="jan@example.com" value={emailFormData.email} onChange={e=>setEmailFormData(p=>({...p,email:e.target.value}))}/></div>
              <div><Label>Password (min 8 chars)</Label><Input type="password" required placeholder="••••••••" value={emailFormData.password} onChange={e=>setEmailFormData(p=>({...p,password:e.target.value}))}/></div>
              <div><Label>Confirm password</Label><Input type="password" required placeholder="••••••••" value={emailFormData.confirmPassword} onChange={e=>setEmailFormData(p=>({...p,confirmPassword:e.target.value}))}/></div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={emailFormData.termsAccepted} onChange={e=>setEmailFormData(p=>({...p,termsAccepted:e.target.checked}))} className="mt-0.5 rounded"/>
                <span className="text-xs text-gray-600">I agree to the <a href="/terms" className="text-primary underline">Terms</a> and <a href="/privacy" className="text-primary underline">Privacy Policy</a></span>
              </label>
              {emailError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{emailError}</p>}
              <button type="submit" disabled={isSending} className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white text-sm font-semibold disabled:opacity-50">
                {isSending ? 'Creating account…' : 'Create free account'}
              </button>
              <button type="button" onClick={()=>setMode('options')} className="w-full text-xs text-gray-500 hover:text-gray-700">← Back</button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Calculator tabs config ───────────────────────────────────────────────────
const TABS = [
  { id:'lactate', path:'/lactate-curve-calculator',    Icon:BeakerIcon,                  label:'Lactate Test',    desc:'LT1, LT2, OBLA & training zones from blood lactate data' },
  { id:'ftp',     path:'/ftp-calculator',              Icon:BoltIcon,                    label:'FTP & Power',     desc:'Functional Threshold Power, W/kg & Coggan zones' },
  { id:'vo2max',  path:'/vo2max-calculator',           Icon:HeartIcon,                   label:'VO2max',          desc:'Maximal oxygen uptake from 5-min all-out effort' },
  { id:'race',    path:'/race-predictor',              Icon:TrophyIcon,                  label:'Race Predictor',  desc:'Predict 5K–marathon times via Riegel model' },
  { id:'tss',     path:'/tss-calculator',              Icon:ChartBarIcon,                label:'Training Load',   desc:'TSS, Intensity Factor & session stress score' },
  { id:'zones',   path:'/training-zones-calculator',   Icon:AdjustmentsHorizontalIcon,   label:'Training Zones',  desc:'Power, HR & run pace zones from threshold values' },
  { id:'env',     path:'/heat-altitude-calculator',    Icon:SunIcon,                     label:'Heat & Altitude', desc:'Performance adjustments for conditions' },
  { id:'weight',  path:'/weight-calculator',           Icon:ScaleIcon,                   label:'Weight & Power',  desc:'Impact of body weight change on performance' },
];

const PATH_TO_TAB = Object.fromEntries(TABS.map(t => [t.path, t.id]));

const SEO_META = {
  lactate: { title:'Free Lactate Threshold Calculator — LT1, LT2 & Training Zones | LaChart', desc:'Calculate your lactate threshold (LT1 & LT2) from step test data. Get training zones, OBLA and PDF reports. Free, no login required.', canonical:'https://lachart.net/lactate-curve-calculator' },
  ftp:     { title:'Free FTP Calculator — Functional Threshold Power & Coggan Zones | LaChart', desc:'Calculate your FTP from a 20-minute test, get W/kg, 7 Coggan power zones and your cycling performance profile. Free online tool.', canonical:'https://lachart.net/ftp-calculator' },
  vo2max:  { title:'Free VO2max Estimator — Maximal Oxygen Uptake Calculator | LaChart', desc:'Estimate your VO2max from a 5-minute all-out cycling effort. See your aerobic classification and compare to world-class standards.', canonical:'https://lachart.net/vo2max-calculator' },
  race:    { title:'Free Race Time Predictor — 5K to Marathon Riegel Formula | LaChart', desc:'Predict your 5K, 10K, half-marathon and marathon time from any race result using the Riegel model. Free online race predictor.', canonical:'https://lachart.net/race-predictor' },
  tss:     { title:'Free TSS Calculator — Training Stress Score & Intensity Factor | LaChart', desc:'Calculate Training Stress Score (TSS) and Intensity Factor (IF) for any workout. Understand session intensity relative to your FTP.', canonical:'https://lachart.net/tss-calculator' },
  zones:   { title:'Free Training Zones Calculator — Power, HR & Run Pace Zones | LaChart', desc:'Generate personalised power, heart rate and run pace training zones from your FTP, LTHR and threshold pace. Free zone calculator.', canonical:'https://lachart.net/training-zones-calculator' },
  env:     { title:'Free Heat & Altitude Performance Calculator | LaChart', desc:'Calculate expected performance loss from heat and altitude. Adjust your race pace targets for temperature and elevation automatically.', canonical:'https://lachart.net/heat-altitude-calculator' },
  weight:  { title:'Free Weight vs Power Calculator — W/kg Impact on Performance | LaChart', desc:'See how losing or gaining body weight affects your W/kg, flat speed and climbing performance. Free cycling power-to-weight calculator.', canonical:'https://lachart.net/weight-calculator' },
};

// Per-tab hero H1 + subtitle (SEO-optimised, unique per URL)
const SEO_H1 = {
  lactate: { h1: 'Free Lactate Threshold Calculator',         sub: 'LT1, LT2 & OBLA from blood lactate step tests — instant training zones' },
  ftp:     { h1: 'FTP & Power Zones Calculator',              sub: 'Functional Threshold Power, W/kg and Coggan 7-zone model' },
  vo2max:  { h1: 'VO2max Calculator',                         sub: 'Estimate maximal oxygen uptake from a 5-minute all-out effort' },
  race:    { h1: 'Race Time Predictor',                       sub: 'Predict 5K to marathon finish times using the Riegel formula' },
  tss:     { h1: 'Training Stress Score Calculator',          sub: 'TSS and Intensity Factor for any cycling or running session' },
  zones:   { h1: 'Training Zones Calculator',                 sub: 'Power, heart rate and run pace zones from your threshold values' },
  env:     { h1: 'Heat & Altitude Performance Calculator',    sub: 'Adjust race pace targets for temperature, humidity and elevation' },
  weight:  { h1: 'Weight & Power Calculator',                 sub: 'See how body weight changes affect your W/kg and climbing speed' },
};

// ─── Main component ───────────────────────────────────────────────────────────
const TestingWithoutLogin = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const { login, isAuthenticated } = useAuth();
  const menuRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const activeTab = PATH_TO_TAB[location.pathname] || 'lactate';
  const activeTabMeta = SEO_META[activeTab] || SEO_META.lactate;
  const [showRegister, setShowRegister] = useState(false);

  // Lactate test state
  const [testData, setTestData] = useState(() => {
    try { const s=localStorage.getItem('testData'); if(s) return JSON.parse(s); } catch{}
    return { title:'',description:'',weight:'',sport:'bike',baseLa:'',date:new Date().toISOString().split('T')[0],specifics:{specific:'',weather:''},comments:'',results:[{interval:1,power:0,heartRate:0,lactate:0,glucose:0,RPE:0}] };
  });
  const [isDemoDropdownOpen, setIsDemoDropdownOpen] = useState(false);

  // Registration form state
  const [emailFormData, setEmailFormData] = useState({ email:'',name:'',surname:'',password:'',confirmPassword:'',role:'athlete',termsAccepted:false });
  const [emailError, setEmailError] = useState(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  useEffect(() => { localStorage.setItem('testData', JSON.stringify(testData)); }, [testData]);
  useEffect(() => { try { window.scrollTo(0,0); } catch{} }, []);
  useEffect(() => {
    const h=()=>setIsMenuOpen(window.innerWidth>=1024);
    h(); window.addEventListener('resize',h); return ()=>window.removeEventListener('resize',h);
  }, []);

  const emptyUser = { name:'',surname:'',email:'',role:'',sport:'',avatar:'' };

  const mockData = {
    bike: { title:'Lactate Test - Bike (Demo)',description:'Demo',weight:'75',sport:'bike',baseLa:'1.2',baseLactate:'1.2',date:new Date().toISOString().split('T')[0],specifics:{specific:'Indoor',weather:'20°C'},comments:'Demo',results:[{interval:1,power:'150',heartRate:'120',lactate:'1.5',glucose:'5.2',RPE:'3'},{interval:2,power:'200',heartRate:'145',lactate:'2.1',glucose:'5.4',RPE:'5'},{interval:3,power:'250',heartRate:'165',lactate:'3.2',glucose:'5.6',RPE:'7'},{interval:4,power:'300',heartRate:'180',lactate:'4.5',glucose:'5.8',RPE:'8'},{interval:5,power:'350',heartRate:'190',lactate:'6.8',glucose:'6.0',RPE:'9'}] },
    run:  { title:'Lactate Test - Run (Demo)',description:'Demo',weight:'70',sport:'run',baseLa:'1.1',baseLactate:'1.1',date:new Date().toISOString().split('T')[0],specifics:{specific:'Outdoor',weather:'18°C'},comments:'Demo',results:[{interval:1,power:'5:30',heartRate:'125',lactate:'1.4',glucose:'5.1',RPE:'3'},{interval:2,power:'5:00',heartRate:'150',lactate:'2.0',glucose:'5.3',RPE:'5'},{interval:3,power:'4:30',heartRate:'170',lactate:'3.0',glucose:'5.5',RPE:'7'},{interval:4,power:'4:00',heartRate:'185',lactate:'4.2',glucose:'5.7',RPE:'8'},{interval:5,power:'3:30',heartRate:'195',lactate:'6.5',glucose:'5.9',RPE:'9'}] },
    swim: { title:'Lactate Test - Swim (Demo)',description:'Demo',weight:'72',sport:'swim',baseLa:'1.0',baseLactate:'1.0',date:new Date().toISOString().split('T')[0],specifics:{specific:'Pool',weather:'26°C'},comments:'Demo',results:[{interval:1,power:'1:45',heartRate:'115',lactate:'1.3',glucose:'5.0',RPE:'3'},{interval:2,power:'1:35',heartRate:'140',lactate:'1.9',glucose:'5.2',RPE:'5'},{interval:3,power:'1:25',heartRate:'160',lactate:'2.8',glucose:'5.4',RPE:'7'},{interval:4,power:'1:15',heartRate:'175',lactate:'4.0',glucose:'5.6',RPE:'8'},{interval:5,power:'1:05',heartRate:'185',lactate:'6.2',glucose:'5.8',RPE:'9'}] },
  };

  const hasValidData = testData.results.some(r => {
    if (!r) return false;
    let p = r.power?.toString();
    const la = r.lactate?.toString().replace(',','.');
    if ((testData.sport==='run'||testData.sport==='swim') && p?.includes(':')) {
      const [mm,ss] = p.split(':').map(Number);
      if (isNaN(mm)||isNaN(ss)) return false;
      p = (mm*60+ss).toString();
    }
    return p && la && !isNaN(+p) && !isNaN(+la) && +p>0 && +la>0;
  });

  const prepareCalculatorData = () => {
    const baseLaStr = String(testData.baseLa ?? testData.baseLactate ?? '0');
    const baseLactate = baseLaStr==='' ? 0 : parseFloat(baseLaStr.replace(',','.'));
    return {
      ...testData, baseLactate,
      results: testData.results.map((r,i) => {
        if (!r) return null;
        let p = r.power;
        if ((testData.sport==='run'||testData.sport==='swim') && typeof p==='string' && p.includes(':')) {
          const [mm,ss]=p.split(':').map(Number);
          if (!isNaN(mm)&&!isNaN(ss)) p=(mm*60+ss).toString();
        }
        return { interval:r.interval||(i+1), power:parseFloat(String(p).replace(',','.'))||0, heartRate:parseFloat(String(r.heartRate).replace(',','.'))||0, lactate:parseFloat(String(r.lactate).replace(',','.'))||0, glucose:parseFloat(String(r.glucose).replace(',','.'))||0, RPE:parseFloat(String(r.RPE).replace(',','.'))||0 };
      }).filter(Boolean)
    };
  };

  const handleTestDataChange = (newData) => {
    if (newData.field && newData.value !== undefined) { setTestData(p=>({...p,[newData.field]:newData.value})); return; }
    setTestData({ ...newData, weight:typeof newData.weight==='string'?newData.weight:String(newData.weight||''), baseLa:typeof newData.baseLa==='string'?newData.baseLa:String(newData.baseLa||''), baseLactate:typeof newData.baseLa==='string'?newData.baseLa:String(newData.baseLa||''), results:(newData.results||[]).map(r=>({...r,power:String(r.power??''),heartRate:String(r.heartRate??''),lactate:String(r.lactate??''),glucose:String(r.glucose??''),RPE:String(r.RPE??'')})) });
  };

  // ── Google registration ──────────────────────────────────────────────────────
  const handleGoogleSuccess = async (response) => {
    setIsSendingEmail(true); setEmailError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/user/google-auth`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({credential:response.credential}) });
      const data = await res.json();
      if (data.token) {
        trackUserRegistration('google','athlete');
        trackConversionFunnel('signup_complete',{method:'google',role:'athlete',source:'calculator'});
        await logUserRegistration('google', data.user?._id);
        const { token, user } = data;
        const userId = user?._id || user?.id || null;
        localStorage.setItem('token', token);
        saveUserToStorage(user);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        if (hasValidData && userId) {
          try {
            const td = prepareCalculatorData();
            const testToSave = { athleteId:String(userId), sport:td.sport||'bike', title:td.title||`Lactate Test - ${td.sport} - ${new Date().toLocaleDateString()}`, date:td.date?.includes('T')?td.date:new Date(td.date||Date.now()).toISOString(), description:td.description||'', baseLactate:Number(td.baseLactate)||0, weight:parseFloat(String(td.weight).replace(',','.'))||0, specifics:td.specifics||{}, comments:td.comments||'', unitSystem:'metric', inputMode:'pace', results:td.results.map((r,i)=>({...r,interval:r.interval||(i+1)})) };
            const saved = await api.post('/test', testToSave, { headers:{'Authorization':`Bearer ${token}`} });
            if (saved?.data?._id) { addNotification('Lactate test saved to your account!','success'); try { await logTestCreated(testToSave.sport,(testToSave.results||[]).length,userId); } catch{} }
          } catch(e) { console.warn('Test save failed:',e); }
        }
        addNotification('Welcome to LaChart!','success');
        setShowRegister(false);
        localStorage.setItem('lastRoute', '/testing');
        await login(null,null,token,user);
      } else { setEmailError('Google authentication failed. Please try again.'); }
    } catch(err) { console.error(err); setEmailError('Failed to authenticate with Google. Please try again.'); }
    finally { setIsSendingEmail(false); }
  };

  // ── Email registration ───────────────────────────────────────────────────────
  const handleEmailSubmit = async (e) => {
    e.preventDefault(); setEmailError(null);
    if (!emailFormData.email||!emailFormData.name||!emailFormData.surname||!emailFormData.password) { setEmailError('Please fill in all required fields'); return; }
    if (emailFormData.password !== emailFormData.confirmPassword) { setEmailError("Passwords don't match"); return; }
    if (emailFormData.password.length < 8) { setEmailError('Password must be at least 8 characters'); return; }
    if (!emailFormData.termsAccepted) { setEmailError('You must agree to the Terms & Conditions'); return; }
    setIsSendingEmail(true);
    try {
      const regRes = await register({ email:emailFormData.email, password:emailFormData.password, confirmPassword:emailFormData.confirmPassword, name:emailFormData.name, surname:emailFormData.surname, role:emailFormData.role });
      trackUserRegistration('email',emailFormData.role);
      trackConversionFunnel('signup_complete',{method:'email',role:emailFormData.role,source:'calculator'});
      const token = regRes?.data?.token;
      const user  = regRes?.data?.user;
      const userId = user?._id || user?.id || null;
      if (token && user) { localStorage.setItem('token',token); saveUserToStorage(user); api.defaults.headers.common['Authorization']=`Bearer ${token}`; }
      if (hasValidData && userId && token) {
        try {
          const td = prepareCalculatorData();
          const testToSave = { athleteId:String(userId), sport:td.sport||'bike', title:td.title||`Lactate Test - ${td.sport} - ${new Date().toLocaleDateString()}`, date:td.date?.includes('T')?td.date:new Date(td.date||Date.now()).toISOString(), description:td.description||'', baseLactate:Number(td.baseLactate)||0, weight:parseFloat(String(td.weight).replace(',','.'))||0, specifics:td.specifics||{}, comments:td.comments||'', unitSystem:'metric', inputMode:'pace', results:td.results.map((r,i)=>({...r,interval:r.interval||(i+1)})) };
          const saved = await api.post('/test', testToSave, { headers:{'Authorization':`Bearer ${token}`} });
          if (saved?.data?._id) { addNotification('Lactate test saved!','success'); try { await logTestCreated(testToSave.sport,(testToSave.results||[]).length,userId); } catch{} }
        } catch(e) { console.warn('Test save failed:',e); }
      }
      addNotification('Welcome to LaChart!','success');
      setShowRegister(false);
      localStorage.setItem('lastRoute', '/testing');
      if (token && user) await login(emailFormData.email, emailFormData.password, token, user);
    } catch(err) {
      if (err.response?.data?.error?.includes('already exist')) setEmailError('An account with this email already exists. Please sign in instead.');
      else setEmailError(err.response?.data?.error || err.message || 'Registration failed. Please try again.');
    } finally { setIsSendingEmail(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-x-hidden w-full relative">
      <Helmet>
        <title>{activeTabMeta.title}</title>
        <link rel="canonical" href={activeTabMeta.canonical} />
        <meta name="description" content={activeTabMeta.desc} />
        <meta property="og:title" content={activeTabMeta.title} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={activeTabMeta.canonical} />
      </Helmet>

      {/* Menu */}
      <div className="menu-container hidden lg:block fixed top-0 left-0 h-screen overflow-y-auto z-40" ref={menuRef}>
        <Menu isMenuOpen={true} setIsMenuOpen={()=>{}} user={emptyUser} token="" />
      </div>
      <div className="menu-container lg:hidden fixed top-0 left-0 h-screen overflow-y-auto z-40">
        <Menu isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} user={emptyUser} token="" />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen w-full overflow-x-hidden lg:ml-64">
        <Header isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} user={emptyUser} />

        <main className="flex-1 px-4 py-6 pt-20 lg:pt-8 max-w-[1400px] mx-auto w-full">

          {/* ── Hero ── */}
          <section className="relative rounded-3xl overflow-hidden mb-8 bg-gradient-to-br from-gray-900 via-primary/90 to-violet-800 text-white">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=60 height=60 viewBox=0 0 60 60 xmlns=http://www.w3.org/2000/svg%3E%3Cg fill=none fill-rule=evenodd%3E%3Cg fill=%23ffffff fill-opacity=0.04%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />
            <div className="relative px-6 sm:px-10 py-10 lg:py-14 flex flex-col lg:flex-row items-start lg:items-center gap-8">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-xs font-semibold mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>Free tools · No login required
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-3 leading-tight">
                  {(SEO_H1[activeTab] || SEO_H1.lactate).h1}
                </h1>
                <p className="text-white/80 text-sm sm:text-base max-w-xl mb-6">
                  {(SEO_H1[activeTab] || SEO_H1.lactate).sub}
                </p>
                <div className="flex flex-wrap gap-3">
                  {isAuthenticated ? (
                    <button onClick={()=>navigate('/dashboard')} className="px-5 py-2.5 rounded-xl bg-white text-primary text-sm font-bold hover:bg-white/90 transition shadow">
                      Go to dashboard →
                    </button>
                  ) : (
                    <>
                      <button onClick={()=>navigate('/signup')} className="px-5 py-2.5 rounded-xl bg-white text-primary text-sm font-bold hover:bg-white/90 transition shadow">
                        Create free account →
                      </button>
                      <button onClick={()=>navigate('/login')} className="px-5 py-2.5 rounded-xl bg-white/15 text-white text-sm font-semibold hover:bg-white/25 transition border border-white/20">
                        Sign in
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 w-full lg:w-auto">
                {[{n:'8',l:'Calculators'},{n:'LT1/LT2',l:'Lactate Analysis'},{n:'7-zone',l:'Power Zones'},{n:'Free',l:'Forever'}].map(s=>(
                  <div key={s.l} className="bg-white/10 rounded-2xl px-4 py-3 text-center backdrop-blur-sm border border-white/10">
                    <div className="text-xl font-extrabold">{s.n}</div>
                    <div className="text-xs text-white/70">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Tab navigation ── */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
            {TABS.map(t=>(
              <button
                key={t.id}
                onClick={()=>navigate(t.path)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${activeTab===t.id?'bg-primary text-white shadow-md shadow-primary/30':'bg-white text-gray-600 border border-gray-200 hover:border-primary/40 hover:text-primary'}`}
              >
                <t.Icon className="w-4 h-4 flex-shrink-0" />{t.label}
              </button>
            ))}
          </div>

          {/* ── Calculator area ── */}
          <div>

            {/* Calculator content */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">

              {/* Lactate Test */}
              {activeTab==='lactate' && (
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Lactate Threshold Test</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Enter your step test data — we'll calculate LT1, LT2 and training zones</p>
                    </div>
                    <div className="relative">
                      <button onClick={()=>setIsDemoDropdownOpen(o=>!o)} className="px-3 py-2 text-xs font-semibold text-primary bg-primary/10 rounded-xl hover:bg-primary/20 transition">
                        Try demo data ▾
                      </button>
                      <AnimatePresence>
                        {isDemoDropdownOpen && (
                          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1">
                            {['bike','run','swim'].map(s=>(
                              <button key={s} onClick={()=>{handleTestDataChange(mockData[s]);setIsDemoDropdownOpen(false);addNotification(`${s} demo data loaded`,'success');}} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 capitalize">
                                {s.charAt(0).toUpperCase()+s.slice(1)}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <TestingForm
                    testData={testData}
                    onTestDataChange={handleTestDataChange}
                    onSave={()=>{}}
                    isDemo={true}
                    hideGlucoseColumn={false}
                    onGlucoseColumnChange={()=>{}}
                  />

                  {hasValidData && (
                    <div className="mt-6 space-y-6">
                      {/* Lactate curve — blurred with lock overlay */}
                      <div className="relative rounded-2xl overflow-hidden">
                        <div className="blur-sm pointer-events-none select-none opacity-50">
                          <LactateCurve testData={prepareCalculatorData()} isDemo={true} />
                        </div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-md rounded-2xl p-6 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                            <BeakerIcon className="w-7 h-7 text-primary" />
                          </div>
                          <p className="text-lg font-bold text-gray-900 mb-1">Your lactate curve is ready</p>
                          <p className="text-xs text-gray-500 mb-4 max-w-xs">Create a free account to see LT1, LT2, OBLA thresholds and full training zones</p>
                          <button onClick={()=>setShowRegister(true)} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white text-sm font-semibold shadow hover:opacity-90 transition">
                            Unlock results for free →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!hasValidData && (
                    <div className="mt-6 bg-gradient-to-br from-primary/5 to-violet-50 rounded-2xl p-6 text-center border border-primary/10">
                      <p className="text-sm text-gray-600">Fill in your lactate test data above, then your curve and thresholds will appear here.</p>
                      <p className="text-xs text-gray-400 mt-1">Try the demo data button to see an example →</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab==='ftp'    && <div><h2 className="text-lg font-bold text-gray-900 mb-1">FTP &amp; Power Zones</h2><p className="text-xs text-gray-500 mb-5">Coggan 7-zone model from your 20-minute best power</p><FTPCalc onUnlock={()=>setShowRegister(true)}/></div>}
              {activeTab==='vo2max' && <div><h2 className="text-lg font-bold text-gray-900 mb-1">VO2max Estimator</h2><p className="text-xs text-gray-500 mb-5">Estimate maximal oxygen uptake from a 5-min all-out cycling effort</p><VO2maxCalc onUnlock={()=>setShowRegister(true)}/></div>}
              {activeTab==='race'   && <div><h2 className="text-lg font-bold text-gray-900 mb-1">Race Time Predictor</h2><p className="text-xs text-gray-500 mb-5">Predict race times across all distances using the Riegel model</p><RaceCalc onUnlock={()=>setShowRegister(true)}/></div>}
              {activeTab==='tss'    && <div><h2 className="text-lg font-bold text-gray-900 mb-1">Training Load (TSS)</h2><p className="text-xs text-gray-500 mb-5">Calculate Training Stress Score and Intensity Factor for any session</p><TSSCalc onUnlock={()=>setShowRegister(true)}/></div>}
              {activeTab==='zones'  && <div><h2 className="text-lg font-bold text-gray-900 mb-1">Training Zones</h2><p className="text-xs text-gray-500 mb-5">Generate power, heart rate and run pace zones from threshold values</p><ZonesCalc onUnlock={()=>setShowRegister(true)}/></div>}
              {activeTab==='env'    && <div><h2 className="text-lg font-bold text-gray-900 mb-1">Environment Adjustments</h2><p className="text-xs text-gray-500 mb-5">Adjust race pacing targets for heat, humidity and altitude</p><EnvCalc onUnlock={()=>setShowRegister(true)}/></div>}
              {activeTab==='weight' && <div><h2 className="text-lg font-bold text-gray-900 mb-1">Weight &amp; Performance</h2><p className="text-xs text-gray-500 mb-5">How does body weight change affect your W/kg, flat speed and climbing?</p><WeightCalc onUnlock={()=>setShowRegister(true)}/></div>}
            </div>
          </div>

          {/* ── Feature strip ── */}
          <section className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {Icon:BeakerIcon,  title:'Lactate Analysis',  desc:'LT1, LT2, OBLA from blood lactate step tests'},
              {Icon:ChartBarIcon,title:'Progress Tracking',  desc:'Track fitness trends across weeks and months'},
              {Icon:AdjustmentsHorizontalIcon,title:'Training Zones',desc:'7-zone power, HR and pace zones for every sport'},
              {Icon:HeartIcon,   title:'Coach Tools',        desc:'Manage multiple athletes and share test reports'},
            ].map(f=>(
              <div key={f.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <f.Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="text-sm font-semibold text-gray-900 mb-1">{f.title}</div>
                <div className="text-xs text-gray-500">{f.desc}</div>
              </div>
            ))}
          </section>

          {/* ── Bottom CTA ── */}
          <section className="mt-8 bg-gradient-to-r from-gray-900 to-primary rounded-3xl p-8 sm:p-10 text-white text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">Ready to track your full training load?</h2>
            <p className="text-white/70 text-sm mb-6 max-w-lg mx-auto">LaChart combines lactate testing, training analytics, Strava sync and coach collaboration in one platform.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={()=>navigate(isAuthenticated ? '/dashboard' : '/signup')} className="px-6 py-3 rounded-xl bg-white text-primary text-sm font-bold hover:bg-white/90 transition shadow">
                {isAuthenticated ? 'Go to dashboard' : 'Create free account'}
              </button>
              {!isCapacitorNative() && (
                <button onClick={()=>navigate('/about')} className="px-6 py-3 rounded-xl bg-white/15 text-white text-sm font-semibold hover:bg-white/25 transition border border-white/20">
                  Learn more →
                </button>
              )}
            </div>
          </section>

        </main>

        <Footer />
      </div>

      {/* ── Registration modal ── */}
      <AnimatePresence>
        {showRegister && (
          <RegisterModal
            onClose={()=>setShowRegister(false)}
            onGoogleSuccess={handleGoogleSuccess}
            onGoogleError={()=>setEmailError('Google auth failed')}
            onEmailSubmit={handleEmailSubmit}
            emailFormData={emailFormData}
            setEmailFormData={setEmailFormData}
            emailError={emailError}
            isSending={isSendingEmail}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default TestingWithoutLogin;
