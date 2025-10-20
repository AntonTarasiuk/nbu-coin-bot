import { Telegraf, Markup } from 'telegraf';
import { config } from 'dotenv';
import { getNewCoins, getCoinDetails } from './scraper.js';
import fs from 'fs';
import express from 'express';

config();
console.log('DOTENV loaded, SCRAPER_API_KEY:', process.env.SCRAPER_API_KEY);

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

// ===== Inline-карусель =====
async function sendCoinsCarousel(ctx, coins) {
    for (let i = 0; i < coins.length; i += 5) {
        const batch = coins.slice(i, i + 5);
        let message = '';
        const buttons = [];

        for (const coin of batch) {
            message += `<b>${coin.name}</b>\nЦіна: ${coin.price}\nСтатус: ${coin.status}`;
            if (coin.details["Номінал"]) message += `\nНомінал: ${coin.details["Номінал"]}`;
            if (coin.details["Матеріал"]) message += `\nМатеріал: ${coin.details["Матеріал"]}`;
            if (coin.details["Тираж"]) message += `\nТираж: ${coin.details["Тираж"]}`;
            message += '\n\n';

            // Кожна кнопка на окремому рядку
            buttons.push([Markup.button.url('Перейти', `https://coins.bank.gov.ua${coin.link}`)]);
        }

        await ctx.reply(message.slice(0, 4000), {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: Markup.inlineKeyboard(buttons)
        });
    }
}

// ===== Головне меню =====
function mainMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('💰 Усі монети', 'all_coins')],
        [Markup.button.callback('🔄 Перевірити нові', 'check_new')],
        [Markup.button.url('🌐 Сайт НБУ', 'https://coins.bank.gov.ua')]
    ]);
}

// ===== Старт =====
bot.start((ctx) => ctx.reply('✅ Бот працює! Оберіть дію:', mainMenu()));

// ===== Callback-кнопки =====
bot.action('all_coins', async (ctx) => {
    await ctx.answerCbQuery();
    try {
        const coins = await getNewCoins();
        if (coins.length === 0) return ctx.reply('На сайті монет поки немає 😕');

        let coinsWithDetails = [];
        for (let i = 0; i < coins.length; i += 5) {
            const batch = coins.slice(i, i + 5);
            const batchDetails = await Promise.all(
                batch.map(async coin => ({ ...coin, details: await getCoinDetails(coin.link) }))
            );
            coinsWithDetails = coinsWithDetails.concat(batchDetails);
        }

        await sendCoinsCarousel(ctx, coinsWithDetails);

    } catch (err) {
        console.error(err);
        ctx.reply('❌ Помилка при отриманні списку монет');
    }
});

bot.action('check_new', async (ctx) => {
    await ctx.answerCbQuery();
    try {
        const coins = await getNewCoins();
        const newCoins = coins.filter(c => !knownCoins.has(c.link));
        if (!newCoins.length) return ctx.reply('Немає нових монет 😕');

        let coinsWithDetails = [];
        for (let i = 0; i < newCoins.length; i += 5) {
            const batch = newCoins.slice(i, i + 5);
            const batchDetails = await Promise.all(
                batch.map(async coin => ({ ...coin, details: await getCoinDetails(coin.link) }))
            );
            coinsWithDetails = coinsWithDetails.concat(batchDetails);
        }

        for (const coin of coinsWithDetails) {
            knownCoins.add(coin.link);
            saveKnownCoins();
        }

        await sendCoinsCarousel(ctx, coinsWithDetails);

    } catch (err) {
        console.error(err);
        ctx.reply('❌ Помилка при перевірці нових монет');
    }
});

// ===== Автоперевірка =====
async function checkNewCoins() {
    try {
        const coins = await getNewCoins();
        const newCoins = coins.filter(c => !knownCoins.has(c.link));
        if (!newCoins.length) return;

        let coinsWithDetails = [];
        for (let i = 0; i < newCoins.length; i += 5) {
            const batch = newCoins.slice(i, i + 5);
            const batchDetails = await Promise.all(
                batch.map(async coin => ({ ...coin, details: await getCoinDetails(coin.link) }))
            );
            coinsWithDetails = coinsWithDetails.concat(batchDetails);
        }

        for (const coin of coinsWithDetails) {
            knownCoins.add(coin.link);
            saveKnownCoins();

            let message = `<b>${coin.name}</b>\nЦіна: ${coin.price}\nСтатус: ${coin.status}`;
            if (coin.details["Номінал"]) message += `\nНомінал: ${coin.details["Номінал"]}`;
            if (coin.details["Матеріал"]) message += `\nМатеріал: ${coin.details["Матеріал"]}`;
            if (coin.details["Тираж"]) message += `\nТираж: ${coin.details["Тираж"]}`;
            message += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>`;

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

// ===== Запуск =====
bot.launch({ dropPendingUpdates: true });
setInterval(checkNewCoins, 10 * 60 * 1000);
checkNewCoins();

bot.on('text', (ctx) => ctx.reply('Бот отримав твоє повідомлення', mainMenu()));
