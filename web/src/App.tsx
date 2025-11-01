import React, { useEffect, useMemo, useRef, useState } from "react";
const API = import.meta.env.VITE_API_BASE || "http://localhost:8787";

type UploadResp = { docId: string; placeholders: string[]; textPreview: string };
type Msg = { role: "assistant" | "user"; text: string };

const isDate = (s: string) => /^(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])-\d{4}$/.test(s.trim());
const isAmount = (s: string) => /^\$?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\$?\d+(\.\d{1,2})?$/.test(s.trim());
const looksDate = (k: string) => /date|effective/i.test(k);
const looksAmt = (k: string) => /amount|price|payment|purchase|cap/i.test(k);
const looksText = (k: string) => /(name|jurisdiction|state|title|governing|city|country|address|email)/i.test(k);
const isTextOnly = (v: string) => /^[A-Za-z][A-Za-z\s&\.,\-'\d@]*$/.test(v.trim());

const HL = 'background: rgba(255, 215, 0, .28); outline: 1px solid rgba(255,215,0,.35); color: inherit; border-radius: 3px; padding: 0 2px;';
const escapeHTML = (s:string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

const safeHighlight = (txt?: string) => {
  try {
    let out = escapeHTML((txt || "").slice(0, 200000));
    out = out.replace(/\$\[\s*_+\s*\]/g, m => `<span style="${HL}">${m}</span>`);
    out = out.replace(/\{\s*[^{}\n]{1,100}\s*\}/g, m => `<span style="${HL}">${m}</span>`);
    out = out.replace(/\[\[\s*[^\]\n]{1,100}\s*\]\]/g, m => `<span style="${HL}">${m}</span>`);
    out = out.replace(/\[\s*[^\[\]\n]{1,100}\s*\]/g, m => `<span style="${HL}">${m}</span>`);
    out = out.replace(/&lt;\s*[^&\n]{1,100}\s*&gt;/g, m => `<span style="${HL}">${m}</span>`);
    out = out.replace(/([A-Za-z][A-Za-z0-9 .,'&\-\/()]+?\s*:\s*)(?:_[_\s]{2,})/g, (_a, label) => `<span style="${HL}">${label}_______</span>`);
    out = out.replace(/^\s*_[_\s]{2,}\s*$/gm, m => `<span style="${HL}">${m}</span>`);
    return out.replace(/\n/g, "<br/>");
  } catch {
    return (txt || "").slice(0, 200000).replace(/\n/g, "<br/>");
  }
};

const tcase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

export default function App(){
  const [file, setFile] = useState<File|null>(null);
  const [up, setUp] = useState<UploadResp|null>(null);
  const [vals, setVals] = useState<Record<string,string>>({});
  const [dl, setDl] = useState<string|null>(null);
  const [filled, setFilled] = useState<string|null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [chat, setChat] = useState<Msg[]>([]);
  const [target, setTarget] = useState<string|null>(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [sending, setSending] = useState(false);
  const chatBox = useRef<HTMLDivElement>(null);
  const reentry = useRef(false);

  useEffect(() => {
    if (chatBox.current) chatBox.current.scrollTo({ top: chatBox.current.scrollHeight, behavior: "smooth" })
  }, [chat, pending]);

  const ordered = useMemo(() => (up?.placeholders || []).filter(Boolean), [up]);
  const nextKey = React.useCallback((current:Record<string,string>) => ordered.find(k => !current[k] || !current[k].trim()) ?? null, [ordered]);
  const missing = useMemo(() => (!up ? [] : ordered.filter(p => !vals[p] || !vals[p].trim())), [up, ordered, vals]);
  const pct = useMemo(() => !up ? 0 : Math.round(((ordered.length - missing.length) / (ordered.length || 1)) * 100), [ordered.length, missing.length, up]);
  const highlighted = useMemo(() => safeHighlight(up?.textPreview), [up]);

  const pushAssistantOnce = (text:string) => setChat(c => {
    const last = c[c.length-1]; if (last && last.role==='assistant' && last.text===text) return c; return [...c, {role:'assistant', text}];
  });

  async function analyze(){
    if (!file) return;
    setChat([]); setDl(null); setFilled(null); setVals({}); setErr(null); setLog(l => [...l, "Analyzing…"]);
    try{
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(API + "/api/upload", { method:"POST", body: fd });
      const raw = await res.text(); const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("application/json")){
        setErr(`Analyze failed: non-JSON response (${res.status})`); setLog(l => [...l, `Analyze failed: ${res.status} non-JSON: ${raw.slice(0,200)}`]); return;
      }
      let payload:any; try{ payload = JSON.parse(raw) }catch(e){ setErr("Analyze failed: invalid JSON"); setLog(l=>[...l, `Analyze failed: invalid JSON`]); return; }
      if (!res.ok){ setErr(`Analyze failed: ${payload?.detail || payload?.error || res.status}`); setLog(l => [...l, `Analyze failed: ${payload?.detail || payload?.error || res.status}`]); return; }
      if (typeof payload?.docId !== 'string' || !Array.isArray(payload?.placeholders)){ setErr("Analyze failed: bad response shape"); setLog(l => [...l, "Analyze failed: bad response shape"]); return; }
      setUp(payload as UploadResp);
      const valid = (payload.placeholders as string[]).filter(Boolean);
      setLog(l => [...l, `Detected: ${valid.length}`]);
      const first = valid[0];
      if (first){
        setChat([{role:'assistant', text:`I found ${valid.length} fields. Let’s fill them one by one.`},{role:'assistant', text:`First up: What should we use for “${tcase(first)}”?`}]);
        setTarget(first);
      } else {
        setChat([{role:'assistant', text:'No placeholders found. You can still generate.'}]); setTarget(null);
      }
    }catch(e:any){
      const msg = e?.message || String(e); setErr(`Analyze crashed: ${msg}`); setLog(l => [...l, `Analyze crashed: ${msg}`]);
    }
  }

  async function reply(ans:string){
    if (!up || sending || reentry.current) return; reentry.current = true;
    const key = target ?? nextKey(vals); if (!key){ reentry.current = false; return; }
    if (looksDate(key) && !isDate(ans)){ setErr("Date must be MM-DD-YYYY"); pushAssistantOnce("Please use MM-DD-YYYY (e.g., 10-31-2025)."); reentry.current=false; return; }
    if (looksAmt(key) && !isAmount(ans)){ setErr("Amount must be numeric"); pushAssistantOnce("Use a number (e.g., 250000 or $250,000)."); reentry.current=false; return; }
    if (looksText(key) && !isTextOnly(ans)){ setErr("Text-only recommended"); pushAssistantOnce("Use letters/spaces (& . , - ' allowed)."); reentry.current=false; return; }
    setSending(true); setErr(null); setChat(c => [...c, {role:'user', text: ans}]);
    setVals(prev => { const nx = {...prev, [key]: ans}; const nxt = nextKey(nx);
      if (nxt){ pushAssistantOnce(`What should we use for “${tcase(nxt)}”?`); setTarget(nxt); }
      else { pushAssistantOnce("Great—everything’s filled. Click Generate to build your document."); setTarget(null); }
      return nx;
    });
    setSending(false); setTimeout(()=>{ reentry.current=false }, 0);
  }

  async function generate(){
    if (!up) return;
    setLog(l => [...l, "Generating…"]); setPending(true);
    const r = await fetch(API + "/api/fill", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ docId: up.docId, values: vals, textFallback: up.textPreview }) });
    setPending(false);
    if (!r.ok){ try{ const j=await r.json(); setLog(l=>[...l, `Generation failed: ${j?.detail||j?.error||r.status}`]) }catch{ const t=await r.text(); setLog(l=>[...l, `Generation failed: ${r.status} ${t}`]) } return; }
    const d = await r.json(); setDl(API + d.downloadPath); setFilled(d.filledPreview || ""); setLog(l => [...l, "Ready to download."]);
    setChat(c => [...c, {role:'assistant', text:'Document is ready—use Download link.'}]);
  }

  return (
    <div>
      <div className="header"><div className="container" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1 className="h1">Lexsy – Legal Doc Assistant</h1>
        <span className="badge">{up ? `Detected: ${ordered.length} • ${pct}% filled` : "AI-guided intake • MVP"}</span>
      </div></div>

      <div className="container" style={{marginTop:14}}>
        {up && <div className="progress" style={{marginBottom:12}}><div style={{width:`${isNaN(pct)?0:pct}%`}}/></div>}

        <section className="card">
          <h3 style={{marginTop:0}}>1) Upload your .docx</h3>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <input type="file" accept=".docx" onChange={e=>setFile(e.target.files?.[0]||null)} className="input"/>
            <button className="btn" onClick={analyze} disabled={!file}>Analyze</button>
          </div>
          {up && (<details style={{marginTop:10}} open>
            <summary>Template Preview (placeholders highlighted)</summary>
            <div className="preview" style={{maxHeight:480, overflow:'auto'}} dangerouslySetInnerHTML={{ __html: highlighted }}/>
            <div className="muted" style={{marginTop:6}}>Yellow = placeholders; other text = static template.</div>
          </details>)}
        </section>

        <div className="grid grid-2">
          <section className="card">
            <h3 style={{marginTop:0}}>2) Conversational Assist</h3>
            <div ref={chatBox} style={{height:260,overflow:'auto',padding:8,border:'1px solid var(--border)',borderRadius:8,background:'#0c1430'}}>
              {chat.filter(m=>m.text && m.text.trim()).map((m,i)=>(
                <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:8}}>
                  <div className={`chat-bubble ${m.role==='user'?'user':''}`}>{m.text}</div>
                </div>
              ))}
              {pending && <div className="muted">Assistant is typing…</div>}
            </div>
            <Composer disabled={!up || sending} placeholder={target ? `Answer for: ${tcase(target)}` : (missing.length ? "Answer the question…" : "")} onSubmit={reply}/>
          </section>

          <section className="card">
            <h3 style={{marginTop:0}}>3) Fields (auto-filled as you chat)</h3>
            {!up && <p>Analyze a document first.</p>}
            {up && (<>
              {ordered.length===0 && <p>No placeholders detected. You can still generate.</p>}
              <div className="grid" style={{gap:10}}>
                {ordered.map(p => (
                  <div key={p}>
                    <label style={{display:'block',fontWeight:600,marginBottom:4}}>{tcase(p)}</label>
                    <input className="input" placeholder={`Enter ${tcase(p)}`} value={vals[p]||''}
                      onChange={e=>{
                        const v = e.target.value; let msg:string|null=null;
                        if (looksDate(p) && v.trim() && !isDate(v)) msg = "Format: MM-DD-YYYY";
                        if (looksAmt(p) && v.trim() && !isAmount(v)) msg = "Numeric amount only";
                        if (looksText(p) && v.trim() && !isTextOnly(v)) msg = "Text only";
                        setErr(msg); setVals(x=>({...x, [p]: v}));
                      }}/>
                    {/date|effective/i.test(p) && <small className="muted">Format suggestion: 10-31-2025</small>}
                    {/amount|price|payment|purchase|cap/i.test(p) && <small className="muted">Just number is fine; $ added if needed.</small>}
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <button className="btn" onClick={generate} disabled={!up}>Generate Document</button>
                {missing.length>0 && <span className="badge">Missing: {missing.length}</span>}
                {dl && <a className="link" href={dl}>⬇️ Download .docx</a>}
                {err && <div className="muted">⚠️ {err}</div>}
              </div>
            </>)}
          </section>
        </div>

        {filled && (<section className="card" style={{marginTop:12}}>
          <h3 style={{marginTop:0}}>4) Filled Preview</h3>
          <pre className="preview" style={{maxHeight:480,overflow:'auto'}}>{filled}</pre>
          <div className="muted" style={{marginTop:6}}>Preview is plain text; download the .docx above.</div>
        </section>)}

        <section className="card" style={{marginTop:12}}>
          <h3 style={{marginTop:0}}>Activity</h3>
          <ul style={{margin:0,paddingLeft:18}}>{log.map((s,i)=><li key={i}>{s}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}

function Composer({ disabled, placeholder, onSubmit }:{ disabled?:boolean; placeholder?:string; onSubmit:(t:string)=>void; }){
  const [t,setT] = useState(""); 
  return (<form onSubmit={e=>{ e.preventDefault(); const x=t.trim(); if(!x) return; onSubmit(x); setT(""); }} style={{marginTop:10,display:'flex',gap:8}}>
    <input disabled={disabled} value={t} onChange={e=>setT(e.target.value)} placeholder={placeholder||"Type your answer…"} className="input"/>
    <button className="btn" disabled={disabled || !t.trim()} type="submit">Send</button>
  </form>);
}