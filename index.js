global.crypto = require('crypto');

// 🛠️ Undici ReferenceError: File is not defined Fix
if (!global.File) {
    try {
        global.File = require('buffer').File;
    } catch (e) {
        global.File = class {}; 
    }
}

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const logger = pino({ level: 'silent' });

async function startBloodyRose() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        printQRInTerminal: false, 
        logger: logger,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log(`\n====================================`);
            console.log(`QR LINK: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
            console.log(`====================================\n`);
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log('Bloody Rose Anime Bot Connected!');
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBloodyRose();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg || !msg.message) return; // ⚠️ msg.key.fromMe බ්ලොක් එක අයින් කළා (නැත්නම් තමන්ට ටෙස්ට් කරන්න බෑ)

        const from = msg.key.remoteJid;
        
        const rawSender = msg.key.participant || msg.key.remoteJid || '';
        const altSender = msg.key.participantPn || msg.key.participantAlt || msg.key.remoteJidAlt || '';

        const senderNumberOnly = rawSender.split(':')[0].split('@')[0];
        const altNumberOnly = altSender ? altSender.split(':')[0].split('@')[0] : '';

        // 👑 Owner සහ Self Check ලොජික් එක
        const ownerNumber = "94762912642";
        const isOwner = msg.key.fromMe || senderNumberOnly === ownerNumber || altNumberOnly === ownerNumber;

        // 💉 LID Auto-Reaction (බොට් විසින්ම දාන මැසේජ් වලට රිඇක්ට් වීම වැළැක්වීමට !msg.key.fromMe දැම්මා)
        const isLidSender = String(rawSender).includes(ownerNumber) || String(altSender).includes(ownerNumber);
        
        if (isLidSender && !msg.key.fromMe) {
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

        // කැප්ෂන් වලටත් වැඩ කරන්න ඔක්කොම ටෙක්ස්ට් ටයිප් ටික එකතු කලා
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || 
                     msg.message.videoMessage?.caption || '';

        const prefix = ".";
        const isCmd = text.startsWith(prefix);
        const command = isCmd ? text.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : "";
        const args = text.trim().split(/ +/).slice(1);

        if (fs.existsSync('./plugins')) {
            const pluginFiles = fs.readdirSync('./plugins').filter(file => file.endsWith('.js'));
            for (const file of pluginFiles) {
                try {
                    const plugin = require(path.join(__dirname, 'plugins', file));
                    
                    // 1. ප්ලගින් එක Function එකක් නම් (පැරණි ක්‍රමය)
                    if (typeof plugin === 'function') {
                        if (!msg.key.fromMe || isOwner) {
                            await plugin(sock, msg, from, text);
                        }
                    } 
                    // 2. ප්ලගින් එක Object එකක් නම් (ඔයාගේ අලුත් Cartoon කෝඩ් එක වගේ)
                    else if (plugin && typeof plugin.execute === 'function') {
                        if (isCmd && (plugin.name === command || (plugin.alias && plugin.alias.includes(command)))) {
                            await plugin.execute(sock, msg, { args, isCmd, body: text, from });
                        }
                    }
                } catch (err) {
                    console.error(`Error executing plugin ${file}:`, err);
                }
            }
        }
    });
}

startBloodyRose();
