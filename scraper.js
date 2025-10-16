import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Список монет
export async function getNewCoins() {
    const url = 'https://coins.bank.gov.ua/catalog.html';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const coins = [];

    $('.product__name').each((i, el) => {
        const nameEl = $(el).find('a.model_product');
        const name = nameEl.text().trim();
        const link = nameEl.attr('href');
        const price = $(el).find('span.new_price').text().trim();

        if (name && link && price) {
            coins.push({ name, price, link });
        }
    });

    return coins;
}

// Деталі однієї монети
export async function getCoinDetails(coinLink) {
    const res = await fetch(`https://coins.bank.gov.ua${coinLink}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const details = {};
    const params = $('.basked_product_bank .product_bank_parameters p');
    details["Тираж"] = params.eq(0).text().trim();
    details["Рік"] = params.eq(1).text().trim();
    details["Матеріал"] = params.eq(2).text().trim();

    return details;
}
