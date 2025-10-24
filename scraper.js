import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const ZEN_API_KEY = process.env.ZEN_API_KEY;
const targetURL = 'https://coins.bank.gov.ua/catalog.html';

// === Safe fetch with retry ===
async function safeFetchTarget(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`🔁 Zenscrape request attempt ${i + 1} -> ${targetURL}`);
            const res = await fetch(url, options);
            console.log('🌐 Zenscrape response status:', res.status);

            if (res.ok) return res;
            console.warn(`⚠️ Zenscrape returned status ${res.status} (attempt ${i + 1})`);
        } catch (e) {
            console.warn(`⚠️ Network error (attempt ${i + 1}):`, e.message);
        }
        await new Promise(r => setTimeout(r, 2000)); // 2s wait
    }
    throw new Error('❌ All fetch attempts failed');
}

// === Get list of coins ===
export async function getNewCoins() {
    if (!ZEN_API_KEY) throw new Error('ZEN_API_KEY is not defined in environment');

    // ZenScrape URL with allow_insecure_ssl
    const url = `https://api.zenscrape.com/v1/get?apikey=${ZEN_API_KEY}&url=${encodeURIComponent(targetURL)}&allow_insecure_ssl=1`;

    const res = await safeFetchTarget(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
        }
    });

    const html = await res.text();

    if (!html.includes('product__name')) {
        console.error('⚠️ HTML не містить product__name! Можливо, блокування сайтом.');
        console.log(html.slice(0, 500));
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

// === Get details for one coin ===
export async function getCoinDetails(coinLink) {
    if (!ZEN_API_KEY) throw new Error('ZEN_API_KEY is not defined in environment');

    const url = `https://api.zenscrape.com/v1/get?apikey=${ZEN_API_KEY}&url=${encodeURIComponent(`https://coins.bank.gov.ua${coinLink}`)}&allow_insecure_ssl=1`;

    const res = await safeFetchTarget(url, {
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
