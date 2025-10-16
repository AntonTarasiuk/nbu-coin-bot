import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { getNewCoins, getCoinDetails } from './scraper.js';
import fs from 'fs';

config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

// ==== Збереження відомих монет у файл ====
const KNOWN_COINS_FILE = './knownCoins.json';
let knownCoins = new Set();

// Завантаження відомих монет з файлу
if (fs.existsSync(KNOWN_COINS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(KNOWN_COINS_FILE, 'utf-8'));
    knownCoins = new Set(saved);
}

// Функція для оновлення файлу
function saveKnownCoins() {
    fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify([...knownCoins], null, 2));
}

// ===== Тестові команди =====
bot.start((ctx) => ctx.reply('✅ Бот працює!'));

// ===== Команда /all_coins =====
bot.command('all_coins', async (ctx) => {
    try {
        await ctx.reply('⏳ Отримую всі монети з сайту...');

        const coins = await getNewCoins();
        if (coins.length === 0) {
            ctx.reply('На сайті монет поки немає 😕');
            return;
        }

        // Batch-запити по 5 монет одночасно
        const batchSize = 5;
        let coinsWithDetails = [];

        for (let i = 0; i < coins.length; i += batchSize) {
            const batch = coins.slice(i, i + batchSize);
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
            message += `<b>${coin.name}</b>\nЦіна: ${coin.price}`;
            if (coin.details["Номінал"]) message += `\nНомінал: ${coin.details["Номінал"]}`;
            if (coin.details["Матеріал"]) message += `\nМатеріал: ${coin.details["Матеріал"]}`;
            if (coin.details["Тираж"]) message += `\nТираж: ${coin.details["Тираж"]}`;
            message += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>\n\n`;
        });

        // Розбиваємо на шматки по 4000 символів
        const chunks = [];
        while (message.length > 0) {
            chunks.push(message.slice(0, 4000));
            message = message.slice(4000);
        }

        for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: 'HTML', disable_web_page_preview: true });
        }

    } catch (err) {
        console.error(err);
        ctx.reply('❌ Помилка при отриманні списку монет');
    }
});

// ===== Автоматична перевірка нових монет =====
async function checkNewCoins() {
    try {
        const coins = await getNewCoins();
        const newCoins = coins.filter(c => !knownCoins.has(c.link)); // унікальність по link
        if (!newCoins.length) return;

        console.log(`${newCoins.length} нових монет знайдено`);

        // Batch-запити по 5 монет одночасно
        const batchSize = 5;
        let coinsWithDetails = [];

        for (let i = 0; i < newCoins.length; i += batchSize) {
            const batch = newCoins.slice(i, i + batchSize);
            const batchDetails = await Promise.all(
                batch.map(async coin => ({
                    ...coin,
                    details: await getCoinDetails(coin.link)
                }))
            );
            coinsWithDetails = coinsWithDetails.concat(batchDetails);
        }

        for (const coin of coinsWithDetails) {
            knownCoins.add(coin.link); // зберігаємо link для унікальності
            saveKnownCoins();          // зберігаємо у файл

            let message = `<b>${coin.name}</b>\nЦіна: ${coin.price}`;
            if (coin.details["Номінал"]) message += `\nНомінал: ${coin.details["Номінал"]}`;
            if (coin.details["Матеріал"]) message += `\nМатеріал: ${coin.details["Матеріал"]}`;
            if (coin.details["Тираж"]) message += `\nТираж: ${coin.details["Тираж"]}`;
            message += `\n🔗 <a href="https://coins.bank.gov.ua${coin.link}">Деталі</a>`;

            await bot.telegram.sendMessage(CHAT_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true });
        }

    } catch (err) {
        console.error("Помилка при перевірці монет:", err);
    }
}

// ===== Запуск бота =====
bot.launch();
setInterval(checkNewCoins, 10 * 60 * 1000); // кожні 10 хв
checkNewCoins(); // перевірка одразу при запуску

bot.on('text', (ctx) => ctx.reply('Бот отримав твоє повідомлення'));
