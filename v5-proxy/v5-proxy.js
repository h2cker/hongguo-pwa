'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = parseInt(process.env.PROXY_PORT || '9589', 10);
const SIGNER_URL = process.env.SIGNER_URL || 'http://127.0.0.1:9590';
const UPSTREAM_API = process.env.UPSTREAM_API || 'http://shortdramacat:9587';
const CACHE_DIR = process.env.CACHE_DIR || '/tmp/v5cache';
const MAX_CACHE_FILES = 120;
const PLAY_TTL_MS = 10 * 60 * 1000;
const STATIC_RPC_TTL_MS = 5 * 60 * 1000;
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 15000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 15000 });
const PLAYBACK_UA = 'com.phoenix.read/73932 (Linux; U; Android 12; zh_CN_#Hans; PGT-AN10; Build/V417IR;tt-ok/3.12.13.20)';
const KDF_CONSTANTS = Buffer.from(
  '4dd4c2e6b83162090e52b3c7a6733ba41cb2462b829ab58a196b39db57177524f49baf7f08e8d68d26a72e37c1a95a2f1f05a51892aef2949732b62a38aadd58',
  'hex'
);

fs.mkdirSync(CACHE_DIR, { recursive: true });
try {
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (f.endsWith('.raw') || f.endsWith('.tmp.mp4')) fs.unlinkSync(path.join(CACHE_DIR, f));
  }
} catch (_) {}

const playInfoCache = new Map();
const playInfoInFlight = new Map();
const staticRpcCache = new Map();
const mediaTokens = new Map();
const downloadInFlight = new Map();

