import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'
import { readText, findPlaceholders, fillAll, toDocxBuffer } from './lib/doc.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))
const upload = multer({ dest: 'uploads/' })
const PORT = process.env.PORT || 8787
const STORE = new Map()

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' })
    const id = nanoid(8)
    const p = req.file.path
    let text = ''
    try { text = await readText(p) } catch (e) { console.error('MAMMOTH_ERROR:', e); text = '' }
    const ph = findPlaceholders(text || '')
    STORE.set(id, { path: p, text, ph })
    res.json({ docId: id, placeholders: ph, textPreview: text || '' })
  } catch (e) {
    console.error('ANALYZE_ERROR:', e)
    res.status(500).json({ error: 'analyze failed', detail: String(e?.message || e) })
  }
})

app.post('/api/fill', async (req, res) => {
  try {
    const { docId, values = {}, textFallback } = req.body || {}
    const rec = docId ? STORE.get(docId) : null
    const text = (rec && rec.text) ? rec.text : (typeof textFallback === 'string' ? textFallback : null)
    if (!text) return res.status(404).json({ error: 'docId not found' })

    const filled = fillAll(text, values)

    const outDir = path.resolve('downloads')
    fs.mkdirSync(outDir, { recursive: true })
    const outName = `${docId || 'direct'}.docx`
    const outPath = path.join(outDir, outName)
    const buf = await toDocxBuffer(filled)
    fs.writeFileSync(outPath, buf)

    res.json({ downloadPath: `/api/download/${docId || 'direct'}`, filledPreview: filled })
  } catch (e) {
    console.error('FILL_ERROR:', e)
    res.status(500).json({ error: 'fill failed', detail: String(e?.message || e) })
  }
})

app.get('/api/download/:id', (req, res) => {
  const filePath = path.resolve('downloads', `${req.params.id}.docx`)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  res.setHeader('Content-Disposition', `attachment; filename="lexsy-filled-${req.params.id}.docx"`)
  res.sendFile(filePath)
})

app.listen(PORT, () => console.log('server on http://localhost:' + PORT))