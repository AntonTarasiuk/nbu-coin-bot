import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { getNewCoins, getCoinDetails } from './scraper.js';
import fs from 'fs';
import express from 'express';

config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

// ===== Express сервер для Render / UptimeRobot =====
const app = express();
app.get('/', (req, res) => res.send('✅ Bot is running!'));
app.get('/ping', (req, res) => res.status(200).send("OK"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// ===== Збереження відомих монет у файл =====
const KNOWN_COINS_FILE = './knownCoins.json';
let knownCoins = new Set();

if (fs.existsSync(KNOWN_COINS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(KNOWN_COINS_FILE, 'utf-8'));
    knownCoins = new Set(saved);
}

function saveKnownCoins() {
    fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify([...knownCoins], null, 2));
}

// ===== Формування повідомлення =====
function formatCoinMessage(coin) {
    let msg = `<b>${coin.name}</b>\nЦіна: ${coin.price}`;
    if (coin.details["Номінал"]) msg += `\nНомінал: ${coin.details["Номінал"]}`;
    if (coin.details["Матеріал"]) msg += `\nМатеріал: ${coin.details["Матеріал"]}`;
    if (coin.details["Тираж"]) msg += `\nТираж: ${coin.details["Тираж"]}`;
    msg += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>`;
    return msg;
}

// ===== Команди бота =====
bot.start((ctx) => ctx.reply('✅ Бот працює!'));

bot.command('all_coins', async (ctx) => {
    try {
        await ctx.reply('⏳ Отримую всі монети з сайту...');
        const coins = await getNewCoins();
        if (!coins.length) return ctx.reply('На сайті монет поки немає 😕');

        const coinsWithDetails = await Promise.all(
            coins.map(async coin => ({
                ...coin,
                details: await getCoinDetails(coin.link)
            }))
        );

        let message = '';
        coinsWithDetails.forEach(coin => { message += formatCoinMessage(coin) + '\n\n'; });

        const chunks = [];
        while (message.length > 0) { chunks.push(message.slice(0, 4000)); message = message.slice(4000); }
        for (const chunk of chunks) await ctx.reply(chunk, { parse_mode: 'HTML', disable_web_page_preview: true });

    } catch (err) {
        console.error(err);
        ctx.reply('❌ Помилка при отриманні списку монет');
    }
});

// ===== Перевірка нових монет =====
async function checkNewCoins() {
    try {
        const coins = await getNewCoins();
        const newCoins = coins.filter(c => !knownCoins.has(c.link));
        if (!newCoins.length) return;

        console.log(`${newCoins.length} нових монет знайдено`);

        const coinsWithDetails = await Promise.all(
            newCoins.map(async coin => ({ ...coin, details: await getCoinDetails(coin.link) }))
        );

        coinsWithDetails.forEach(coin => knownCoins.add(coin.link));
        saveKnownCoins();

        for (const coin of coinsWithDetails) {
            await bot.telegram.sendMessage(CHAT_ID, formatCoinMessage(coin), { parse_mode: 'HTML', disable_web_page_preview: true });
        }

    } catch (err) {
        console.error("Помилка при перевірці монет:", err);
    }
}

// ===== Запуск бота =====
bot.launch();
checkNewCoins();
setInterval(checkNewCoins, 10 * 60 * 1000); // кожні 10 хв
bot.on('text', (ctx) => ctx.reply('Бот отримав твоє повідомлення'));
