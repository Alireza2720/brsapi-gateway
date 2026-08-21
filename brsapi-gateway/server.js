const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ==========================================================
// تنظیمات BrsApi
// ==========================================================
const API_KEY = 'BbIG8Hx9jkUhG4vzVcqAKSsXZZDSw8Wb';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ==========================================================
// سیستم ساده‌ی شمارش مصرف روزانه (در حافظه‌ی سرور)
// چون Render رایگان گاهی ری‌استارت میشه، این شمارنده تقریبی است
// نه یک منبع ۱۰۰٪ دقیق برای مانیتورینگ رسمی (که خودتون در پنل BrsApi دارید)
// ==========================================================
let usageStats = {
    date: getTodayDateString(),
    allsymbols_count: 0,
    history_count: 0
};

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function resetUsageIfNewDay() {
    const today = getTodayDateString();
    if (usageStats.date !== today) {
        usageStats = { date: today, allsymbols_count: 0, history_count: 0 };
        console.log('📅 شمارنده‌ی مصرف روزانه ریست شد.');
    }
}

// ==========================================================
// Endpoint: دریافت تاریخچه (سهمیه محدود: 10 در روز - با احتیاط مصرف شود)
// ==========================================================
app.get('/api/history', async (req, res) => {
    resetUsageIfNewDay();

    const { symbol, type = '0' } = req.query;
    if (!symbol) {
        return res.status(400).json({ error: 'پارامتر symbol الزامی است' });
    }

    if (usageStats.history_count >= 10) {
        return res.status(429).json({
            error: 'سهمیه‌ی روزانه‌ی History (۱۰ درخواست) به پایان رسیده است. فردا دوباره تلاش کنید.'
        });
    }

    try {
        const url = `https://Api.BrsApi.ir/Tsetmc/History.php?key=${API_KEY}&type=${type}&l18=${encodeURIComponent(symbol)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json, text/plain, */*' },
            timeout: 15000
        });

        usageStats.history_count++;
        console.log(`📊 History مصرف شد: ${usageStats.history_count}/10 (نماد: ${symbol})`);

        if (!response.ok) {
            return res.status(response.status).json({ error: `BrsApi با کد ${response.status} پاسخ داد` });
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('خطا در history:', err.message);
        res.status(502).json({ error: 'خطا در ارتباط با BrsApi: ' + err.message });
    }
});

// ==========================================================
// Endpoint: قیمت لحظه‌ای (سهمیه: 100 در روز)
// ==========================================================
app.get('/api/allsymbols', async (req, res) => {
    resetUsageIfNewDay();

    const { type = '1' } = req.query;

    if (usageStats.allsymbols_count >= 100) {
        return res.status(429).json({
            error: 'سهمیه‌ی روزانه‌ی AllSymbols (۱۰۰ درخواست) به پایان رسیده است.'
        });
    }

    try {
        const url = `https://Api.BrsApi.ir/Tsetmc/AllSymbols.php?key=${API_KEY}&type=${type}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json, text/plain, */*' },
            timeout: 15000
        });

        usageStats.allsymbols_count++;
        console.log(`📈 AllSymbols مصرف شد: ${usageStats.allsymbols_count}/100`);

        if (!response.ok) {
            return res.status(response.status).json({ error: `BrsApi با کد ${response.status} پاسخ داد` });
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('خطا در allsymbols:', err.message);
        res.status(502).json({ error: 'خطا در ارتباط با BrsApi: ' + err.message });
    }
});

// ==========================================================
// Endpoint: مشاهده‌ی وضعیت مصرف فعلی (برای دیباگ خودتان)
// ==========================================================
app.get('/api/usage', (req, res) => {
    resetUsageIfNewDay();
    res.json({
        date: usageStats.date,
        allsymbols: `${usageStats.allsymbols_count}/100`,
        history: `${usageStats.history_count}/10`
    });
});

// ==========================================================
// تست زنده بودن سرور
// ==========================================================
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'BrsApi Gateway در حال اجراست' });
});

app.listen(PORT, () => {
    console.log(`✅ سرور روی پورت ${PORT} اجرا شد`);
});