/**
 * 🌹 BLOODY ROSE ANIME BOT 🌹
 * WhatsApp Bot using @whiskeysockets/baileys
 * Features: QR Login, Auto Plugin Loader, Auto Reconnect
 *
 * Setup:
 *   npm init -y
 *   npm install @whiskeysockets/baileys @hapi/boom pino qrcode-terminal
 *
 * Run:
 *   node index.js
 *
 * Plugins:
 *   Place your plugin .js files inside the "plugins" folder.
 *   Each plugin file must export an object like:
 *
 *   module.exports = {
 *     name: "ping",
 *     command: ["ping", "p"],       // trigger words (without prefix)
 *     description: "Bot ge speed eka check karanna",
 *     execute: async (sock, msg, args, from) => {
 *       await sock.sendMessage(from, { text: "🌹 Pong! Bloody Rose Anime Bot active." }, { quoted: msg });
 *     }
 *   };
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");

const BOT_NAME = "🌹 BLOODY ROSE ANIME BOT 🌹";
const PREFIX = "."; // command prefix - "." eka wenata oyata one gaanak dala ganna puluwan
const PLUGINS_DIR = path.join(__dirname, "plugins");

// ---------- PLUGIN LOADER ----------
let plugins = [];

function loadPlugins() {
  plugins = [];

  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    console.log(`📁 "plugins" folder ekak hadanna widihata hadalaa thiyenne. Plugin files ehata danna.`);
    return;
  }

  const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    try {
      const pluginPath = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(pluginPath)]; // fresh reload support
      const plugin = require(pluginPath);

      if (plugin && plugin.command && plugin.execute) {
        plugins.push(plugin);
        console.log(`✅ Plugin loaded: ${plugin.name || file}`);
      } else {
        console.log(`⚠️  Skipped invalid plugin: ${file} (missing "command" or "execute")`);
      }
    } catch (err) {
      console.log(`❌ Failed to load plugin ${file}:`, err.message);
    }
  }

  console.log(`🌹 Total plugins loaded: ${plugins.length}`);
}

// ---------- START BOT ----------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // api eka manually handle karanawa below
    logger: pino({ level: "silent" }),
    browser: ["Bloody Rose Anime Bot", "Chrome", "1.0.0"],
  });

  // ---- Connection updates (QR code + reconnect) ----
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Scan karanna QR code eka WhatsApp app eken (Linked Devices):\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log("⚠️ Connection closed.", shouldReconnect ? "Reconnecting..." : "Logged out.");

      if (shouldReconnect) {
        startBot();
      } else {
        console.log("❌ Session ended. auth_info folder eka delete karala apith QR scan karanna.");
      }
    } else if (connection === "open") {
      console.log(`\n${BOT_NAME}\n✅ Connected successfully! Bot eka dan online.\n`);
      loadPlugins();
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ---- Watch plugins folder for live changes (auto reload) ----
  fs.watch(PLUGINS_DIR, { persistent: true }, () => {
    console.log("🔄 Plugins folder eke change ekak hamba una... reloading plugins.");
    loadPlugins();
  });

  // ---- Message handler ----
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";

    if (!body) return;

    // Only respond to prefixed commands
    if (!body.startsWith(PREFIX)) return;

    const args = body.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // Built-in menu command
    if (cmd === "menu" || cmd === "help") {
      let menuText = `${BOT_NAME}\n\n📜 *Available Commands:*\n\n`;
      if (plugins.length === 0) {
        menuText += "Kisidu plugin ekak thawama load wela na. plugins folder eke .js files danna.";
      } else {
        for (const p of plugins) {
          menuText += `• ${PREFIX}${p.command[0]} - ${p.description || "No description"}\n`;
        }
      }
      await sock.sendMessage(from, { text: menuText }, { quoted: msg });
      return;
    }

    // Find matching plugin
    const plugin = plugins.find((p) => p.command.includes(cmd));

    if (plugin) {
      try {
        await plugin.execute(sock, msg, args, from);
      } catch (err) {
        console.log(`❌ Error running plugin "${plugin.name}":`, err.message);
        await sock.sendMessage(
          from,
          { text: `⚠️ "${cmd}" command eke error ekak una. Console eka check karanna.` },
          { quoted: msg }
        );
      }
    }
  });

  return sock;
}

startBot().catch((err) => {
  console.log("❌ Bot start karanna baa una:", err);
});
