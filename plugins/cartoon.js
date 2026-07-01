const axios = require('axios');
const cheerio = require('cheerio');

// ─── Base URLs ────────────────────────────────────────────────────────────────
const JAP_BASE = 'https://www.cartoonsarea.cc';
const ENG_BASE = 'https://eng.cartoonsarea.cc';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.cartoonsarea.cc/',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeUrl(href, base) {
  if (!href) return null;
  href = href.trim();
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) return base + href;
  return base + '/' + href;
}

async function fetchPage(url) {
  const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  return res.data;
}

// ─── Scraper Functions ────────────────────────────────────────────────────────
async function findSeriesUrl(query, typeFilter = 'both') {
  const letter = query.trim()[0].toUpperCase();
  const allSources = [
    { base: JAP_BASE, listUrl: `${JAP_BASE}/Japanese-Dubbed-Videos/${letter}-Subbed-Series/`, type: 'japanese' },
    { base: JAP_BASE, listUrl: `${JAP_BASE}/Japanese-Dubbed-Videos/${letter}-Dubbed-Series/`, type: 'japanese' },
    { base: ENG_BASE, listUrl: `${ENG_BASE}/English-Dubbed-Series/${letter}-Dubbed-Series/`, type: 'english' },
  ];

  const sources = allSources.filter(s => typeFilter === 'both' || s.type === typeFilter);
  const found = [];
  const q = query.toLowerCase().replace(/\s+/g, '');

  for (const src of sources) {
    try {
      const html = await fetchPage(src.listUrl);
      const $ = cheerio.load(html);
      $('.Singamdasam a, .Singamda a, .singamda a, .Box a, td a, div.none a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (!href || !text || text.length < 3) return;
        const textNorm = text.toLowerCase().replace(/\s+/g, '');
        if (textNorm.includes(q) || q.includes(textNorm)) {
          const fullUrl = normalizeUrl(href, src.base);
          if (fullUrl && (fullUrl.includes('Dubbed') || fullUrl.includes('Subbed') || fullUrl.includes('-Videos'))) {
            found.push({ title: text, url: fullUrl, type: src.type });
          }
        }
      });
    } catch (_) {}
  }

  const seen = new Set();
  return found.filter(f => { if (seen.has(f.url)) return false; seen.add(f.url); return true; });
}

async function getSeasons(seriesUrl, baseHost) {
  const html = await fetchPage(seriesUrl);
  const $ = cheerio.load(html);
  const seasons = [];
  $('.Singamdasam a, .Singamda a, .singamda a, .Box a, td a, div.none a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text) return;
    if (!/season/i.test(text) && !/season/i.test(href)) return;
    const url = normalizeUrl(href, baseHost);
    if (url) seasons.push({ label: text, url });
  });
  return seasons;
}

async function getEpisodes(seasonUrl, baseHost) {
  const html = await fetchPage(seasonUrl);
  const $ = cheerio.load(html);
  const episodes = [];
  $('.Singamdasam a, .Singamda a, .singamda a, .Box a, td a, div.none a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || !text) return;
    if (!/episode/i.test(text) && !/episode/i.test(href)) return;
    const url = normalizeUrl(href, baseHost);
    if (url) episodes.push({ label: text, url });
  });
  return episodes;
}

async function getVideoFiles(episodeUrl, baseHost) {
  const html = await fetchPage(episodeUrl);
  const $ = cheerio.load(html);
  const files = [];
  $('a[href*=".mp4.php"], a[href*=".mp4"]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href) return;
    const url = normalizeUrl(href, baseHost);
    if (url) files.push({ label: text || 'Video file', url });
  });
  return files;
}

async function getDownloadLink(phpPageUrl, baseHost) {
  try {
    const html = await fetchPage(phpPageUrl);
    const $ = cheerio.load(html);

    const dlBtn = $('a.download-btn, a[download], a[href*="file"], a[href*="main"]').first();
    if (dlBtn.length) {
      const href = dlBtn.attr('href');
      if (href) return normalizeUrl(href, baseHost);
    }

    const udLink = $('a[href*="USER-DATA"]').first();
    if (udLink.length) {
      const href = udLink.attr('href');
      return normalizeUrl(href, baseHost);
    }
  } catch (_) {}
  return null;
}

// ─── Direct Stream / Download Helper ─────────────────────────────────────────
async function streamVideoToWhatsApp(sock, from, quotedMsg, directMp4Url, title) {
  try {
    await sock.sendMessage(from, { react: { text: '⬇️', key: quotedMsg.key } });

    const cleanFileName = `${title.replace(/[^a-zA-Z0-9 SriLanka]/g, '_')}.mp4`;

    await sock.sendMessage(from, {
      document: { url: directMp4Url },
      mimetype: 'video/mp4',
      fileName: cleanFileName,
      caption: `🎬 *${title}*\n\n> *Cartoons Area 🎭*`,
    }, { quoted: quotedMsg });

    await sock.sendMessage(from, { react: { text: '✅', key: quotedMsg.key } });
  } catch (err) {
    console.error("Download Error:", err);
    await sock.sendMessage(from, {
      text: `⚠️ *Download අසාර්ථකයි!*\nError: ${err.message}`,
    }, { quoted: quotedMsg });
  }
}

