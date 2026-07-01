const axios = require('axios');
const cheerio = require('cheerio');

const JAP_BASE = 'https://www.cartoonsarea.cc';
const ENG_BASE = 'https://eng.cartoonsarea.cc';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.cartoonsarea.cc/',
};

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

const sessions = {};
let isGlobalListenerAttached = false;

function setSession(jid, data) {
    if (sessions[jid] && sessions[jid].timer) clearTimeout(sessions[jid].timer);
    data.timer = setTimeout(() => { delete sessions[jid]; }, 900000); 
    sessions[jid] = data;
}

module.exports = {
    name: 'cartoon',
    alias: ['animedl', 'cartoon'],
    category: 'anime',

    async execute(sock, m, { args }) {
        const from = m.key.remoteJid;
        const originalSender = m.key.participant || m.key.remoteJid;
        const query = args.join(' ').trim();

        if (!query) return sock.sendMessage(from, { text: `Usage: .cartoon <name>` }, { quoted: m });
        
        const seriesList = await findSeriesUrl(query);
        if (seriesList.length === 0) return sock.sendMessage(from, { text: "No results found." }, { quoted: m });
        
        await sock.sendMessage(from, { text: `Found ${seriesList.length} results.` }, { quoted: m });
        setSession(from, { step: 'series', originalSender, seriesList });
    }
};
