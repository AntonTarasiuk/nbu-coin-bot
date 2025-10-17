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
app.get('/ping', (req, res) => res.status(200).send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// ===== Файл відомих монет =====
const KNOWN_COINS_FILE = './knownCoins.json';
let knownCoins = new Set();

if (fs.existsSync(KNOWN_COINS_FILE)) {
    knownCoins = new Set(JSON.parse(fs.readFileSync(KNOWN_COINS_FILE, 'utf-8')));
} else {
    fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify([], null, 2));
}

// ===== Функція збереження =====
function saveKnownCoins() {
    fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify([...knownCoins], null, 2));
}

// ===== Відправка повідомлення з retry =====
async function sendTelegramMessage(message) {
    try {
        await bot.telegram.sendMessage(CHAT_ID, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    } catch (err) {
        console.error('Помилка відправки Telegram, пробуємо через 5 сек', err);
        setTimeout(() => sendTelegramMessage(message), 5000);
    }
}

// ===== Команди =====
bot.start((ctx) => ctx.reply('✅ Бот працює!'));

bot.command('all_coins', async (ctx) => {
    try {
        await ctx.reply('⏳ Отримую всі монети з сайту...');
        const coins = await getNewCoins();
        if (coins.length === 0) return ctx.reply('На сайті монет поки немає 😕');

        let coinsWithDetails = [];
        for (let i = 0; i < coins.length; i += 5) {
            const batch = coins.slice(i, i + 5);
            const batchDetails = await Promise.all(
                batch.map(async coin => ({
                    ...coin,
                    details: await getCoinDetails(coin.link)
                }))
            );
            coinsWithDetails = coinsWithDetails.concat(batchDetails);
        }

        let message = '';
        coinsWithDetails.forEach((coin) => {
            message += `<b>${coin.name}</b>\n`;
            message += `Ціна: ${coin.price}\n`;
            message += `Статус: ${coin.status}`; // новий рядок із статусом
            if (coin.details["Номінал"]) message += `\nНомінал: ${coin.details["Номінал"]}`;
            if (coin.details["Матеріал"]) message += `\nМатеріал: ${coin.details["Матеріал"]}`;
            if (coin.details["Тираж"]) message += `\nТираж: ${coin.details["Тираж"]}`;
            message += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>\n\n`;
        });

        while (message.length > 0) {
            await ctx.reply(message.slice(0, 4000), { parse_mode: 'HTML', disable_web_page_preview: true });
            message = message.slice(4000);
        }

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

        let coinsWithDetails = [];
        for (let i = 0; i < newCoins.length; i += 5) {
            const batch = newCoins.slice(i, i + 5);
            const batchDetails = await Promise.all(
                batch.map(async coin => ({
                    ...coin,
                    details: await getCoinDetails(coin.link)
                }))
            );
            coinsWithDetails = coinsWithDetails.concat(batchDetails);
        }

        for (const coin of coinsWithDetails) {
            knownCoins.add(coin.link);
            saveKnownCoins();

            let message = `<b>${coin.name}</b>\n`;
            message += `Ціна: ${coin.price}\n`;
            message += `Статус: ${coin.status}\n`; // статус наявності
            if (coin.details["Номінал"]) message += `Номінал: ${coin.details["Номінал"]}\n`;
            if (coin.details["Матеріал"]) message += `Матеріал: ${coin.details["Матеріал"]}\n`;
            if (coin.details["Тираж"]) message += `Тираж: ${coin.details["Тираж"]}\n`;
            message += `🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>`;

            await sendTelegramMessage(message);
        }

    } catch (err) {
        console.error("Помилка при перевірці монет:", err);
    }
}

// ===== Тестова команда =====
bot.command('test_check', async (ctx) => {
    await checkNewCoins();
    ctx.reply('✅ Перевірка нових монет завершена');
});

// ===== Запуск бота =====
bot.launch({ dropPendingUpdates: true });
setInterval(checkNewCoins, 10 * 60 * 1000); // кожні 10 хв
checkNewCoins();

bot.on('text', (ctx) => ctx.reply('Бот отримав твоє повідомлення'));
