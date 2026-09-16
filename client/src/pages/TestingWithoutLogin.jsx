import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import TestingForm from '../components/Testing-page/TestingForm';
import LactateCurve from '../components/Testing-page/LactateCurve';
import LactateCurveCalculator from '../components/Testing-page/LactateCurveCalculator';
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
  HeartIcon,
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import TestSection from '../components/Testing-page/TestSection';
import { PUBLIC_TOOLS } from '../constants/publicTools';
import { CALCULATOR_GUIDES } from '../content/calculatorGuides';

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
                <UserIcon className="h-6 w-6" />
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
                <UsersIcon className="h-6 w-6" />
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
// One list for the tabs here and the sidebar — see constants/publicTools.
const TABS = PUBLIC_TOOLS;

// What each calculator card says about itself.
const CALC_HEAD = {
  lactate: { title: 'Lactate threshold test', sub: 'Enter your step test — LT1, LT2 and your zones are read from the curve.' },
  ftp:     { title: 'FTP & power zones',      sub: 'Coggan 7-zone model from your best 20-minute power.' },
  vo2max:  { title: 'VO2max estimate',        sub: 'Maximal oxygen uptake from a 5-minute all-out cycling effort.' },
  race:    { title: 'Race time predictor',    sub: 'Finish times across distances from one result, by the Riegel model.' },
  tss:     { title: 'Training load (TSS)',    sub: 'Training Stress Score and Intensity Factor for any session.' },
  zones:   { title: 'Training zones',         sub: 'Power, heart rate and run pace zones from your threshold values.' },
  env:     { title: 'Heat & altitude',        sub: 'Race pacing targets adjusted for heat, humidity and altitude.' },
  weight:  { title: 'Weight & performance',   sub: 'What a change in body weight does to W/kg, flat speed and climbing.' },
  zone2:   { title: 'Zone 2 from your lactate test', sub: 'Enter your step test — LT1 is the ceiling of Zone 2, and the curve shows where it sits.' },
};

const PATH_TO_TAB = Object.fromEntries(TABS.map(t => [t.path, t.id]));

// Some URLs share a UI tab but need their own SEO target (e.g. /zone2-calculator
// is a separate search-keyword landing page that visually re-uses the lactate
// calculator — Zone 2 is derived from the lactate curve — but must own its own
// canonical, title and description so Google indexes it as a distinct page).
// If you want UI ≠ SEO, add an entry here; otherwise PATH_TO_TAB drives both.
const PATH_TO_SEO_KEY = {
  '/zone2-calculator': 'zone2',
};