function bitCount(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

function deriveKeyHex(value) {
  if (!value) return '';
  const raw = Buffer.from(value, 'base64');
  if (raw.length < 3) return '';
  try {
    const tagLength = (raw[0] ^ raw[1] ^ raw[2]) - 48;
    const contentLength = raw.length - tagLength - 1;
    if (tagLength >= 1 && contentLength >= 33 && contentLength < raw.length) {
      const seed = raw[raw.length - tagLength - 2] ^ raw[raw.length - tagLength - 1];
      const tag = Buffer.alloc(tagLength);
      for (let i = 0; i < tagLength; i++) tag[i] = raw[raw.length - tagLength + i] ^ seed;
      const tagStr = tag.toString('utf8');
      if (tagStr !== 'app_v2' && tagStr !== 'web_v2') {
        const decoded = Buffer.alloc(contentLength);
        let prevEven = 250, prevOdd = 85;
        for (let idx = 0; idx < contentLength; idx++) {
          const cur = raw[1 + idx];
          const prev = (idx % 2 === 0) ? prevEven : prevOdd;
          if (idx % 2 === 0) prevEven = cur; else prevOdd = cur;
          decoded[idx] = ((prev ^ cur) - 21 - bitCount(idx)) & 0xff;
        }
        const c0 = decoded[0];
        let padding = null;
        if (c0 >= 0x30 && c0 <= 0x39) padding = c0 - 0x30;
        else if (c0 >= 0x61 && c0 <= 0x7a) padding = c0 - 0x61 + 10;
        if (padding !== null && contentLength - padding - 1 === 32) {
          const hexKey = decoded.subarray(1, 33).toString('ascii');
          if (/^[0-9a-fA-F]{32}$/.test(hexKey)) return hexKey.toLowerCase();
        }
      }
    }
  } catch (_) {}
  const length = Math.min(raw.length - (raw[0] ^ raw[1] ^ raw[2]) + 47, raw.length - 1);
  if (length < 33) return '';
  const work = Buffer.from(raw.subarray(1, 1 + length));
  let a = 85, b = 246;
  for (let i = 0; i < work.length; i++) {
    const old = work[i];
    const prev = (i & 1) ? a : b;
    if (i & 1) a = old; else b = old;
    work[i] = (-21 - bitCount(i) + (prev ^ old)) & 0xff;
  }
  const hexKey = work.subarray(1, 33).toString('ascii');
  return /^[0-9a-fA-F]{32}$/.test(hexKey) ? hexKey.toLowerCase() : '';
}

function decryptUrl(value, seedBuf) {
  if (!seedBuf || !value) return value;
  try {
    const raw = Buffer.from(value, 'base64');
    if (raw.length < 20 || raw[0] !== 0xa8 || raw[2] !== 1 || raw[3] !== 0) return value;
    const h1 = crypto.createHash('sha512').update(seedBuf).digest();
    const h = crypto.createHash('sha512').update(Buffer.concat([h1, KDF_CONSTANTS])).digest();
    const cipherLen = Math.floor((raw.length - 4) / 16) * 16;
    const decipher = crypto.createDecipheriv('aes-128-cbc', h.subarray(0, 16), h.subarray(16, 32));
    decipher.setAutoPadding(false);
    const bytes = Buffer.concat([decipher.update(raw.subarray(4, 4 + cipherLen)), decipher.final()]);
    let end = bytes.length;
    const pad = bytes[end - 1];
    if (pad >= 1 && pad <= 16 && pad <= end) end -= pad;
    while (end > 0 && bytes[end - 1] === 0) end--;
    const out = bytes.subarray(0, end).toString('utf8');
    return out.startsWith('http') ? out : value;
  } catch (_) {
    return value;
  }
}

function asObject(val) {
  if (val && typeof val === 'object') return val;
  if (typeof val === 'string') {
    let text = val.trim();
    if (!text.startsWith('{')) {
      try { text = Buffer.from(text, 'base64').toString('utf8'); } catch (_) {}
    }
    try { return JSON.parse(text); } catch (_) { return null; }
  }
  return null;
}

function firstUrl(row, seedBuf) {
  const candidates = [];
  if (typeof row.main_url === 'string' && row.main_url) candidates.push(row.main_url);
  if (typeof row.backup_url === 'string' && row.backup_url) candidates.push(row.backup_url);
  if (typeof row.backup_url_1 === 'string' && row.backup_url_1) candidates.push(row.backup_url_1);
  if (Array.isArray(row.backup_url_list)) {
    for (const u of row.backup_url_list) {
      if (typeof u === 'string' && u) candidates.push(u);
    }
  }
  for (const val of candidates) {
    if (val.startsWith('http')) return val;
    if (seedBuf) {
      const decrypted = decryptUrl(val, seedBuf);
      if (decrypted.startsWith('http')) return decrypted;
    }
    try {
      const dec = Buffer.from(val, 'base64').toString('utf8').trim();
      if (dec.startsWith('http')) return dec;
    } catch (_) {}
  }
  return '';
}

function httpGetBuffer(url, headers = {}, redirects = 4, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const mod = isHttps ? https : http;
    const req = mod.get(url, { headers, timeout: timeoutMs, agent: isHttps ? httpsAgent : httpAgent }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(httpGetBuffer(res.headers.location, headers, redirects - 1, timeoutMs));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

function setPlayCache(videoId, entry) {
  if (playInfoCache.size >= 100) playInfoCache.delete(playInfoCache.keys().next().value);
  playInfoCache.set(videoId, entry);
}

function getPlayCache(videoId, preferredQuality = '') {
  const cached = playInfoCache.get(videoId);
  if (!cached) return null;
  if (Date.now() - cached.ts >= PLAY_TTL_MS) {
    playInfoCache.delete(videoId);
    return null;
  }
  if (cached.source === 'v5' && cached.data && Array.isArray(cached.data.qualities)) {
    const targetQ = cached.data.qualities.find((q) => q.name === preferredQuality)
      || cached.data.qualities[cached.data.qualities.length - 1];
    if (targetQ) {
      const tok = targetQ.url.replace('/v5media/', '');
      const ent = mediaTokens.get(tok);
      if (ent) ensureMediaFile(tok, ent).catch(() => {});
    }
  }
  return cached;
}

async function resolvePlayInfoV5(videoId, preferredQuality = '') {
  const rawBuf = await httpGetBuffer(`${SIGNER_URL}/playinfo?vid=${encodeURIComponent(videoId)}`, {}, 4, 15000);
  const json = JSON.parse(rawBuf.toString('utf8'));
  const code = json.code !== undefined ? json.code : (json.Code !== undefined ? json.Code : 0);
  if (code !== 0) throw new Error('upstream code ' + code);

  const data = json.data || {};
  const entries = data['1004'] || data.video_model_data || data;
  const entry = entries[videoId];
  if (!entry) throw new Error('missing video entry');
  const model = asObject(entry.video_model);
  if (!model) throw new Error('missing video_model');

  const fbUrl = typeof model.fallback_api === 'string'
    ? model.fallback_api
    : (model.fallback_api && typeof model.fallback_api.fallback_api === 'string' ? model.fallback_api.fallback_api : '');

  const byName = new Map();
  let skippedBytevc2 = 0;

  function collectFromSource(src) {
    if (!src) return;
    const seedText = src.key_seed || model.key_seed || '';
    const seedBuf = seedText ? Buffer.from(seedText, 'base64') : null;
    const list = src.video_list;
    const rows = Array.isArray(list) ? list : (list && typeof list === 'object' ? Object.values(list) : []);
    for (const row of rows) {
      if (!row) continue;
      const meta = row.video_meta || {};
      const codec = String(row.codec_type || meta.codec_type || '').toLowerCase();
      if (codec.includes('bytevc2') || codec.includes('h266') || codec.includes('vvc')) {
        skippedBytevc2++;
        continue;
      }
      let url = firstUrl(row, seedBuf);
      if (!url) continue;
      if (!url.startsWith('http')) continue;

      const spade = row.spade_a || (row.encrypt_info && row.encrypt_info.spade_a) || '';
      const keyHex = spade ? deriveKeyHex(spade) : '';
      const width = meta.vwidth || row.vwidth || row.width || 0;
      const height = meta.vheight || row.vheight || row.height || 0;
      const defStr = String(meta.definition || row.definition || '');
      const numMatch = defStr.match(/\d+/);
      const num = numMatch ? parseInt(numMatch[0], 10) : (width && height ? Math.min(width, height) : 720);
      const name = `${num}p`;
      const score = (codec === 'h264' || codec === 'avc' || codec === 'avc1') ? 2 : 1;

      const prev = byName.get(name);
      if (!prev || score > prev.score) {
        byName.set(name, { name, num, url, keyHex, width, height, score });
      }
    }
  }

  collectFromSource(model);

  if (!byName.size && fbUrl) {
    const cleanFbUrl = fbUrl.replace(/codec_type=\d+/, 'codec_type=1').replace(/&force_fids=[^&]+/, '');
    const fbBuf = await httpGetBuffer(cleanFbUrl, { 'User-Agent': PLAYBACK_UA });
    const fbJson = JSON.parse(fbBuf.toString('utf8'));
    if (fbJson.video_info && fbJson.video_info.data) {
      collectFromSource(fbJson.video_info.data);
    }
  }

  const sorted = Array.from(byName.values()).sort((a, b) => a.num - b.num);
  if (!sorted.length) {
    if (skippedBytevc2 > 0) throw new Error('该集仅提供 bytevc2 编码，iOS 暂不支持');
    throw new Error('no playable qualities');
  }

  const qualities = sorted.map((q) => {
    const token = `${videoId}_${q.name}`;
    mediaTokens.set(token, { url: q.url, keyHex: q.keyHex, ts: Date.now() });
    if (mediaTokens.size > 400) {
      const oldest = mediaTokens.keys().next().value;
      mediaTokens.delete(oldest);
    }
    return { name: q.name, url: `/v5media/${token}`, width: q.width, height: q.height };
  });

  const result = { videoId, qualities };

  // Eagerly start downloading & decrypting the user's preferred quality (or highest)
  const eagerQ = qualities.find(q => q.name === preferredQuality) || qualities[qualities.length - 1];
  if (eagerQ) {
    const eagerTok = eagerQ.url.replace('/v5media/', '');
    const eagerEnt = mediaTokens.get(eagerTok);
    if (eagerEnt) ensureMediaFile(eagerTok, eagerEnt).catch(() => {});
  }

  return result;
}

function httpDownloadToFile(url, destPath, headers = {}, redirects = 4, retries = 1) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const mod = isHttps ? https : http;
    const req = mod.get(url, { headers, timeout: 12000, agent: isHttps ? httpsAgent : httpAgent }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(httpDownloadToFile(res.headers.location, destPath, headers, redirects - 1, retries));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      ws.on('finish', () => ws.close(resolve));
      ws.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });
      res.on('error', (err) => {
        ws.destroy();
        try { fs.unlinkSync(destPath); } catch (_) {}
        if (retries > 0) return resolve(httpDownloadToFile(url, destPath, headers, redirects, retries - 1));
        reject(err);
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (err) => {
      if (retries > 0) return resolve(httpDownloadToFile(url, destPath, headers, redirects, retries - 1));
      reject(err);
    });
  });
}

function pruneDiskCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => {
        const p = path.join(CACHE_DIR, f);
        return { p, mtime: fs.statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    for (let i = MAX_CACHE_FILES; i < files.length; i++) {
      try { fs.unlinkSync(files[i].p); } catch (_) {}
    }
  } catch (_) {}
}

function ffmpegDecrypt(rawPath, mp4Path, keyHex) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-v', 'error'];
    if (keyHex) args.push('-decryption_key', keyHex);
    args.push('-i', rawPath, '-c', 'copy', '-movflags', '+faststart', mp4Path);
    execFile('ffmpeg', args, { timeout: 30000 }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });
}

async function ensureMediaFile(token, entry) {
  const mp4Path = path.join(CACHE_DIR, `${token}.mp4`);
  if (fs.existsSync(mp4Path)) {
    try { const now = new Date(); fs.utimesSync(mp4Path, now, now); } catch (_) {}
    return mp4Path;
  }
  if (!entry) throw new Error('expired');
  if (downloadInFlight.has(token)) return downloadInFlight.get(token);

  const p = (async () => {
    const rawPath = path.join(CACHE_DIR, `${token}.raw`);
    const tmpMp4 = path.join(CACHE_DIR, `${token}.tmp.mp4`);
    try {
      await httpDownloadToFile(entry.url, rawPath, { 'User-Agent': PLAYBACK_UA });
      if (entry.keyHex) {
        await ffmpegDecrypt(rawPath, tmpMp4, entry.keyHex);
        fs.renameSync(tmpMp4, mp4Path);
      } else {
        fs.renameSync(rawPath, mp4Path);
      }
      pruneDiskCache();
      return mp4Path;
    } catch (err) {
      try { fs.unlinkSync(tmpMp4); } catch (_) {}
      if (String(err && err.message).includes('HTTP 403') || String(err && err.message).includes('HTTP 410')) {
        const vid = token.split('_')[0];
        if (vid) playInfoCache.delete(vid);
        mediaTokens.delete(token);
      }
      throw err;
    } finally {
      try { fs.unlinkSync(rawPath); } catch (_) {}
    }
  })().finally(() => {
    downloadInFlight.delete(token);
  });

  downloadInFlight.set(token, p);
  return p;
}

