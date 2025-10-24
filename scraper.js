import fetch from "node-fetch";
import * as cheerio from "cheerio";

const ZENSCRAPE_API_KEY = process.env.ZENSCRAPE_API_KEY;

/**
 * Безпечний fetch із повторними спробами.
 * Підключається через Zenscrape API (1 запит = 1 перевірка).
 */
async function safeFetch(url, retries = 3) {
  const apiUrl = `https://app.zenscrape.com/api/v1/get?apikey=${ZENSCRAPE_API_KEY}&url=${encodeURIComponent(url)}`;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(apiUrl, { timeout: 20000 });
      if (res.ok) return await res.text();
      console.warn(`⚠️ Fetch failed (attempt ${i + 1}): ${res.status}`);
    } catch (err) {
      console.warn(`⚠️ Fetch error (attempt ${i + 1}): ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("❌ All fetch attempts failed");
}

/**
 * Отримує список монет з головної сторінки каталогу НБУ.
 * Повертає масив об’єктів: { title, link }
 */
export async function getNewCoins() {
  const url = "https://coins.bank.gov.ua/catalog.html";
  const html = await safeFetch(url);
  const $ = cheerio.load(html);

  const coins = [];

  $(".coin__title").each((_, el) => {
    const title = $(el).text().trim();
    const link = $(el).find("a").attr("href");
    if (title && link) {
      coins.push({
        title,
        link: "https://coins.bank.gov.ua" + link
      });
    }
  });

  console.log(`✅ Знайдено ${coins.length} монет`);
  return coins;
}
