import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
// === Safe fetch with retry ===
async function safeFetch(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return res;
            console.warn(`⚠️ Fetch failed (attempt ${i + 1}): ${res.status}`);
        } catch (e) {
            console.warn(`⚠️ Network error (attempt ${i + 1}):`, e.message);
        }
        await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
    }
    throw new Error('❌ All fetch attempts failed');
}

// === Get list of coins ===
export async function getNewCoins() {
    const url = `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=https://coins.bank.gov.ua/catalog.html`;
 const res = await safeFetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
        }
    });

    console.log('🔍 Response status:', res.status);
    const html = await res.text();

    if (!html.includes('product__name')) {
        console.error('⚠️ HTML не містить product__name! Можливо, блокування сайтом.');
                return [];
    }

    const $ = cheerio.load(html);
    const coins = [];

    $('.product__name').each((i, el) => {
        const container = $(el).closest('div.p_description');
        const nameEl = container.find('a.model_product');
        const name = nameEl.text().trim();
        const link = nameEl.attr('href');
        const price = container.find('span.new_price').text().trim();

                // Status
        const basketEl = container.find('span.main-basked-icon');
        let status = 'Невідомо';
        if (basketEl.hasClass('add2cart')) {
            status = 'В наявності';
        } else if (basketEl.hasClass('gray') && (basketEl.attr('title') || '').includes('Вибачте товару немає')) {
            status = 'Відсутній';
        }

        if (name && link && price) {
            coins.push({ name, price, link, status });
        }
    });

    console.log(`✅ Знайдено ${coins.length} монет`);
    return coins;
}
export async function getCoinDetails(coinLink) {
    const url = `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=https://coins.bank.gov.ua${coinLink}`;
    const res = await safeFetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
        }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const details = {};
    const params = $('.basked_product_bank p');
    details["Тираж"] = params.eq(0).text().trim();
    details["Рік"] = params.eq(1).text().trim();
    details["Матеріал"] = params.eq(2).text().trim();

    return details;
}