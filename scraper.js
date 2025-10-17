import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Отримуємо список монет з сайту
export async function getNewCoins() {
    const url = 'https://coins.bank.gov.ua/catalog.html';
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    return $('.product__name').map((i, el) => {
        const container = $(el).closest('div.p_description');
        const nameEl = container.find('a.model_product');
        const name = nameEl.text().trim();
        const link = nameEl.attr('href');
        const price = container.find('span.new_price').text().trim();
        return name && link && price ? { name, link, price } : null;
    }).get().filter(Boolean);
}

// Отримуємо деталі однієї монети
export async function getCoinDetails(coinLink) {
    const url = `https://coins.bank.gov.ua${coinLink}`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const params = $('.basked_product_bank p');
    return {
        "Номінал": params.eq(0).text().trim(),
        "Тираж": params.eq(1).text().trim(),
        "Рік": params.eq(2).text().trim(),
        "Матеріал": params.eq(3).text().trim()
    };
}
