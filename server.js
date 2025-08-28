const fs = require('fs');
const express = require('express');
const multer = require('multer');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const csv = require('csv-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Folders check
if (!fs.existsSync('./numbers')) fs.mkdirSync('./numbers');
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

// WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sessions' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    console.log('📱 Scan this QR code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
});

client.on('auth_failure', msg => {
    console.error('❌ Auth failure:', msg);
});

client.initialize();

// File Upload (multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './numbers');
    },
    filename: function (req, file, cb) {
        cb(null, 'uploaded.csv');
    }
});
const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
    res.send('🟢 WhatsApp Group Creator API is running.');
});

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('❌ File not uploaded.');
    }

    const numbers = [];

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
            if (row.number) {
                const phone = row.number.replace(/\D/g, '');
                if (phone.length >= 10) {
                    numbers.push(`91${phone}`);
                }
            }
        })
        .on('end', async () => {
            console.log(`📄 Total ${numbers.length} numbers found.`);

            try {
                const groupName = `Bulk Group ${Date.now()}`;
                const participants = numbers.map(num => `${num}@c.us`);
                const initialMembers = participants.slice(0, 10);

                const chat = await client.createGroup(groupName, initialMembers);
                console.log(`✅ Group "${groupName}" created.`);

                const chatId = chat.gid._serialized;
                const remaining = participants.slice(10);

                for (const userId of remaining) {
                    try {
                        await client.addParticipants(chatId, [userId]);
                        console.log(`✅ Added: ${userId}`);
                        await delay(1500);
                    } catch (e) {
                        console.error(`❌ Could not add ${userId}:`, e.message);
                    }
                }

                res.status(200).send(`✅ Group "${groupName}" created with ${numbers.length} members.`);
            } catch (e) {
                console.error('❌ Group creation failed:', e.message);
                res.status(500).send('❌ Group creation failed.');
            }
        });
});

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
