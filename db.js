const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
let client;
let db;

async function connectDB() {
    if (db) return db;
    if (!uri) throw new Error('متغیر محیطی MONGO_URI تنظیم نشده است.');

    client = new MongoClient(uri);
    await client.connect();
    db = client.db('trading_bot');
    console.log('✅ اتصال به MongoDB برقرار شد.');

    await ensureIndexes(db);
    return db;
}

// ایجاد ایندکس‌های لازم، از جمله TTL برای پاک‌سازی خودکار داده‌های قدیمی
async function ensureIndexes(database) {
    const FORTY_FIVE_DAYS = 45 * 24 * 60 * 60; // بر حسب ثانیه

    // کندل‌های ۳۰ دقیقه‌ای: بعد از ۴۵ روز از زمان خودشون پاک می‌شوند
    await database.collection('candles_30m').createIndex(
        { time: 1 },
        { expireAfterSeconds: FORTY_FIVE_DAYS }
    );
    await database.collection('candles_30m').createIndex(
        { symbol: 1, time: 1 },
        { unique: true }
    );

    // کندل‌های یک ساعته
    await database.collection('candles_1h').createIndex(
        { time: 1 },
        { expireAfterSeconds: FORTY_FIVE_DAYS }
    );
    await database.collection('candles_1h').createIndex(
        { symbol: 1, time: 1 },
        { unique: true }
    );

    // نمونه‌های خام ۳ دقیقه‌ای (فقط برای ساخت کندل‌های بزرگتر لازمند، کوتاه‌مدت نگه داشته می‌شوند)
    await database.collection('raw_ticks').createIndex(
        { time: 1 },
        { expireAfterSeconds: 3 * 24 * 60 * 60 } // فقط ۳ روز کافیست
    );

    console.log('✅ ایندکس‌های دیتابیس بررسی/ساخته شدند.');
}

function getDB() {
    if (!db) throw new Error('دیتابیس هنوز متصل نشده است.');
    return db;
}

module.exports = { connectDB, getDB };
