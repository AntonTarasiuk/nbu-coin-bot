import { Telegraf } from "telegraf";
import { config } from "dotenv";
import { getNewCoins } from "./scraper.js";
import fs from "fs";
import express from "express";
import fetch from "node-fetch";

config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const CHAT_ID = process.env.CHAT_ID;

// ===== Express сервер для Render / UptimeRobot =====
const app = express();
app.get("/", (req, res) => res.send("✅ Bot is running!"));
app.get("/ping", (req, res) => res.status(200).send("OK"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// ===== Keep Render awake (раз на 5 хв) =====
setInterval(() => {
  fetch("https://nbu-coin-bot.onrender.com/ping").catch(() => {});
}, 5 * 60 * 1000);

// ===== Known coins (локальна база) =====
const KNOWN_COINS_FILE = "./knownCoins.json";
let knownCoins = {};

if (fs.existsSync(KNOWN_COINS_FILE)) {
  try {
    knownCoins = JSON.parse(fs.readFileSync(KNOWN_COINS_FILE, "utf-8"));
  } catch {
    knownCoins = {};
  }
} else {
  fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify({}, null, 2));
}

function saveKnownCoins() {
  fs.writeFileSync(KNOWN_COINS_FILE, JSON.stringify(knownCoins, null, 2));
}

// ===== Безпечне надсилання повідомлень у Telegram =====
async function sendTelegramMessage(message) {
  try {
    await bot.telegram.sendMessage(CHAT_ID, message, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });
  } catch (err) {
    console.error("Telegram send error:", err.message);
    setTimeout(() => sendTelegramMessage(message), 5000);
  }
}

// ===== Команди бота =====
bot.start((ctx) => ctx.reply("✅ Бот працює!"));

bot.command("all_coins", async (ctx) => {
  try {
    await ctx.reply("⏳ Отримую всі монети з сайту...");
    const coins = await getNewCoins();

    if (coins.length === 0) return ctx.reply("На сайті монет поки немає 😕");

    let message = coins.map(c => `• <a href="${c.link}">${c.title}</a>`).join("\n");
    await ctx.reply(message, { parse_mode: "HTML" });

  } catch (err) {
    console.error("❌ Помилка при отриманні монет:", err);
    ctx.reply("❌ Помилка при отриманні списку монет");
  }
});

// ===== Перевірка нових монет =====
async function checkNewCoins() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 - неділя, 1 - понеділок, ..., 6 - субота

  // Працюємо лише Пн–Сб (1–6) і з 8:00 до 23:00
  if (day === 0 || hour < 8 || hour >= 23) {
    console.log(`⏸ Пропуск перевірки (${now.toLocaleString("uk-UA")})`);
    return;
  }

  console.log(`⏰ Check started at ${now.toLocaleString("uk-UA")}`);

  try {
    const coins = await getNewCoins();
    const newCoins = [];

    for (const coin of coins) {
      if (!knownCoins[coin.link]) {
        newCoins.push(coin);
        knownCoins[coin.link] = true;
      }
    }

    if (newCoins.length === 0) {
      console.log("🔹 Нових монет немає");
      return;
    }

    saveKnownCoins();

    for (const coin of newCoins) {
      const message = `<b>🆕 Нова монета!</b>\n<a href="${coin.link}">${coin.title}</a>`;
      await sendTelegramMessage(message);
    }

  } catch (err) {
    console.error("Помилка при перевірці монет:", err);
  }
}

// ===== Розклад =====
async function scheduledScrape() {
  console.log("🕓 Запускаю планову перевірку монет...");
  await checkNewCoins();
}

// Перевірка кожні 30 хвилин
setInterval(scheduledScrape, 30 * 60 * 1000);
scheduledScrape();

// ===== Запуск бота =====
bot.launch({ dropPendingUpdates: true });
console.log("🤖 Бот запущено!");

// ===== Глобальні обробники помилок =====
process.on("unhandledRejection", (err) => {
  console.error("⚠️ Unhandled promise rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught exception:", err);
});
