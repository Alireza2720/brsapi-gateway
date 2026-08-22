// ==========================================================
// strategies.js
// این فایل هم در Node.js (بک‌اند) و هم در مرورگر (فرانت‌اند) قابل استفاده است.
// شامل: محاسبات پایه (RSI, EMA, Heikin Ashi) + تعریف استراتژی‌ها
// ==========================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // محیط Node.js
        module.exports = factory();
    } else {
        // محیط مرورگر
        root.TradingStrategies = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // ------------------------------------------------------
    // محاسبات پایه
    // ------------------------------------------------------

    function calculateHeikinAshi(data) {
        const ha = [];
        for (let i = 0; i < data.length; i++) {
            const c = data[i];
            const haClose = (c.open + c.high + c.low + c.close) / 4;
            const haOpen = i === 0 ? (c.open + c.close) / 2 : (ha[i-1].open + ha[i-1].close) / 2;
            const haHigh = Math.max(c.high, haOpen, haClose);
            const haLow = Math.min(c.low, haOpen, haClose);
            ha.push({
                time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose,
                bullish: haClose > haOpen,
                hasLowerShadow: haLow < Math.min(haOpen, haClose) - 0.01,
                hasUpperShadow: haHigh > Math.max(haOpen, haClose) + 0.01
            });
        }
        return ha;
    }

    function calculateRSI(closes, period) {
        const rsi = new Array(closes.length).fill(null);
        if (closes.length <= period) return rsi;
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = closes[i] - closes[i-1];
            if (diff >= 0) gains += diff; else losses -= diff;
        }
        let avgGain = gains / period, avgLoss = losses / period;
        rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain/avgLoss));
        for (let i = period + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i-1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain/avgLoss));
        }
        return rsi;
    }

    function calculateEMA(closes, period) {
        const ema = new Array(closes.length).fill(null);
        if (closes.length < period) return ema;
        let sum = 0;
        for (let i = 0; i < period; i++) sum += closes[i];
        ema[period - 1] = sum / period;
        const k = 2 / (period + 1);
        for (let i = period; i < closes.length; i++) {
            ema[i] = closes[i] * k + ema[i-1] * (1 - k);
        }
        return ema;
    }

    // ------------------------------------------------------
    // استراتژی ۱: RSI50-2 (تایم‌فریم پیشنهادی: ۱ ساعته)
    // ------------------------------------------------------
    function runRSI50_2(rawData, params) {
        const rsiFastPeriod = params.rsiFastPeriod || 2;
        const rsiSlowPeriod = params.rsiSlowPeriod || 50;
        const noShadowFilter = !!params.noShadowFilter;

        const ha = calculateHeikinAshi(rawData);
        const closes = rawData.map(d => d.close);
        const rsiFast = calculateRSI(closes, rsiFastPeriod);
        const rsiSlow = calculateRSI(closes, rsiSlowPeriod);

        const signals = [];
        let position = null;
        const trades = [];

        for (let i = 1; i < rawData.length; i++) {
            if (rsiFast[i] === null || rsiSlow[i] === null) {
                signals.push({ time: rawData[i].time, indicators: { rsiFast: null, rsiSlow: null }, signalType: null, position });
                continue;
            }
            const fastAboveSlow = rsiFast[i] > rsiSlow[i];
            const fastBelowSlow = rsiFast[i] < rsiSlow[i];
            const candle = ha[i];

            let buyCondition = fastAboveSlow && candle.bullish;
            let sellCondition = fastBelowSlow && !candle.bullish;
            if (noShadowFilter) {
                buyCondition = buyCondition && !candle.hasLowerShadow;
                sellCondition = sellCondition && !candle.hasUpperShadow;
            }

            let signalType = null;
            if (position === null) {
                if (buyCondition) {
                    position = 'LONG'; signalType = 'BUY';
                    trades.push({ type:'خرید', entryDate: rawData[i].time, entryPrice: rawData[i].close, exitDate:null, exitPrice:null });
                } else if (sellCondition) {
                    position = 'SHORT'; signalType = 'SELL';
                    trades.push({ type:'فروش', entryDate: rawData[i].time, entryPrice: rawData[i].close, exitDate:null, exitPrice:null });
                }
            } else if (position === 'LONG' && fastBelowSlow) {
                position = null; signalType = 'EXIT_LONG';
                const lt = trades[trades.length-1];
                lt.exitDate = rawData[i].time; lt.exitPrice = rawData[i].close;
                lt.profit = (lt.exitPrice - lt.entryPrice) / lt.entryPrice * 100;
            } else if (position === 'SHORT' && fastAboveSlow) {
                position = null; signalType = 'EXIT_SHORT';
                const lt = trades[trades.length-1];
                lt.exitDate = rawData[i].time; lt.exitPrice = rawData[i].close;
                lt.profit = (lt.entryPrice - lt.exitPrice) / lt.entryPrice * 100;
            }

            signals.push({
                time: rawData[i].time,
                indicators: { rsiFast: rsiFast[i], rsiSlow: rsiSlow[i] },
                signalType, position
            });
        }
        return { ha, signals, trades };
    }

    // ------------------------------------------------------
    // استراتژی ۲: EMA 25/50/100 + Heikin Ashi (تایم‌فریم پیشنهادی: ۳۰ دقیقه)
    // ------------------------------------------------------
    function runEMA_HeikinAshi(rawData, params) {
        const emaFast = params.emaFast || 25;
        const emaMid = params.emaMid || 50;
        const emaSlow = params.emaSlow || 100;
        const noShadowFilter = !!params.noShadowFilter;

        const ha = calculateHeikinAshi(rawData);
        const closes = rawData.map(d => d.close);
        const ema25 = calculateEMA(closes, emaFast);
        const ema50 = calculateEMA(closes, emaMid);
        const ema100 = calculateEMA(closes, emaSlow);

        const signals = [];
        let position = null;
        const trades = [];

        for (let i = 0; i < rawData.length; i++) {
            if (ema25[i] === null || ema50[i] === null || ema100[i] === null) {
                signals.push({ time: rawData[i].time, indicators: { ema25: null, ema50: null, ema100: null }, signalType: null, position });
                continue;
            }
            const price = closes[i];
            const candle = ha[i];
            const aboveAll = price > ema25[i] && price > ema50[i] && price > ema100[i];
            const belowAll = price < ema25[i] && price < ema50[i] && price < ema100[i];

            let buyCondition = aboveAll && candle.bullish;
            let sellCondition = belowAll && !candle.bullish;
            if (noShadowFilter) {
                buyCondition = buyCondition && !candle.hasLowerShadow;
                sellCondition = sellCondition && !candle.hasUpperShadow;
            }

            // حد سود/خروج: قطع شدن قیمت با EMA25
            const crossedEma25Down = price < ema25[i];
            const crossedEma25Up = price > ema25[i];

            let signalType = null;
            if (position === null) {
                if (buyCondition) {
                    position = 'LONG'; signalType = 'BUY';
                    trades.push({ type:'خرید', entryDate: rawData[i].time, entryPrice: price, exitDate:null, exitPrice:null });
                } else if (sellCondition) {
                    position = 'SHORT'; signalType = 'SELL';
                    trades.push({ type:'فروش', entryDate: rawData[i].time, entryPrice: price, exitDate:null, exitPrice:null });
                }
            } else if (position === 'LONG' && crossedEma25Down) {
                position = null; signalType = 'EXIT_LONG';
                const lt = trades[trades.length-1];
                lt.exitDate = rawData[i].time; lt.exitPrice = price;
                lt.profit = (lt.exitPrice - lt.entryPrice) / lt.entryPrice * 100;
            } else if (position === 'SHORT' && crossedEma25Up) {
                position = null; signalType = 'EXIT_SHORT';
                const lt = trades[trades.length-1];
                lt.exitDate = rawData[i].time; lt.exitPrice = price;
                lt.profit = (lt.entryPrice - lt.exitPrice) / lt.entryPrice * 100;
            }

            signals.push({
                time: rawData[i].time,
                indicators: { ema25: ema25[i], ema50: ema50[i], ema100: ema100[i] },
                signalType, position
            });
        }
        return { ha, signals, trades };
    }

    // ------------------------------------------------------
    // رجیستری استراتژی‌ها (نقطه‌ی توسعه در آینده)
    // ------------------------------------------------------
    const STRATEGIES = {
        rsi50_2: {
            id: 'rsi50_2',
            name: 'RSI50-2',
            timeframe: '1h',
            defaultParams: { rsiFastPeriod: 2, rsiSlowPeriod: 50, noShadowFilter: false },
            run: runRSI50_2
        },
        ema_heikin: {
            id: 'ema_heikin',
            name: 'نوسان‌گیری EMA 25/50/100 (هیکن آشی)',
            timeframe: '30m',
            defaultParams: { emaFast: 25, emaMid: 50, emaSlow: 100, noShadowFilter: false },
            run: runEMA_HeikinAshi
        }
        // استراتژی HR بعداً اینجا اضافه می‌شود
    };

    return {
        calculateHeikinAshi,
        calculateRSI,
        calculateEMA,
        runRSI50_2,
        runEMA_HeikinAshi,
        STRATEGIES
    };
});
