const Baileys = require('@whiskeysockets/baileys');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    Browsers,
    getContentType,
    downloadContentFromMessage
} = Baileys;

const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

// Global Logger Instance (එකම ලොගර් එකක් පාවිච්චි කිරීමෙන් RAM ඉතුරු වේ)
const logger = pino({ level: 'silent' });

function runtime(seconds) {
    seconds = Number(seconds);
    var d = Math.floor(seconds / (3600 * 24)), h = Math.floor(seconds % (3600 * 24) / 3600), m = Math.floor(seconds % 3600 / 60), s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

const PRO_IMG = "https://files.catbox.moe/fnpjhk.jpg";

// 🚫 Blocked Numbers List (LORD INDUMINA)
const blockedNumbers = ["94754933638", "94710579948", "94742349884","94788455580"];

const downloadMedia = async (m) => {
    const msg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage ? m.message.extendedTextMessage.contextInfo.quotedMessage : m.message;
    if (!msg) return null;
    const type = Object.keys(msg)[0];
    const stream = await downloadContentFromMessage(msg[type], type.replace('Message', ''));
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
};

async function startBloodyRose() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        // Cacheable Key Store එක පාවිච්චි කිරීමෙන් Auth නිසා සිදුවන RAM පිරීම වැළකේ
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        printQRInTerminal: false,
        logger: logger,
        browser: Browsers.ubuntu("Chrome"),

        // ⚠️ RAM එක අඩුවෙන්ම ගන්න සෙටින්ග්ස් (Ultra Performance)
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false,
        linkPreviewImageThumbnailWidth: 100, // ලින්ක් ප්‍රිවීව් වල සයිස් එක අඩු කිරීම
        maxChatPreviews: 0, // පැරණි චැට් ලෝඩ් කිරීම වැළැක්වීම
        emitOwnedEvents: false
    });

    // Plugins Load කිරිම
    const plugins = {};
    const pluginsPath = path.join(__dirname, 'plugins');
    if (fs.existsSync(pluginsPath)) {
        fs.readdirSync(pluginsPath).forEach(file => {
            if (file.endsWith('.js')) {
                try {
                    const plugin = require(path.join(pluginsPath, file));
                    if (plugin.name) plugins[plugin.name] = plugin;
                    if (plugin.alias) plugin.alias.forEach(a => plugins[a] = plugin);
                } catch (e) {
                    console.log(`❌ Plugin Load Error: ${file} | ${e.message}`);
                }
            }
        });
    }

    // මැසේජ් හැන්ඩ්ලර් එක
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        let msg = m.messages[0];
        if (!msg || !msg.message) return;

        // පැරණි මැසේජ් රන් වීම වැළැක්වීම
        if (Math.floor(Date.now() / 1000) - msg.messageTimestamp > 60) return;

        const from = msg.key.remoteJid;
        if (from === 'status@broadcast') return; // Status View වලදී ක්‍රියාත්මක නොවේ (RAM ඉතුරුයි)

        const ownerNumber = "94762912642@s.whatsapp.net";

        // 🔎 LID-safe sender resolution - WhatsApp now sometimes sends a LID
        // instead of the real phone number in groups, so check every possible field
        const rawSender = msg.key.participant || msg.key.remoteJid;
        const altSender = msg.key.participantPn || msg.key.participantAlt || msg.key.remoteJidAlt || null;

        const senderJid = rawSender.split(':')[0].split('@')[0] + '@s.whatsapp.net';
        const senderNumberOnly = senderJid.split('@')[0];
        const altNumberOnly = altSender ? altSender.split(':')[0].split('@')[0] : null;

        // 🐞 Debug log - remove later once confirmed working
        console.log('DEBUG sender:', { rawSender, altSender, senderNumberOnly, altNumberOnly });

        const isOwner = msg.key.fromMe || senderJid === ownerNumber;

        // 💉 LID Detection -> auto-react ONLY for this specific number's LID (works in groups & inbox)
        const targetLidNumber = "94762912642";
        const isLidSender = rawSender.endsWith('@lid') && altNumberOnly === targetLidNumber;
        if (isLidSender) {
            try {
                await sock.sendMessage(from, {
                    react: {
                        text: '💉',
                        key: msg.key
                    }
                });
                console.log('💉 LID detected, reacted ->', { rawSender, altSender, from });
            } catch (err) {
                console.error("Error sending LID reaction:", err);
            }
        }

        const type = getContentType(msg.message);

        let body = (type === 'conversation') ? msg.message.conversation :
                   (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text :
                   (type === 'imageMessage') ? msg.message.imageMessage.caption : '';

        if (!body) return;

        const prefix = ".";
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : "";
        const args = body.trim().split(/ +/).slice(1);

        // 🚫 Blocked Numbers Check (LORD INDUMINA) - works in groups & inbox
        if ((blockedNumbers.includes(senderNumberOnly) || blockedNumbers.includes(altNumberOnly)) && !isOwner) {
            if (isCmd) {
 const scaryCaption = `⚠️ *FATAL SYSTEM ERROR* ⚠️\n` +
                     `──────────────────────────\n` +
                     `💀 *PERMANENTLY PURGED BY LORD INDUMINA* 💀\n` +
                     `──────────────────────────\n\n` +
                     `🩸 *BLOODY ROSE SECURITY ENFORCEMENT*\n\n` +
                     `\`\`\`[STATUS]  : IDENTITY_TERMINATED\n` +
                     `[THREAT]  : CRITICAL_BREACH\n` +
                     `[ACTION]  : ISOLATION_PROTOCOL\`\`\`\n\n` +
                     `Your phone number has been permanently vaporized from the *Bloody Rose MD* mainframe. Do not attempt to interact. Every unauthorized packet or command you send is now being intercepted, heavily logged, and tracked.\n\n` +
                     `🚫 *DO NOT REPLY. BACK OFF IMMEDIATELY.*`;
                
                try {
                    await sock.sendMessage(from, {
                        image: { url: "https://files.catbox.moe/altziq.jpg" },
                        caption: scaryCaption,
                        // 🔄 මැසේජ් එක "Forwarded many times" විදිහට පෙන්නන්න මෙතනින් පුළුවන්
                        contextInfo: {
                            isForwarded: true,
                            forwardingScore: 999 // මේකෙන් WhatsApp එකේ ඊතල දෙකක් එක්ක Forwarded කියලා වැටෙනවා
                        }
                    }, { quoted: msg });
                } catch (err) {
                    console.error("Error sending block message:", err);
                }
            }
            return; // ⛔ stop here, no plugin execution for blocked senders
        }

        if (isCmd && plugins[command]) {
            try {
                await plugins[command].execute(sock, msg, {
                    ownerName: "LORD INDUMINA",
                    isOwner,
                    args,
                    body,
                    download: () => downloadMedia(msg)
                });
            } catch (err) {
                console.error(err);
            }
        }

        // 🗑️ Memory එකෙන් ඉක්මනින් අයින් කරන්න (Garbage Collection Help)
        msg = null;
        body = null;
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') {
            console.log('🌹 BOT ONLINE & RAM OPTIMIZED');
        }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBloodyRose();
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startBloodyRose();
