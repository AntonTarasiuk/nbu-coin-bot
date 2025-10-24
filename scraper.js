// scraper.js
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';

const ZEN_API_KEY = process.env.ZEN_API_KEY;

// Якщо у твоєму середовищі є проблеми зі сертифікатами (Render раніше показував це),
// можна ввімкнути httpsAgent з rejectUnauthorized: false.
// Якщо все ок — agent не обов'язковий, але він не завадить.
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * safeFetch: робить запит до Zenscrape з повторними спробами.
 * Повертає текст відповіді (HTML).
 */
async function safeFetchTarget(targetUrl, retries = 3) {
  if (!ZEN_API_KEY) {
    throw new Error('ZEN_API_KEY is not set in environment');
  }

  // кодуємо цільовий url, щоб уникнути проблем із символами
  const encoded = encodeURIComponent(targetUrl);
  const apiUrl = `https://api.zenscrape.com/v1/get?apikey=${ZEN_API_KEY}&url=${encoded}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔁 Zenscrape request attempt ${attempt} -> ${targetUrl}`);
      const res = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          // Zenscrape виконає реальний браузерний запит до target URL
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8'
        },
        // додаємо агент для обходу можливих SSL проблем на хості
        agent: httpsAgent
      });

      console.log('🔍 Zenscrape response status:', res.status);

      // якщо 429 / 403 / 404 — лог і повтор
      if (!res.ok) {
        console.warn(`⚠️ Zenscrape returned status ${res.status} (attempt ${attempt})`);
        // якщо хотіти, можна додати спеціальну паузу для 429
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 3000)); // чекати трохи довше при rate limit
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
        continue;
      }

      const text = await res.text();
      return text;

    } catch (err) {
      console.warn(`⚠️ Network error (attempt ${attempt}):`, err.message || err);
      // пауза перед повтором
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  throw new Error('❌ All fetch attempts failed');
}

/**
 * getNewCoins: повертає масив монет { name, price, link, status }
 * - використовує лише 1 запит до Zenscrape (економія ліміту)
 */
export async function getNewCoins() {
  const target = 'https://coins.bank.gov.ua/catalog.html';

  const html = await safeFetchTarget(target);

  // швидка перевірка чи ми отримали реальний HTML зі сторінкою, а не сторінку-челендж
  if (!html || !html.includes('product__name')) {
    console.error('⚠️ HTML does not contain product__name — site may return challenge or unexpected content');
    // для дебагу в логи виведемо перші 800 символів (не більше)
    console.log('--- HTML preview ---');
    console.log(html ? html.slice(0, 800) : '(empty)');
    console.log('--- end preview ---');
    return [];
  }

  const $ = cheerio.load(html);
  const coins = [];

  // парсимо існуючі селектори на сайті
  $('.product__name').each((_, el) => {
    const container = $(el).closest('div.p_description');
    const nameEl = container.find('a.model_product');
    const name = nameEl.text().trim();
    const link = nameEl.attr('href');
    const price = container.find('span.new_price').text().trim();

    // статус наявності (приклад — залежить від розмітки)
    const basketEl = container.find('span.main-basked-icon');
    let status = 'Невідомо';
    if (basketEl.hasClass('add2cart')) status = 'В наявності';
    else if (basketEl.hasClass('gray') && (basketEl.attr('title') || '').includes('Вибачте товару немає')) status = 'Відсутній';

    if (name && link && price) {
      coins.push({
        name,
        price,
        link,   // зберігаємо відносний шлях — інші частини коду додають базу при потребі
        status
      });
    }
  });

  console.log(`✅ Знайдено ${coins.length} монет`);
  return coins;
}

/**
 * getCoinDetails: (опційно) отримує деталі однієї монети
 * Викликай тільки коли дуже потрібно — кожен виклик = 1 запит до Zenscrape.
 */
export async function getCoinDetails(coinLink) {
  if (!coinLink) return {};
  // coinLink може бути або '/item.html' або повний шлях. Робимо повний:
  const target = coinLink.startsWith('http') ? coinLink : `https://coins.bank.gov.ua${coinLink}`;

  const html = await safeFetchTarget(target);

  if (!html) return {};

  const $ = cheerio.load(html);
  const params = $('.basked_product_bank p');

  return {
    'Тираж': params.eq(0).text().trim() || '',
    'Рік': params.eq(1).text().trim() || '',
    'Матеріал': params.eq(2).text().trim() || ''
  };
}
