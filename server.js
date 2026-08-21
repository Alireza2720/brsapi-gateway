const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const API_KEY = 'BbIG8Hx9jkUhG4vzVcqAKSsXZZDSw8Wb';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let usageStats = {
    date: getTodayDateString(),
    candlestick_count: 0
};

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function resetUsageIfNewDay() {
    const today = getTodayDateString();
    if (usageStats.date !== today) {
        usageStats = { date: today, candlestick_count: 0 };
    }
}

app.get('/api/candlestick', async (req, res) => {
    resetUsageIfNewDay();

    const { symbol, type = '1' } = req.query;
    if (!symbol) {
        return res.status(400).json({ error: 'پارامتر symbol الزامی است' });
    }

    if (usageStats.candlestick_count >= 10) {
        return res.status(429).json({ error: 'سهمیه روزانه Candlestick به پایان رسیده است.' });
    }

    try {
        const url = `https://Api.BrsApi.ir/Tsetmc/Candlestick.php?key=${API_KEY}&type=${type}&l18=${encodeURIComponent(symbol)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json, text/plain, */*' },
            timeout: 15000
        });

        usageStats.candlestick_count++;

        if (!response.ok) {
            return res.status(response.status).json({ error: `BrsApi با کد ${response.status} پاسخ داد` });
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        res.status(502).json({ error: 'خطا در ارتباط با BrsApi: ' + err.message });
    }
});

app.get('/api/usage', (req, res) => {
    resetUsageIfNewDay();
    res.json({
        date: usageStats.date,
        candlestick: `${usageStats.candlestick_count}/10`
    });
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', apiKeyConfigured: !!API_KEY });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
