import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun } from 'docx'

export async function readText(path){
  const { value } = await mammoth.extractRawText({ path })
  return (value || '').replace(/\r\n/g, '\n')
}

function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export function findPlaceholders(text){
  const set = new Set()
  const add = (s) => { if(s){ s = s.replace(/^[\s\-_:]+|[\s\-_:]+$/g,'').replace(/\s+/g,' ').trim(); if(s.length>=2 && /\w/.test(s)) set.add(s) } }
  const scan = (re, idx=1) => { let m; while((m = re.exec(text)) !== null) add(m[idx]) }

  scan(/\{\s*([^}]+?)\s*\}/g)
  scan(/\[\[\s*([^\]]+?)\s*\]\]/g)
  scan(/<\s*([^>]+?)\s*>/g)
  scan(/\[\s*([^\[\]\n]{2,})\s*\]/g)

  if (/\$\[\s*_+\s*\]/.test(text)) add('Amount')
  scan(/([A-Za-z][A-Za-z0-9 .,'&\-\/()]+?)\s*[:\-]?\s*_\s*[_\s]{2,}/g, 1)
  scan(/^([A-Za-z][A-Za-z0-9 .,'&\-\/()]+?):\s*$/gm, 1)

  let i=1, mm; const reBlank=/^\s*_[_\s]{2,}\s*$/gm; while((mm=reBlank.exec(text))!==null) add(`Blank ${i++}`)

  if (/^\s*\[COMPANY\]\s*$/m.test(text) || /^\s*COMPANY\s*:\s*$/m.test(text)) {
    set.add('Company Address'); set.add('Company Email')
  }
  if (/^\s*INVESTOR\s*:\s*$/m.test(text)) {
    set.add('Investor'); set.add('Investor Address'); set.add('Investor Email')
  }

  return Array.from(set)
}

export function fillAll(text, values){
  let out = text
  const kv = Object.entries(values || {}).filter(([k,v]) => v != null && String(v).trim() !== '')

  for (const [k, raw] of kv){
    const val = String(raw)
    const esc = escRe(k)

    const patterns = [
      `\\{\\s*${esc}\\s*\\}`,
      `\\[\\[\\s*${esc}\\s*\\\\]\\]`,
      `<\\s*${esc}\\s*>`,
      `\\[\\s*${esc}\\s*\\]`
    ]
    for (const p of patterns){ try{ out = out.replace(new RegExp(p,'g'), val) }catch{} }

    try{ out = out.replace(new RegExp(`(${esc}\\s*[:\\-]?\\s*)_[_\\s]{2,}`,'gi'), `$1${val}`) }catch{}
    try{ out = out.replace(new RegExp(`(\\b${esc}\\s*:)\\s*(?=\\n|$)`, 'gmi'), `$1 ${val}`) }catch{}

    const baseFromName = k.replace(/\bname\b/i, '').trim()
    if (baseFromName){
      const baseEsc = escRe(baseFromName)
      try{ out = out.replace(new RegExp(`(^\\s*${baseEsc}\\s*:)\\s*(?=\\n|$)`, 'gmi'), `$1 ${val}`) }catch{}
    }

    const lc = k.toLowerCase()
    out = fillScoped(out, 'COMPANY', 'Address', (lc.includes('company') && lc.includes('address')) ? val : null)
    out = fillScoped(out, 'COMPANY', 'Email',   (lc.includes('company') && lc.includes('email'))   ? val : null)
    out = fillScoped(out, 'INVESTOR', 'Address',(lc.includes('investor') && lc.includes('address')) ? val : null)
    out = fillScoped(out, 'INVESTOR', 'Email',  (lc.includes('investor') && lc.includes('email'))   ? val : null)

    if (/address/i.test(k)) { try{ out = out.replace(/(^\s*Address\s*:)\s*(?=\n|$)/gmi, `$1 ${val}`) }catch{} }
    if (/email/i.test(k))   { try{ out = out.replace(/(^\s*Email\s*:)\s*(?=\n|$)/gmi,   `$1 ${val}`) }catch{} }
  }

  if (values?.['Investor Name']) {
    try { out = out.replace(/(^\s*INVESTOR\s*:)\s*(?=\n|$)/gmi, `$1 ${String(values['Investor Name']).trim()}`) } catch {}
  }
  if (values?.Investor) {
    try { out = out.replace(/(^\s*INVESTOR\s*:)\s*(?=\n|$)/gmi, `$1 ${String(values.Investor).trim()}`) } catch {}
  }

  if (values?.Amount) {
    const a = String(values.Amount).trim().replace(/^\$/,'')
    out = out.replace(/\$\[\s*_+\s*\]/g,'$'+a)
  }

  return out
}

export function fillScoped(text, block, label, value){
  if (value == null) return text
  try{
    const blockRe = new RegExp(`^\s*${escRe(block)}\s*:?\s*$`, 'im')
    const m = blockRe.exec(text)
    if(!m) return text
    const start = m.index

    const headers = ['COMPANY','INVESTOR']
    let end = text.length
    for(const h of headers){
      if(h.toLowerCase() === block.toLowerCase()) continue
      const re = new RegExp(`^\s*${escRe(h)}\s*:?\s*$`, 'im')
      const mm = re.exec(text)
      if(mm && mm.index > start && mm.index < end) end = mm.index
    }

    const before = text.slice(0, start)
    const slice  = text.slice(start, end)
    const after  = text.slice(end)

    const labelRe = new RegExp(`(^\s*${escRe(label)}\s*:)\s*(?=\n|$)`, 'im')
    const replaced = slice.replace(labelRe, `$1 ${value}`)
    return before + replaced + after
  }catch{ return text }
}

export async function toDocxBuffer(text){
  const paras = text.split(/\n/).map(line => new Paragraph({ children: [new TextRun(line)] }))
  const doc = new Document({ sections:[{ children: paras }] })
  return await Packer.toBuffer(doc)
}