function callUpstreamPlayInfo(seriesId, videoId) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ method: 'PlayInfo', args: [seriesId, videoId] }), 'utf8');
    const target = new URL('/api/call', UPSTREAM_API);
    const req = http.request(
      target,
      {
        method: 'POST',
        agent: httpAgent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
          host: '127.0.0.1:9587',
          origin: 'http://127.0.0.1:9587',
          referer: 'http://127.0.0.1:9587/',
        },
        timeout: 12000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!parsed || !parsed.ok || !parsed.data || !Array.isArray(parsed.data.qualities) || !parsed.data.qualities.length) {
              return reject(new Error((parsed && parsed.error) || 'empty upstream qualities'));
            }
            const filtered = parsed.data.qualities.filter((q) => {
              const c = String((q && q.codec) || '').toLowerCase();
              return !c.includes('bytevc2') && !c.includes('h266') && !c.includes('vvc');
            });
            if (!filtered.length) return reject(new Error('该集仅提供 bytevc2 编码，iOS 暂不支持'));
            parsed.data.qualities = filtered;
            resolve(parsed.data);
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('upstream timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

function forwardToShortDramaCat(req, res, bodyBuf, cacheMethod = '') {
  const target = new URL(req.url, UPSTREAM_API);
  const fwdHeaders = {
    ...req.headers,
    host: '127.0.0.1:9587',
    origin: 'http://127.0.0.1:9587',
    referer: 'http://127.0.0.1:9587/',
    'content-length': bodyBuf.length,
  };
  if (cacheMethod) delete fwdHeaders['accept-encoding'];
  const proxyReq = http.request(
    target,
    {
      method: req.method,
      agent: httpAgent,
      headers: fwdHeaders,
      timeout: 30000,
    },
    (proxyRes) => {
      if (cacheMethod && proxyRes.statusCode === 200) {
        const chunks = [];
        proxyRes.on('data', (c) => chunks.push(c));
        proxyRes.on('end', () => {
          const buf = Buffer.concat(chunks);
          try {
            const parsedRes = JSON.parse(buf.toString('utf8'));
            if (parsedRes && parsedRes.ok) {
              staticRpcCache.set(cacheMethod, { buf, headers: proxyRes.headers, ts: Date.now() });
              if (staticRpcCache.size > 150) {
                const oldestKey = staticRpcCache.keys().next().value;
                staticRpcCache.delete(oldestKey);
              }
            }
          } catch (_) {}
          res.writeHead(200, proxyRes.headers);
          res.end(buf);
        });
        proxyRes.on('error', () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        return;
      }
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  });
  proxyReq.end(bodyBuf);
}

async function resolvePlayInfoUnified(seriesId, videoId, preferredQuality = '') {
  const cached = getPlayCache(videoId, preferredQuality);
  if (cached) return cached;
  if (playInfoInFlight.has(videoId)) return playInfoInFlight.get(videoId);

  const p = (async () => {
    try {
      const v5Data = await resolvePlayInfoV5(videoId, preferredQuality);
      const entry = { data: v5Data, source: 'v5', ts: Date.now() };
      setPlayCache(videoId, entry);
      return entry;
    } catch (v5Err) {
      const v5Msg = String((v5Err && v5Err.message) || v5Err || '');
      if (v5Msg.includes('bytevc2')) throw v5Err;
      try {
        const upstreamData = await callUpstreamPlayInfo(seriesId, videoId);
        const entry = { data: upstreamData, source: 'sdc-fallback', ts: Date.now() };
        setPlayCache(videoId, entry);
        return entry;
      } catch (_) {
        throw new Error('播放通道繁忙，正在自动恢复，请稍候重试');
      }
    }
  })().finally(() => {
    playInfoInFlight.delete(videoId);
  });

  playInfoInFlight.set(videoId, p);
  return p;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/call' && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const bodyBuf = Buffer.concat(chunks);
      let parsed = null;
      try { parsed = JSON.parse(bodyBuf.toString('utf8')); } catch (_) {}
      if (parsed && (parsed.method === 'FeedCategories' || parsed.method === 'RankPanel' || parsed.method === 'SeriesDetail' || parsed.method === 'SearchSuggest' || parsed.method === 'Search')) {
        const cacheKey = (parsed.method === 'SeriesDetail' || parsed.method === 'SearchSuggest' || parsed.method === 'Search')
          ? `${parsed.method}:${Array.isArray(parsed.args) ? parsed.args.map(x => String(x || '')).join(':') : ''}`
          : parsed.method;
        const hit = staticRpcCache.get(cacheKey);
        if (hit && Date.now() - hit.ts < STATIC_RPC_TTL_MS) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(hit.buf);
          return;
        }
        return forwardToShortDramaCat(req, res, bodyBuf, cacheKey);
      }
      if (parsed && parsed.method === 'PlayInfo' && Array.isArray(parsed.args) && parsed.args[1]) {
        const seriesId = String(parsed.args[0] || '');
        const videoId = String(parsed.args[1]);
        const prefQ = parsed.args[2] ? String(parsed.args[2]) : '';
        try {
          const resolved = await resolvePlayInfoUnified(seriesId, videoId, prefQ);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, data: resolved.data, source: resolved.source }));
          return;
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: (err && err.message) || '播放通道繁忙，正在自动恢复，请稍候重试' }));
          return;
        }
      }
      return forwardToShortDramaCat(req, res, bodyBuf);
    }

    if (req.url.startsWith('/v5media/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const token = req.url.slice('/v5media/'.length).split('?')[0].replace(/[^a-zA-Z0-9_.-]/g, '');
      const cachedMp4 = path.join(CACHE_DIR, `${token}.mp4`);
      const entry = mediaTokens.get(token);
      if (!entry && !fs.existsSync(cachedMp4)) {
        res.writeHead(404);
        res.end('expired');
        return;
      }
      const filePath = await ensureMediaFile(token, entry);
      const stat = fs.statSync(filePath);
      const total = stat.size;
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!m) {
          res.writeHead(416, { 'Content-Range': `bytes */${total}` });
          res.end();
          return;
        }
        const start = m[1] ? parseInt(m[1], 10) : Math.max(0, total - parseInt(m[2], 10));
        const end = m[2] ? Math.min(total - 1, parseInt(m[2], 10)) : total - 1;
        if (start > end || start >= total) {
          res.writeHead(416, { 'Content-Range': `bytes */${total}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': end - start + 1,
        });
        if (req.method === 'HEAD') return res.end();
        const rs = fs.createReadStream(filePath, { start, end });
        res.on('close', () => { if (!rs.destroyed) rs.destroy(); });
        rs.on('error', () => { if (!res.destroyed) res.destroy(); });
        rs.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
          'Content-Length': total,
        });
        if (req.method === 'HEAD') return res.end();
        const rs = fs.createReadStream(filePath);
        res.on('close', () => { if (!rs.destroyed) rs.destroy(); });
        rs.on('error', () => { if (!res.destroyed) res.destroy(); });
        rs.pipe(res);
      }
      return;
    }

    res.writeHead(404);
    res.end('not found');
  } catch (err) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`v5-proxy listening on 0.0.0.0:${PORT}`);
});
