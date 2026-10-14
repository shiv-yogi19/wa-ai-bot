const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { GoogleGenAI } = require('@google/genai');

// Koyeb Environment Variable se Gemini Key uthayega
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Console me QR code print hoga scan karne ke liye
        if (qr) {
            console.log('\n--- SCAN THIS QR CODE IN WHATSAPP ---\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp AI Bot successfully connected and active!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Incoming messages sunna aur reply karna
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        // Broadcast aur Status ignore karein
        if (sender.includes('@broadcast')) return;

        const incomingText = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!incomingText) return;

        try {
            // Gemini AI ko message bhejein
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: incomingText,
                config: {
                    systemInstruction: "You are a helpful, smart, and friendly WhatsApp AI Assistant."
                }
            });

            const replyText = response.text || "Sorry, I couldn't generate a response.";
            await sock.sendMessage(sender, { text: replyText });
        } catch (err) {
            console.error('Error generating AI reply:', err);
        }
    });
}

startBot();