// ─── Global session store (memory) ───────────────────────────────────────────
const sessions = {};

function getSession(jid) { return sessions[jid] || null; }
function setSession(jid, data) { sessions[jid] = data; }
function clearSession(jid) { delete sessions[jid]; }

// ─── Plugin Export ────────────────────────────────────────────────────────────
module.exports = {
  name: 'cartoon',
  alias: ['animedl', 'cartoon'],
  category: 'anime',

  async execute(sock, m, { args }) {
    const from = m.key.remoteJid;
    const originalSender = m.key.participant || m.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(from, {
        text: `🎭 *CARTOON / ANIME DOWNLOADER*\n\nUsage:\n*.cartoon <name>*\nExample: *.cartoon naruto*`,
      }, { quoted: m });
    }

    await sock.sendMessage(from, { react: { text: '🔎', key: m.key } });

    const loadMsg = await sock.sendMessage(from, { text: `[▒▒▒▒▒▒▒▒▒▒] 0% 🎭` }, { quoted: m });

    const steps = [
      { bar: '[████▒▒▒▒▒▒] 40%', t: 200 },
      { bar: '[████████▒▒] 80%', t: 500 },
      { bar: '[██████████] 100%', t: 800 },
    ];
    for (const s of steps) {
      setTimeout(async () => {
        try { await sock.sendMessage(from, { text: `${s.bar} 🎭`, edit: loadMsg.key }); } catch (_) {}
      }, s.t);
    }

    let seriesList;
    try {
      seriesList = await findSeriesUrl(query, 'both');
    } catch (err) {
      return sock.sendMessage(from, { text: `⚠️ *සොයාගැනීමේ දෝෂයකි:* ${err.message}` }, { quoted: m });
    }

    setTimeout(async () => {
      try { await sock.sendMessage(from, { delete: loadMsg.key }); } catch (_) {}
    }, 1000);

    if (!seriesList || seriesList.length === 0) {
      return sock.sendMessage(from, { text: `❌ *"${query}" සඳහා ප්‍රතිඵල නොලැබුණි.*` }, { quoted: m });
    }

    const maxSeries = Math.min(seriesList.length, 8);
    let msg = `🎭 *CARTOON AREA SEARCH*\n\n`;
    msg += `🔎 *"${query.toUpperCase()}"* - ප්‍රතිඵල ${maxSeries}ක්\n`;
    msg += `─────────────────────\n\n`;
    for (let i = 0; i < maxSeries; i++) {
      const icon = seriesList[i].type === 'japanese' ? '🇯🇵' : '🇬🇧';
      msg += `*${i + 1}* ${icon} ${seriesList[i].title}\n`;
    }
    msg += `\n> *අංකයක් Reply කරන්න* 🎭`;

    setSession(from, {
      step: 'series',
      originalSender,
      seriesList: seriesList.slice(0, maxSeries),
    });

    const sentMsg = await sock.sendMessage(from, { text: msg }, { quoted: m });

    // ── Listener: Multi-step conversation ────────────────────────────────────
    const listener = async (upsert) => {
      const newMsg = upsert.messages[0];
      if (!newMsg?.message) return;

      const body = (
        newMsg.message.conversation ||
        newMsg.message.extendedTextMessage?.text || ''
      ).trim();

      const responder = newMsg.key.participant || newMsg.key.remoteJid;
      const msgFrom = newMsg.key.remoteJid;

      if (msgFrom !== from || responder !== originalSender) return;

      const session = getSession(from);
      if (!session) return;

      // ── Series select ────────────────────────────────────────────────────
      if (session.step === 'series' && /^\d+$/.test(body)) {
        const idx = parseInt(body) - 1;
        if (idx < 0 || idx >= session.seriesList.length) return;

        const selected = session.seriesList[idx];
        const baseHost = selected.url.includes('eng.cartoonsarea.cc') ? ENG_BASE : JAP_BASE;

        await sock.sendMessage(from, { react: { text: '⏳', key: newMsg.key } });

        let seasons;
        try { seasons = await getSeasons(selected.url, baseHost); } catch (_) { seasons = []; }

        if (seasons.length === 0) {
          let episodes;
          try { episodes = await getEpisodes(selected.url, baseHost); } catch (_) { episodes = []; }

          if (episodes.length === 0) {
            await sock.sendMessage(from, { text: `❌ *Episodes නොලැබුණි.*` }, { quoted: newMsg });
            clearSession(from);
            sock.ev.off('messages.upsert', listener);
            return;
          }

          setSession(from, { step: 'episode', originalSender, episodes, seriesTitle: selected.title, baseHost });
          await showEpisodeList(sock, from, newMsg, episodes, selected.title, sentMsg);
          return;
        }

        let smsg = `📺 *${selected.title}*\n\nSeasons ${seasons.length}ක්:\n─────────────────\n\n`;
        const maxS = Math.min(seasons.length, 10);
        for (let i = 0; i < maxS; i++) smsg += `*${i + 1}* 🎞️ ${seasons[i].label}\n`;
        smsg += `\n> *Season අංකය Reply කරන්න* 🎭`;

        setSession(from, { step: 'season', originalSender, seasons: seasons.slice(0, maxS), seriesTitle: selected.title, baseHost });

        const sm = await sock.sendMessage(from, { text: smsg }, { quoted: newMsg });
        sentMsg.key.id = sm.key.id;
        return;
      }

      // ── Season select ────────────────────────────────────────────────────
      if (session.step === 'season' && /^\d+$/.test(body)) {
        const idx = parseInt(body) - 1;
        if (idx < 0 || idx >= session.seasons.length) return;

        const season = session.seasons[idx];
        await sock.sendMessage(from, { react: { text: '⏳', key: newMsg.key } });

        let episodes;
        try { episodes = await getEpisodes(season.url, session.baseHost); } catch (_) { episodes = []; }

        if (episodes.length === 0) {
          await sock.sendMessage(from, { text: `❌ *Episodes නොලැබුණි.*` }, { quoted: newMsg });
          clearSession(from);
          sock.ev.off('messages.upsert', listener);
          return;
        }

        setSession(from, { ...session, step: 'episode', episodes, currentSeason: season.label });
        await showEpisodeList(sock, from, newMsg, episodes, `${session.seriesTitle} — ${season.label}`, sentMsg);
        return;
      }

      // ── Episode select (RAM Friendly - Single Request, Keeping Session Open) ──
      if (session.step === 'episode' && /^\d+$/.test(body)) {
        const idx = parseInt(body) - 1;
        if (idx < 0 || idx >= session.episodes.length) return;

        const episode = session.episodes[idx];
        
        // ⚡ RAM Fix: clearSession සහ sock.ev.off කරන්නේ නෑ! 
        // ඒ නිසා යූසර්ට එකම ලිස්ට් එකට ආයෙත් රිප්ලයි කරලා ඊළඟ එපිය ගන්න පුළුවන්.

        let files;
        try { files = await getVideoFiles(episode.url, session.baseHost); } catch (_) { files = []; }

        if (files.length === 0) {
          return sock.sendMessage(from, { text: `❌ *Video files නොලැබුණි.*` }, { quoted: newMsg });
        }

        let targetFile = files[0];
        let finalUrl = targetFile.url;

        if (finalUrl.includes('.mp4.php')) {
          const dl = await getDownloadLink(finalUrl, session.baseHost);
          if (dl) finalUrl = dl;
        }

        // වීඩියෝව සෙන්ඩ් කරනවා (සෙශන් එක දිගටම වැඩ)
        await streamVideoToWhatsApp(sock, from, newMsg, finalUrl, `${session.seriesTitle} — ${episode.label}`);
      }
    };

    sock.ev.on('messages.upsert', listener);
    
    // විනාඩි 15කින් කිසිම රිප්ලයි එකක් නැති වුණොත් විතරක් සෙශන් එක ක්ලෝස් කරනවා මෙමරි ලීක් නොවෙන්න
    setTimeout(() => {
      clearSession(from);
      sock.ev.off('messages.upsert', listener);
    }, 900000);
  },
};

// ─── Helper: Episode list message ─────────────────────────────────────────────
async function showEpisodeList(sock, from, quotedMsg, episodes, title, sentMsgRef) {
  const maxE = Math.min(episodes.length, 30);
  let emsg = `🎬 *${title}*\n\nEpisodes ${episodes.length}ක් (${maxE} ක් පෙන්වයි):\n─────────────────\n\n`;
  for (let i = 0; i < maxE; i++) emsg += `*${i + 1}* ▶️ ${episodes[i].label}\n`;
  
  emsg += `\n💡 *ඕනෑම Episode අංකයක් මෙයට Reply කර ලබාගන්න. (එකම මැසේජ් එකට කිහිප සැරයක් වුවද රිප්ලයි කල හැක)*`;
  emsg += `\n\n> *Reply කරන්න* 🎭`;

  const em = await sock.sendMessage(from, { text: emsg }, { quoted: quotedMsg });
  sentMsgRef.key.id = em.key.id;
}