const SEO_META = {
  lactate: { title:'Free Lactate Threshold Calculator — LT1, LT2 & Training Zones | LaChart', desc:'Calculate your lactate threshold (LT1 & LT2) from step test data. Get training zones, OBLA and PDF reports. Free, no login required.', canonical:'https://lachart.net/lactate-curve-calculator' },
  zone2:   { title:'Free Zone 2 Calculator — Find Your Aerobic Base Heart Rate & Power | LaChart', desc:'Calculate your Zone 2 training range from lactate test data, FTP or LTHR. Build your aerobic base with the right intensity. Free, no sign-up.', canonical:'https://lachart.net/zone2-calculator' },
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
  zone2:   { h1: 'Zone 2 Calculator',                          sub: 'Find the top of your aerobic base from a lactate test — power, pace and heart rate' },
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
  // SEO key can diverge from the UI tab — see PATH_TO_SEO_KEY comment.
  const seoKey = PATH_TO_SEO_KEY[location.pathname] || activeTab;
  const activeTabMeta = SEO_META[seoKey] || SEO_META.lactate;
  const guide = CALCULATOR_GUIDES[seoKey] || CALCULATOR_GUIDES[activeTab] || null;
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
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden w-full relative">
      <Helmet>
        <title>{activeTabMeta.title}</title>
        <link rel="canonical" href={activeTabMeta.canonical} />
        <meta name="description" content={activeTabMeta.desc} />
        <meta property="og:title" content={activeTabMeta.title} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={activeTabMeta.canonical} />
        {guide && (
          <script type="application/ld+json">{JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: guide.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
          })}</script>
        )}
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

          {/* ── Hero ── one card, one message: what this tool is, and that
              it is free. The four stat tiles it used to carry ("8
              Calculators", "Free Forever") said nothing the pill does not. */}
          <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-primary to-violet-700 text-white">
            <div className="relative flex flex-col gap-5 px-6 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-9">
              <div className="min-w-0 max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Free tools · no account needed
                </div>
                <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl lg:text-4xl">
                  {(SEO_H1[seoKey] || SEO_H1[activeTab] || SEO_H1.lactate).h1}
                </h1>
                <p className="mt-2 text-sm text-white/80 sm:text-[15px]">
                  {(SEO_H1[seoKey] || SEO_H1[activeTab] || SEO_H1.lactate).sub}
                </p>
              </div>
              {/* One door here; the header and the sidebar already hold both. */}
              <div className="shrink-0">
                {isAuthenticated ? (
                  <button onClick={()=>navigate('/dashboard')} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-primary shadow transition hover:bg-white/90">
                    Go to dashboard →
                  </button>
                ) : (
                  <button onClick={()=>navigate('/signup')} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-primary shadow transition hover:bg-white/90">
                    Create free account →
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── Tool switcher ── */}
          <nav aria-label="Calculators" className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {TABS.map(t=>(
              <button
                key={t.id}
                onClick={()=>navigate(t.path)}
                aria-current={activeTab===t.id ? 'page' : undefined}
                className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  activeTab===t.id ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200/70 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <t.Icon className="h-4 w-4 flex-shrink-0" />{t.label}
              </button>
            ))}
          </nav>

          {/* ── The calculator ── same card as every block of the testing
              page, so someone who signs up lands somewhere that looks like
              where they came from. */}
          {(() => {
            const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
            const head = CALC_HEAD[seoKey] || CALC_HEAD[tab.id] || CALC_HEAD.lactate;
            const calc = {
              ftp:    <FTPCalc onUnlock={()=>setShowRegister(true)}/>,
              vo2max: <VO2maxCalc onUnlock={()=>setShowRegister(true)}/>,
              race:   <RaceCalc onUnlock={()=>setShowRegister(true)}/>,
              tss:    <TSSCalc onUnlock={()=>setShowRegister(true)}/>,
              zones:  <ZonesCalc onUnlock={()=>setShowRegister(true)}/>,
              env:    <EnvCalc onUnlock={()=>setShowRegister(true)}/>,
              weight: <WeightCalc onUnlock={()=>setShowRegister(true)}/>,
            }[tab.id];

            if (tab.id !== 'lactate') {
              return (
                <TestSection id={`calc-${tab.id}`} icon={tab.Icon} tint="primary" title={head.title} subtitle={head.sub}>
                  {calc}
                </TestSection>
              );
            }

            const demoMenu = (
              <div className="relative">
                <button onClick={()=>setIsDemoDropdownOpen(o=>!o)} className="rounded-lg bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/20">
                  Try demo data ▾
                </button>
                <AnimatePresence>
                  {isDemoDropdownOpen && (
                    <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} className="absolute right-0 z-50 mt-2 w-40 rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
                      {['bike','run','swim'].map(s=>(
                        <button key={s} onClick={()=>{handleTestDataChange(mockData[s]);setIsDemoDropdownOpen(false);addNotification(`${s} demo data loaded`,'success');}} className="w-full px-4 py-2 text-left text-sm capitalize text-slate-700 hover:bg-slate-50">
                          {s.charAt(0).toUpperCase()+s.slice(1)}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );

            return (
              <div className="space-y-5">
                <TestSection id="calc-lactate" icon={tab.Icon} tint="primary" title={head.title} subtitle={head.sub} actions={demoMenu} flush bodyClassName="p-1 sm:p-2 md:p-4">
                  <TestingForm
                    testData={testData}
                    onTestDataChange={handleTestDataChange}
                    onSave={()=>{}}
                    isDemo={true}
                    hideGlucoseColumn={false}
                    onGlucoseColumnChange={()=>{}}
                  />
                </TestSection>

                {hasValidData ? (
                  <>
                    {/* Free: the measured curve, then the fitted one with LT1
                        and LT2 on it — the proof the tool works. The other
                        methods and the zones are what the account opens. */}
                    <LactateCurve mockData={prepareCalculatorData()} demoMode />
                    <LactateCurveCalculator
                      mockData={prepareCalculatorData()}
                      demoMode
                      onUnlock={() => { trackEvent('calc_unlock_click', { calc: 'lactate', source: 'thresholds' }); setShowRegister(true); }}
                    />

                    {/* Gated: everything else behind a free account */}
                    <div className="rounded-2xl bg-gradient-to-r from-primary to-violet-500 p-6 text-center text-white">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                        <AdjustmentsHorizontalIcon className="h-6 w-6 text-white" />
                      </div>
                      <p className="mb-1 text-lg font-bold">Unlock your training zones</p>
                      <p className="mx-auto mb-4 max-w-md text-sm text-white/85">Create a free account for your complete <strong>power / heart-rate / pace training zones</strong>, <strong>OBLA, IAT &amp; D-max</strong> side by side with LT1 and LT2, and this test saved to track your progress over time.</p>
                      <button
                        onClick={() => { trackEvent('calc_unlock_click', { calc: 'lactate' }); setShowRegister(true); }}
                        className="rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-primary shadow transition hover:bg-white/90"
                      >
                        Unlock full results for free →
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-slate-200/70 shadow-sm">
                    <p className="text-sm text-slate-600">Fill in your lactate test above — the curve and thresholds appear here.</p>
                    <p className="mt-1 text-xs text-slate-400">Or load the demo data to see an example.</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── What this tool is, in words — one page about one thing,
              so the nine calculator URLs stop reading as one page. ── */}
          {guide && (
            <section className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 shadow-sm sm:p-7">
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{guide.heading}</h2>
              <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-slate-600">
                {guide.paras.map((t) => <p key={t.slice(0, 40)}>{t}</p>)}
              </div>
              <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Questions</h3>
              <dl className="mt-2 divide-y divide-slate-100">
                {guide.faq.map(([q, a]) => (
                  <div key={q} className="py-3">
                    <dt className="text-[14px] font-bold text-slate-900">{q}</dt>
                    <dd className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* ── What the account adds ── */}
          <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {Icon:BeakerIcon,  title:'Lactate analysis',  desc:'LT1, LT2, OBLA from blood lactate step tests'},
              {Icon:ChartBarIcon,title:'Progress tracking',  desc:'Fitness trends across weeks and months'},
              {Icon:AdjustmentsHorizontalIcon,title:'Training zones',desc:'Power, HR and pace zones for every sport'},
              {Icon:HeartIcon,   title:'Coach tools',        desc:'Several athletes, shared test reports'},
            ].map(f=>(
              <div key={f.title} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 shadow-sm">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                  <f.Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="text-sm font-bold text-slate-900">{f.title}</div>
                <div className="mt-0.5 text-xs text-slate-500">{f.desc}</div>
              </div>
            ))}
          </section>

          {/* ── Bottom CTA ── */}
          <section className="mb-8 mt-6 rounded-2xl bg-gradient-to-r from-slate-900 to-primary p-7 text-center text-white sm:p-9">
            <h2 className="mb-2 text-xl font-extrabold sm:text-2xl">Ready to track your full training load?</h2>
            <p className="mx-auto mb-5 max-w-lg text-sm text-white/70">LaChart combines lactate testing, training analytics, Strava and Garmin sync and coach collaboration in one place.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={()=>navigate(isAuthenticated ? '/dashboard' : '/signup')} className="rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-primary shadow transition hover:bg-white/90">
                {isAuthenticated ? 'Go to dashboard' : 'Create free account'}
              </button>
              {!isCapacitorNative() && (
                <button onClick={()=>navigate('/about')} className="rounded-xl border border-white/25 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">
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
