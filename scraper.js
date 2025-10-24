import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const ZENSCRAPE_API_KEY = process.env.ZENSCRAPE_API_KEY;

// === Безпечний fetch з повторними спробами ===
async function safeFetch(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      console.warn(`⚠️ Fetch failed (attempt ${i + 1}): ${res.status}`);
    } catch (e) {
      console.warn(`⚠️ Network error (attempt ${i + 1}):`, e.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('❌ All fetch attempts failed');
}

// === Отримання списку монет ===
export async function getNewCoins() {
  const targetUrl = 'https://coins.bank.gov.ua/catalog.html';
  const apiUrl = `https://app.zenscrape.com/api/v1/get?url=${encodeURIComponent(targetUrl)}&apikey=${ZENSCRAPE_API_KEY}`;

  const res = await safeFetch(apiUrl, {
    headers: { 'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8' }
  });

  console.log('🔍 Response status:', res.status);
  const html = await res.text();

  if (!html.includes('product__name')) {
    console.error('⚠️ HTML не містить product__name! Можливо, блокування або пустий контент.');
    return [];
  }

  const $ = cheerio.load(html);
  const coins = [];

  $('.product__name').each((_, el) => {
    const container = $(el).closest('div.p_description');
    const nameEl = container.find('a.model_product');
    const name = nameEl.text().trim();
    const link = nameEl.attr('href');
    const price = container.find('span.new_price').text().trim();

    let status = 'Невідомо';
    const basketEl = container.find('span.main-basked-icon');
    if (basketEl.hasClass('add2cart')) status = 'В наявності';
    else if (basketEl.hasClass('gray')) status = 'Відсутній';

    if (name && link && price) coins.push({ name, price, link, status });
  });

  console.log(`✅ Знайдено ${coins.length} монет`);
  return coins;
}

// === Отримання деталей однієї монети ===
export async function getCoinDetails(coinLink) {
  const targetUrl = `https://coins.bank.gov.ua${coinLink}`;
  const apiUrl = `https://app.zenscrape.com/api/v1/get?url=${encodeURIComponent(targetUrl)}&apikey=${ZENSCRAPE_API_KEY}`;

  const res = await safeFetch(apiUrl, {
    headers: { 'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8' }
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  const params = $('.basked_product_bank p');
  return {
    'Тираж': params.eq(0).text().trim(),
    'Рік': params.eq(1).text().trim(),
    'Матеріал': params.eq(2).text().trim(),
  };
}
