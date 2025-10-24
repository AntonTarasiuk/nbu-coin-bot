import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { getNewCoins, getCoinDetails } from './scraper.js';
import fs from 'fs';
import express from 'express';
import fetch from 'node-fetch';

config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

// ===== Express server for Render/UptimeRobot =====
const app = express();
app.get('/', (req, res) => res.send('✅ Bot is running!'));
app.get('/ping', (req, res) => res.status(200).send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

setInterval(() => {
    fetch(`https://nbu-coin-bot.onrender.com/ping`).catch(() => {});
}, 5 * 60 * 1000);

// ===== Known coins =====
const KNOWN_COINS_FILE = './knownCoins.json';
let knownCoins = {};

if (fs.existsSync(KNOWN_COINS_FILE)) {
    try { knownCoins = JSON.parse(fs.readFileSync(KNOWN_COINS_FILE, 'utf-8')); }
    catch { knownCoins = {}; }
} else fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify({}, null, 2));

function saveKnownCoins() {
    fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify(knownCoins, null, 2));
}

async function sendTelegramMessage(message) {
    try {
        await bot.telegram.sendMessage(CHAT_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (err) {
        console.error('Telegram send error, retrying in 5s', err);
        setTimeout(() => sendTelegramMessage(message), 5000);
    }
}

// ===== Commands =====
bot.start((ctx) => ctx.reply('✅ Бот працює!'));

bot.command('all_coins', async (ctx) => {
    try {
        await ctx.reply('⏳ Отримую всі монети з сайту...');
        const coins = await getNewCoins();
        if (!coins.length) return ctx.reply('На сайті монет поки немає 😕');

        let coinsWithDetails = [];
        for (let i = 0; i < coins.length; i += 5) {
            const batch = coins.slice(i, i + 5);
            const batchDetails = await Promise.all(batch.map(async coin => ({
                ...coin,
                details: await getCoinDetails(coin.link)
            })));
            coinsWithDetails = coinsWithDetails.concat(batchDetails);
        }

        let message = '';
        coinsWithDetails.forEach(coin => {
            message += `<b>${coin.name}</b>\nЦіна: ${coin.price}\nСтатус: ${coin.status}`;
            if (coin.details["Матеріал"]) message += `\nМатеріал: ${coin.details["Матеріал"]}`;
            if (coin.details["Тираж"]) message += `\nТираж: ${coin.details["Тираж"]}`;
            message += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>\n\n`;
        });

        while (message.length) {
            await ctx.reply(message.slice(0, 4000), { parse_mode: 'HTML', disable_web_page_preview: true });
            message = message.slice(4000);
        }

    } catch (err) {
        console.error(err);
        ctx.reply('❌ Помилка при отриманні списку монет');
    }
});

// ===== Scheduled scraping (Mon-Sat 08:00-23:00, every 30min) =====
async function checkNewCoins() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sun
    if (day === 0 || hour < 8 || hour >= 23) return;

    console.log(`⏰ Check started at ${now.toLocaleString('uk-UA')}`);
    try {
        const coins = await getNewCoins();

        const newCoins = [];
        const statusChanges = [];

        for (const coin of coins) {
            const prev = knownCoins[coin.link];
            if (!prev) {
                newCoins.push(coin);
                knownCoins[coin.link] = { status: coin.status };
            } else if (prev.status !== coin.status) {
                statusChanges.push({ ...coin, oldStatus: prev.status });
                knownCoins[coin.link] = { status: coin.status };
            }
        }

        if (!newCoins.length && !statusChanges.length) {
            console.log('🔹 Немає нових монет або змін статусу');
            return;
        }

        saveKnownCoins();

        for (const coin of newCoins) {
            const details = await getCoinDetails(coin.link);
            let message = `<b>🆕 Нова монета!</b>\n<b>${coin.name}</b>\nЦіна: ${coin.price}\nСтатус: ${coin.status}`;
            if (details["Матеріал"]) message += `\nМатеріал: ${details["Матеріал"]}`;
            if (details["Тираж"]) message += `\nТираж: ${details["Тираж"]}`;
            message += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>`;
            await sendTelegramMessage(message);
        }

        for (const coin of statusChanges) {
            let message = `<b>🔔 Зміна статусу!</b>\n<b>${coin.name}</b>\nБуло: ${coin.oldStatus}\nСтало: ${coin.status}\nЦіна: ${coin.price}`;
            message += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>`;
            await sendTelegramMessage(message);
        }

    } catch (err) {
        console.error('Помилка при перевірці монет:', err);
    }
}

bot.command('test_check', async (ctx) => {
    await checkNewCoins();
    ctx.reply('✅ Перевірка нових монет завершена');
});

bot.launch({ dropPendingUpdates: true });
setInterval(checkNewCoins, 30 * 60 * 1000);
checkNewCoins();

bot.on('text', (ctx) => ctx.reply('Бот отримав твоє повідомлення'));
process.on('unhandledRejection', (err) => console.error('⚠️ Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('💥 Uncaught exception:', err));
