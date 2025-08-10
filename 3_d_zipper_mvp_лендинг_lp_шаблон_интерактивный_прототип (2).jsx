import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, MessageCircle, ChevronRight, Ruler, Layers, Zap, Calculator, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

/**
 * 3D ZIPPER — компактная рабочая версия (v1-core, fixed)
 * Исправлено: 'return' outside of function — удалён дублирующийся фрагмент после getContacts().
 * Исправлено: тестовые строки только с экранированными переводами (\n, \r\n) — без «живых» переносов.
 * Добавлены доп. тесты (getContacts phone/links, calc resin mode).
 */

const brand = { primary: '#2BAA66', accent: '#48D3A6', dark: '#0F6B46' };

function Container({ children, className = '' }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

function Logo({ size = 28 }) {
  const src = typeof window !== 'undefined' ? (window.__ZIPPER_LOGO || null) : null;
  return (
    <div className="flex items-center gap-2">
      {src ? (
        <img src={src} width={size} height={size} alt="3D ZIPPER" className="rounded-md shadow-sm" />
      ) : (
        <svg width={size} height={size} viewBox="0 0 64 64" className="drop-shadow-sm">
          <defs>
            <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor={brand.accent} />
              <stop offset="100%" stopColor={brand.primary} />
            </linearGradient>
          </defs>
          <path d="M8 16L32 4l24 12v24L32 52 8 40z" fill="url(#g)" />
          <path d="M20 22h24v6H20zM20 32h24v6H20z" fill="#0C5C3C" opacity=".3" />
        </svg>
      )}
      <span className="font-extrabold tracking-tight text-xl" style={{ color: brand.primary }}>3D ZIPPER</span>
    </div>
  );
}

// ===== Данные (Google Sheets) =====
const DataContext = React.createContext({ materials: [] });
function useData(){ return React.useContext(DataContext); }

function parseCSV(text){
  let i=0, rows=[], row=[], cell='', q=false; const n=text.length;
  while(i<n){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else { q=false; } } else cell+=c; }
    else { if(c==='"') q=true; else if(c===','){ row.push(cell.trim()); cell=''; } else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(cell.trim()); rows.push(row); row=[]; cell=''; } else cell+=c; }
    i++;
  }
  if(cell.length>0 || row.length>0){ row.push(cell.trim()); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter(r=>r.some(x=>x&&x.length)).map(r=>{ const o={}; header.forEach((h,idx)=>o[(h||'').trim()]=r[idx]??''); return o; });
}
async function fetchCSV(url){ if(!url) return []; const res=await fetch(url); const t=await res.text(); return parseCSV(t); }
function guessMultiplier(name=''){
  const s=String(name).toUpperCase(); if(s.includes('PA')&&s.includes('CF'))return 2.1; if(s.includes('TPU'))return 1.6; if(s.includes('ASA'))return 1.2; if(s.includes('ABS'))return 1.15; if(s.includes('RESIN'))return 1.8; return 1.0;
}
function normalizeMaterials(rows){
  const pick=(r,keys)=>{ for(const k of keys){ if(r[k]&&String(r[k]).trim()) return String(r[k]).trim(); } return ''; };
  const out = rows.map(r=>{
    const brand=pick(r,['Бренд','Brand']); const series=pick(r,['Серия','Grade','Марка','Модификация']); const mat=pick(r,['Название материала','Материал','Материал/смола','Наименование','Name']);
    const name=[brand,series,mat].filter(Boolean).join(' ').trim() || mat || series || brand || 'Материал';
    const tech=pick(r,['Технология','tech','Tech']); const tag=pick(r,['Назначение','Свойства','tag','Notes']);
    const multRaw=pick(r,['Коэф','Multiplier','price_multiplier','Коэффициент','Кф']); const multiplier=parseFloat(String(multRaw).replace(',','.'))||guessMultiplier([name,tech,tag].join(' '));
    return { name, tech, tag, multiplier };
  });
  const map=new Map(); out.forEach(m=>{ if(!map.has(m.name)) map.set(m.name,m); });
  return Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
function fallbackMaterials(){
  return [
    { name:'PETG', tech:'FFF', tag:'визуал/декор', multiplier:1.0 },
    { name:'ASA', tech:'FFF', tag:'удар и улица', multiplier:1.2 },
    { name:'PA+CF', tech:'FFF', tag:'прочность/жёсткость', multiplier:2.1 },
    { name:'TPU 95A', tech:'FFF', tag:'эластомер', multiplier:1.6 },
    { name:'Resin Tough', tech:'SLA', tag:'смола', multiplier:1.8 },
  ];
}
function DataProvider({children}){
  const [materials,setMaterials]=useState([]);
  useEffect(()=>{ (async()=>{
    const S=typeof window!=='undefined' ? (window.__ZIPPER_SHEETS||{}) : {};
    const url=S.materials||'https://docs.google.com/spreadsheets/d/1v79ZawzWLyeDgQF6Y1VZsNIM1pP1OXvUi4pvLT5ATRI/export?format=csv&gid=624696833';
    try{ const rows=await fetchCSV(url); const list=normalizeMaterials(rows); setMaterials(list.length?list:fallbackMaterials()); }catch(e){ console.warn('CSV materials error',e); setMaterials(fallbackMaterials()); }
  })(); },[]);
  return <DataContext.Provider value={{ materials }}>{children}</DataContext.Provider>;
}

// ===== Ассеты =====
function AssetImg({ asset, className='', alt='' }){
  const src = typeof window!=='undefined' && window.__ZIPPER_ASSETS ? window.__ZIPPER_ASSETS[asset] : null;
  if (src) return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />;
  return <div className={`h-full w-full rounded-xl bg-[radial-gradient(circle_at_30%_30%,#D1FAE5,transparent_60%),radial-gradient(circle_at_70%_70%,#BBF7D0,transparent_60%)] ${className}`} />;
}

// ===== Утилиты =====
const allowed = '.stl,.step,.stp,.iges,.igs,.3mf,.obj,.pdf';
function bytesToNice(n){ if(n<1024) return `${n} B`; if(n<1048576) return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`; }
function toMsk(d){ const local=d instanceof Date?d:new Date(d); const tz=local.getTimezoneOffset(); const diff=(-180 - tz)*60000; return new Date(local.getTime()+diff); }
function getUTM(){ if(typeof window==='undefined') return {}; const p=new URLSearchParams(window.location.search); const keys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term']; const out={}; keys.forEach(k=>{const v=p.get(k); if(v) out[k]=v;}); out.referrer=document.referrer||''; return out; }
function genLeadId(){ const d=toMsk(new Date()); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const seq=Math.floor(Math.random()*9000+1000); return `AZ-${y}${m}-${seq}`; }
function getContacts(){
  if (typeof window==='undefined') return { whatsapp:'#', telegram:'#' };
  const c = window.__ZIPPER_CONTACTS || {};
  const phone = '79260048138';
  const defWa = 'https://wa.me/' + phone + '?text=' + encodeURIComponent('Здравствуйте, хочу рассчитать печать');
  const defTg = 'https://t.me/+' + phone; // web-линк на номер; при наличии username лучше заменить на t.me/username
  return { whatsapp: c.whatsapp || defWa, telegram: c.telegram || defTg };
}
async function submitLead(payload){ const ep=(typeof window!=='undefined'&&window.__ZIPPER_AMO_ENDPOINT)||'/api/amo/lead'; try{ await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch(e){console.warn('amo submit error',e);} }

// ===== Телефон и валидация =====
function digitsOnly(s){ let d=''; for (const ch of String(s||'')) if (ch>='0' && ch<='9') d+=ch; return d; }
function isValidName(n){ const t=String(n||'').trim(); if (t.length<2) return false; for (const ch of t){ const c=ch.charCodeAt(0); const latin=(c>=65&&c<=90)||(c>=97&&c<=122); const cyr=(c>=1040&&c<=1103)||c===1025||c===1105; if(!(latin||cyr||ch==='-'||ch===' ')) return false; } return true; }
function isValidPhone(p){ const d=digitsOnly(p); return d.length===11 && d.startsWith('7'); }
function formatPhone(raw){ let src=''; for(const ch of String(raw||'')){ if((ch>='0'&&ch<='9')||ch==='+') src+=ch; } if(!src.startsWith('+')) src='+'+src.split('+').join(''); if(src[1]==='7'){ let digits=''; for(const ch of src){ if(ch>='0'&&ch<='9') digits+=ch; } const r=digits.slice(1); let out='+7'; if(r.length>0) out+=' ('+r.slice(0,3); if(r.length>=3) out+=')'; if(r.length>3) out+=' '+r.slice(3,6); if(r.length>6) out+='-'+r.slice(6,8); if(r.length>8) out+='-'+r.slice(8,10); return out; } return src; }
function detectFlag(phone){ return String(phone||'').startsWith('+7') ? '🇷🇺' : '📞'; }

// ===== Компоненты =====
function UploadDropzone({ onDone }){
  const [drag,setDrag]=useState(false); const [files,setFiles]=useState([]); const [sending,setSending]=useState(false); const [progress,setProgress]=useState(0);
  const inputRef=useRef(null); const [name,setName]=useState(''); const [phone,setPhone]=useState(''); const [agree,setAgree]=useState(false); const [touched,setTouched]=useState(false); const [error,setError]=useState(''); const [hp,setHp]=useState(''); const startRef=useRef(Date.now());
  const handleFiles=(fl)=>{ const seen=new Set(files.map(f=>f.name+f.size)); const add=[]; Array.from(fl).forEach(f=>{ if(!seen.has(f.name+f.size)) add.push(f); }); if(add.length) setFiles(prev=>[...prev,...add]); };
  const simulateSend=async()=>{ 
    const nameValid = isValidName(name);
    const phoneValid = isValidPhone(phone);
    const humanOk = Date.now()-startRef.current>2000;
    const hpOk = !hp;
    const hasFiles = files.length>0;
    const canSend = hasFiles && nameValid && phoneValid && agree && humanOk && hpOk && !sending;
    if(!canSend){
      setTouched(true);
      const reasons=[];
      if(!hasFiles) reasons.push('добавьте файл');
      if(!nameValid) reasons.push('введите имя (≥2 буквы)');
      if(!phoneValid) reasons.push('телефон: +7 (XXX) XXX-XX-XX');
      if(!agree) reasons.push('согласие ФЗ‑152');
      if(!humanOk || !hpOk) reasons.push('антибот‑проверка');
      setError('Не удалось отправить: '+reasons.join(', ')+'.');
      return;
    }
    setError('');
    setSending(true); setProgress(0);
    const id=setInterval(()=>setProgress(p=>Math.min(p+8,100)),80);
    await new Promise(r=>setTimeout(r,1200));
    clearInterval(id); setProgress(100);
    await new Promise(r=>setTimeout(r,200));
    setSending(false);
    onDone?.(files);
    const payload={ lead_id:genLeadId(), type:'file', consent: agree, contact:{name,phone}, files:files.map(f=>({name:f.name,size:f.size})), utm:getUTM() };
    submitLead(payload);
  };
  return (
    <div className="space-y-3">
      <div id="upload" onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files);}} className={`relative rounded-2xl border-2 border-dashed p-6 sm:p-8 transition shadow-sm ${drag?'border-emerald-500 bg-emerald-50/40':'border-gray-300 bg-white/70'}`}>
        <div className="relative z-10 flex flex-col items-center text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Upload/></div>
          <div>
            <p className="text-lg font-semibold">Перетащите STL/STEP/3MF/OBJ/PDF</p>
            <p className="text-sm text-gray-500">или <button className="underline decoration-emerald-600 decoration-2 underline-offset-4 hover:text-emerald-700" onClick={()=>inputRef.current?.click()}>выберите файлы</button></p>
            <p className="text-xs text-gray-600">Нет 3D‑модели? <a className="text-emerald-700 underline" href="#">Загрузите фото детали с линейкой</a></p>
          </div>
          <input ref={inputRef} type="file" className="hidden" accept={allowed} multiple onChange={e=>handleFiles(e.target.files)} />
          {!!files.length && (
            <div className="w-full space-y-3">
              <div className="max-h-36 overflow-auto rounded-xl border bg-white">
                {files.map((f,i)=> (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm"><span className="truncate max-w-[70%]">{f.name}</span><span className="text-gray-500">{bytesToNice(f.size)}</span></div>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <Input placeholder="Иванов Иван"
                    value={name}
                    onChange={e=>setName(e.target.value)}
                    className={touched && !isValidName(name) ? 'border-red-500' : ''} />
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-2.5 text-lg">{detectFlag(phone)}</span>
                  <Input placeholder="+79161234567"
                    value={phone}
                    onChange={e=>setPhone(formatPhone(e.target.value))}
                    onFocus={()=>{ if(!phone) setPhone('+'); }}
                    inputMode="tel"
                    className={`pl-8 ${touched && !isValidPhone(phone) ? 'border-red-500' : ''}`} />
                </div>
              </div>
              <input type="text" tabIndex="-1" autoComplete="off" value={hp} onChange={e=>setHp(e.target.value)} className="hidden" aria-hidden="true" />
              {touched && name.trim() && !isValidName(name) && (<p className="text-xs text-red-600">Введите имя (минимум 2 буквы)</p>)}
              {touched && phone.trim() && !isValidPhone(phone) && (<p className="text-xs text-red-600">Формат: +7 (XXX) XXX-XX-XX</p>)}
              <div className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} className="mt-1"/>
                <label>Согласен на обработку персональных данных (ФЗ‑152) и <a href={(typeof window!=='undefined' && window.__ZIPPER_POLICY) ? window.__ZIPPER_POLICY : '/policy'} target="_blank" rel="noopener" className="underline text-emerald-700">политикой конфиденциальности</a></label>
              </div>
              <div className="flex items-center gap-3">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={simulateSend} disabled={sending || !(isValidName(name) && isValidPhone(phone) && agree && files.length>0)}>{sending ? `Загрузка… ${progress}%` : 'Отправить на расчёт'}</Button>
                <p className="text-xs text-gray-500">до 500 МБ, безопасная передача</p>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }){
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-black/5">
      <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Icon size={18} /></div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="font-semibold">{value}</div>
      </div>
    </div>
  );
}

function ServiceCard({ title, subtitle, assetKey }){
  return (
    <Card className="rounded-2xl border-0 shadow-md ring-1 ring-black/5">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-xl"><AssetImg asset={assetKey} alt={title}/></div>
        <p className="mt-3 text-sm text-gray-600">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function PriceCalc(){
  const { materials } = useData();
  const [vol,setVol]=useState(250); const [material,setMaterial]=useState(materials[0]?.name||'PETG'); const [quality,setQuality]=useState('std');
  useEffect(()=>{ if(materials.length) setMaterial(materials[0].name); },[materials]);
  const kMat=useMemo(()=>{ const m=materials.find(x=>x.name===material); const mult=m?.multiplier; if(mult) return mult; const s=String(material); return s==='PA+CF'?2.1:s.includes('TPU')?1.6:s.includes('ASA')?1.2:s.includes('RESIN')?1.8:1.0; },[material,materials]);
  const base=35;
  const price=useMemo(()=>{
    const kQ = quality==='hd'?1.35: quality==='draft'?0.75: 1.0;
    const m = materials.find(x=>x.name===material);
    const isResin = /resin|смола|sla/i.test(`${m?.name||''} ${m?.tech||''}`);
    if (isResin) {
      const density = 1.1; // г/см³ для смолы
      const grams = vol * density;
      return Math.round(grams * 65);
    }
    return Math.round(vol*base*kMat*kQ);
  },[vol,kMat,quality,materials,material]);
  const handleSubmit=()=>{ submitLead({ lead_id:genLeadId(), type:'calc', material, quality, volume_cm3:vol, price_est:price, utm:getUTM() }); };
  return (
    <Card id="calc" className="rounded-2xl border-0 shadow-lg ring-1 ring-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Calculator className="h-5 w-5 text-emerald-600"/> Оценка за 1 минуту</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2"><Label>Объём модели: <span className="font-medium">{vol} см³</span></Label><Slider value={[vol]} min={10} max={2000} step={10} onValueChange={(v)=>setVol(v[0])} className="[--track-bg:theme(colors.gray.200)] [--range-bg:theme(colors.emerald.500)]"/></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Материал</Label>
            <Select value={material} onValueChange={setMaterial}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Выберите материал" /></SelectTrigger>
              <SelectContent>
                {materials.length ? (
                  materials.map((m, idx) => (
                    <SelectItem key={`${m.name}-${idx}`} value={m.name}>{m.name}{m.tag ? ` — ${m.tag}` : ''}</SelectItem>
                  ))
                ) : (
                  <>
                    <SelectGroup>
                      <SelectLabel>FFF/FGF</SelectLabel>
                      <SelectItem value="PETG">PETG</SelectItem>
                      <SelectItem value="ASA">ASA</SelectItem>
                      <SelectItem value="PA+CF">PA+CF</SelectItem>
                      <SelectItem value="TPU">TPU (эластомер)</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>SLA</SelectLabel>
                      <SelectItem value="Resin Tough">Resin Tough</SelectItem>
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Качество поверхности</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button variant={quality==='draft'?'default':'secondary'} className={quality==='draft'?'bg-emerald-600 text-white hover:bg-emerald-700':''} onClick={()=>setQuality('draft')}>
                <span className="block">Черновое</span>
                <span className="block text-[10px] opacity-80">(1,5–0,8 мм)</span>
              </Button>
              <Button variant={quality==='std'?'default':'secondary'} className={quality==='std'?'bg-emerald-600 text-white hover:bg-emerald-700':''} onClick={()=>setQuality('std')}>
                <span className="block">Стандарт</span>
                <span className="block text-[10px] opacity-80">(0,6–0,4 мм)</span>
              </Button>
              <Button variant={quality==='hd'?'default':'secondary'} className={quality==='hd'?'bg-emerald-600 text-white hover:bg-emerald-700':''} onClick={()=>setQuality('hd')}>
                <span className="block">HD</span>
                <span className="block text-[10px] opacity-80">(0,4–0,2 мм)</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm text-gray-500">Ориентировочная цена</div>
            <div className="text-3xl font-extrabold tracking-tight">≈ {price.toLocaleString('ru-RU')} ₽</div>
          </div>
          <Button onClick={handleSubmit} className="bg-emerald-600 text-white hover:bg-emerald-700">Отправить на точный расчёт</Button>
        </div>
        <p className="text-xs text-gray-500">* Итоговая стоимость зависит от геометрии, пост‑обработки и партии</p>
      </CardContent>
    </Card>
  );
}

// ===== Мини-тесты (без UI, в консоль) =====
function runSelfTests(){
  const t = (name, fn) => { try { fn(); console.log(`✅ ${name}`); } catch (e) { console.error(`❌ ${name}:`, e && (e.message || e)); } };
  const eq = (a,b) => { const ja = JSON.stringify(a); const jb = JSON.stringify(b); if (ja !== jb) throw new Error(`Expected ${jb}, got ${ja}`); };

  // базовые проверки
  t('Stat is defined', () => { if (typeof Stat !== 'function') throw new Error('Stat undefined'); });
  t('UploadDropzone is defined', () => { if (typeof UploadDropzone !== 'function') throw new Error('UploadDropzone undefined'); });

  // CSV: корректные escape-последовательности — используем только \n и \r\n в строках
  t('parseCSV: LF', () => { const csv = 'c1,c2\nA,B'; eq(parseCSV(csv), [{ c1:'A', c2:'B' }]); });
  t('parseCSV: CRLF', () => { const csv = 'c1,c2\r\n1,2\r\n3,4'; eq(parseCSV(csv), [{ c1:'1', c2:'2' }, { c1:'3', c2:'4' }]); });
  t('parseCSV: quoted comma', () => { const csv = 'a,b\n"x","y, z"'; eq(parseCSV(csv), [{ a:'x', b:'y, z' }]); });
  t('parseCSV: escaped quote', () => { const csv = 'h\n"ab""cd"'; eq(parseCSV(csv), [{ h:'ab"cd' }]); });
  t('parseCSV: quoted newline', () => { const csv = 'a\n"x\nq"'; eq(parseCSV(csv), [{ a:'x\nq' }]); });
  t('parseCSV: trailing newline', () => { const csv = 'a\n1\n'; eq(parseCSV(csv), [{ a:'1' }]); });
  t('parseCSV: empty row skipped', () => { const csv = 'a,b\n,\nX,Y'; eq(parseCSV(csv), [{ a:'X', b:'Y' }]); });

  // normalizeMaterials: дедуп и сборное имя
  t('normalizeMaterials: dedupe & compose name', () => {
    const rows=[{ 'Бренд':'BrandX','Серия':'S1','Материал':'PETG' }, { 'Бренд':'BrandX','Серия':'S1','Материал':'PETG' }];
    const list = normalizeMaterials(rows);
    if (list.length !== 1) throw new Error('expected 1 unique');
    if (!list[0].name.includes('BrandX') || !list[0].name.includes('PETG')) throw new Error('bad name compose');
  });

  // extra: bytesToNice formatting
  t('bytesToNice', () => { if (bytesToNice(2048) !== '2.0 KB') throw new Error('bytesToNice broken'); });

  // getContacts links
  t('getContacts: whatsapp/telegram default', () => {
    const { whatsapp, telegram } = (typeof window==='undefined') ? { whatsapp:'#', telegram:'#' } : getContacts();
    if (typeof window !== 'undefined') {
      if (!/wa\.me\/\d+/.test(whatsapp)) throw new Error('wa link');
      if (!/t\.me\/.+/.test(telegram)) throw new Error('tg link');
    }
  });
}

// ===== Error Boundary =====
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error('Render error:', error, info); }
  render(){
    if (this.state.error) {
      return (
        <div className="p-6 text-sm">
          <div className="mx-auto max-w-3xl rounded-xl border bg-white p-4 shadow">
            <h2 className="mb-2 text-lg font-bold text-red-600">Ошибка рендеринга</h2>
            <pre className="whitespace-pre-wrap break-words text-red-700">{String(this.state.error)}</pre>
            <p className="mt-2 text-gray-600">Откройте Console для деталей. Я исправлю по сообщению об ошибке.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===== Приложение =====
function App(){
  const { materials } = useData();
  const [sentFiles,setSentFiles]=useState([]);
  const contacts = getContacts();

  useEffect(()=>{ document.title='3D ZIPPER — Фабрика деталей'; if(typeof window!=='undefined'){ const ico=window.__ZIPPER_FAVICON||window.__ZIPPER_LOGO; if(ico){ let link=document.querySelector('link[rel="icon"]'); if(!link){ link=document.createElement('link'); link.rel='icon'; document.head.appendChild(link);} link.href=ico; } } },[]);
  useEffect(()=>{ runSelfTests(); },[]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 to-white text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a className="hover:text-emerald-700" href="#services">Услуги</a>
            <a className="hover:text-emerald-700" href="#materials">Материалы</a>
            <a className="hover:text-emerald-700" href="#cases">Кейсы</a>
            <a className="hover:text-emerald-700" href="#contacts">Контакты</a>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => document.getElementById('calc')?.scrollIntoView({behavior:'smooth'})}>Загрузить модель</Button>
            <Button variant="secondary" className="bg-white">Перезвоните за 30 сек</Button>
          </div>
        </Container>
      </header>

      {/* Hero */}
      <section className="relative">
        <Container className="grid gap-8 pb-10 pt-10 md:grid-cols-2 md:pb-16 md:pt-16">
          <div className="flex flex-col justify-center">
            <motion.h1 className="text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight max-w-[20ch] sm:max-w-none" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
              Фабрика деталей <span className="block text-emerald-700">3D ZIPPER</span>
            </motion.h1>
            <p className="mt-4 text-lg text-gray-700">От идеи до воплощения: печатаем панели, мебель, светильники и функциональные детали по вашим чертежам и 3D‑моделям.</p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat icon={Ruler} label="Габариты" value="печать до 2 м" />
              <Stat icon={Layers} label="Материалы" value="30+ на складе" />
              <Stat icon={Zap} label="Срок" value="расчёт за 1 день" />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => document.getElementById('calc')?.scrollIntoView({behavior:'smooth'})}>Узнать стоимость <ChevronRight className="ml-1 h-4 w-4"/></Button>
              <Button variant="secondary" className="bg-white" onClick={()=>window.open(contacts.whatsapp,'_blank')}>WhatsApp <MessageCircle className="ml-1 h-4 w-4"/></Button>
              <Button variant="secondary" className="bg-white" onClick={()=>window.open(contacts.telegram,'_blank')}>Telegram</Button>
            </div>
          </div>
          <div className="space-y-4">
            <PriceCalc />
            <UploadDropzone onDone={setSentFiles} />
            {sentFiles.length>0 && (
              <div className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200"><CheckCircle2 className="mr-1 inline h-4 w-4"/> Заявка создана. Ответим в рабочее время.</div>
            )}
          </div>
        </Container>
      </section>

      {/* Segmentation */}
      <section className="bg-white py-10 md:py-14">
        <Container>
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight">Кому помогаем</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="overflow-hidden rounded-2xl border-0 shadow-md ring-1 ring-black/5"><CardContent className="p-0"><div className="aspect-[16/9] w-full"><AssetImg asset="seg-design" alt="Строителям/дизайнерам"/></div><div className="p-5"><div className="mb-1 text-lg font-bold">Строителям/дизайнерам</div><p className="text-sm text-gray-600">Параметрические панели, зонирование, садово‑парковый декор, светильники.</p></div></CardContent></Card>
            <Card className="overflow-hidden rounded-2xl border-0 shadow-md ring-1 ring-black/5"><CardContent className="p-0"><div className="aspect-[16/9] w-full"><AssetImg asset="seg-industrial" alt="Инженерам/производствам"/></div><div className="p-5"><div className="mb-1 text-lg font-bold">Инженерам/производствам</div><p className="text-sm text-gray-600">Импеллеры, шнеки, ролики, корпуса, прокладки. Подбор материала.</p></div></CardContent></Card>
            <Card className="overflow-hidden rounded-2xl border-0 shadow-md ring-1 ring-black/5"><CardContent className="p-0"><div className="aspect-[16/9] w-full"><AssetImg asset="seg-consumer" alt="Частным клиентам"/></div><div className="p-5"><div className="mb-1 text-lg font-bold">Частным клиентам/предприятиям</div><p className="text-sm text-gray-600">Статуэтки, призы, рамки, подарки и кастомная мебель.</p></div></CardContent></Card>
          </div>
        </Container>
      </section>

      {/* Services */}
      <section id="services" className="bg-gradient-to-b from-white to-emerald-50/60 py-12">
        <Container>
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight">Услуги</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ServiceCard assetKey="service-decorative" title="Декоративные панели и решётки" subtitle="ажурные конструкции и зонирование"/>
            <ServiceCard assetKey="service-parametric" title="Параметрические панели" subtitle="печать до 2 м, подсветка"/>
            <ServiceCard assetKey="service-furniture" title="Мебель для дома" subtitle="футуристичные формы от 1 метра"/>
            <ServiceCard assetKey="service-garden" title="Садово‑парковая мебель" subtitle="лавочки, вазоны, арт‑объекты"/>
            <ServiceCard assetKey="service-light" title="Светильники" subtitle="любой формафактор и материалы"/>
            <ServiceCard assetKey="service-industrial" title="Промышленные детали" subtitle="шнеки, валы, упоры — надёжно и грамотно"/>
            <ServiceCard assetKey="service-scanning" title="3D сканирование / моделирование" subtitle="обмер, реверс‑инжиниринг, CAD"/>
            <ServiceCard assetKey="service-enclosures" title="Корпуса и кожухи" subtitle="электроника, приборы, защитные кожухи"/>
            <ServiceCard assetKey="service-auto" title="Автообвес и детали" subtitle="бамперы, губы, антикрылья, крепёж"/>
          </div>
        </Container>
      </section>

      {/* Materials teaser */}
      <section id="materials" className="py-12">
        <Container>
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight">Материалы</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(materials.length?materials.slice(0,4):[{name:'PETG',tag:'визуал/декор'},{name:'ASA',tag:'удар и улица'},{name:'PA+CF',tag:'прочность/жёсткость'},{name:'TPU 95A',tag:'эластомер'}]).map((m,idx)=> (
              <Card key={m.name+idx} className="rounded-2xl border-0 shadow-md ring-1 ring-black/5"><CardContent className="p-5"><div className="mb-3 h-24 w-full overflow-hidden rounded-xl"><AssetImg asset={`material-${idx}`} alt={m.name}/></div><div className="font-semibold">{m.name}</div><div className="text-sm text-gray-600">{m.tag||m.tech}</div></CardContent></Card>
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="bg-gradient-to-b from-white to-emerald-50/60 py-12">
        <Container className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 text-2xl font-extrabold tracking-tight">FAQ</h2>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1"><AccordionTrigger className="text-left">Какие файлы можно загрузить?</AccordionTrigger><AccordionContent>STL, STEP/IGES, 3MF, OBJ и PDF‑чертежи. Максимальный размер — до 500 МБ.</AccordionContent></AccordionItem>
              <AccordionItem value="item-2"><AccordionTrigger className="text-left">Печатаете крупногабаритные изделия?</AccordionTrigger><AccordionContent>Да, монолитом до 2 м; больше — секционно с точной стыковкой.</AccordionContent></AccordionItem>
              <AccordionItem value="item-3"><AccordionTrigger className="text-left">Покраска в цвет RAL?</AccordionTrigger><AccordionContent>Да, окраска по RAL, лакировка, химическое сглаживание и др.</AccordionContent></AccordionItem>
            </Accordion>
          </div>
          <div><PriceCalc /></div>
        </Container>
      </section>

      {/* Footer */}
      <footer id="contacts" className="border-t bg-white">
        <Container className="grid gap-8 py-10 md:grid-cols-3">
          <div className="space-y-3"><Logo /><p className="text-sm text-gray-600">Фабрика деталей: от идеи до воплощения. Печать, отделка, сборка.</p><div className="flex gap-2"><Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">FFF/FGF</Badge><Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">SLA</Badge></div></div>
          <div><h4 className="mb-3 font-semibold">Контакты</h4><ul className="space-y-2 text-sm text-gray-700"><li>Юр. лицо: ООО «САП»</li><li>ИНН/КПП: 3443152368 / 773101001</li><li>ОГРН: 1243400004264</li><li>Москва, ИЦ «Сколково»</li><li>Тел: <a href="tel:+74993509016" className="underline">+7 (499) 350-90-16</a></li><li>E-mail: AMSLLC@yandex.ru</li></ul></div>
          <div><h4 className="mb-3 font-semibold">Действие</h4><div className="space-y-2"><Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => document.getElementById('upload')?.scrollIntoView({behavior:'smooth'})}>Загрузить модель</Button><Button variant="secondary" className="w-full">Заказать звонок за 30 сек</Button></div></div>
        </Container>
        <div className="border-t py-4 text-center text-xs text-gray-500">© {new Date().getFullYear()} 3D ZIPPER. Все права защищены.</div>
      </footer>
    </div>
  );
}

export default function ZipperSite(){
  return (
    <DataProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </DataProvider>
  );
}
