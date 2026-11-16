require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { pool, initDatabase } = require("./database");

const app = express();
// Render знаходиться за одним довіреним reverse proxy.
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "15kb" }));

// Обмежуємо частоту API-запитів, щоб зменшити кількість випадкових/зловмисних запитів.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Забагато запитів. Спробуйте трохи пізніше." }
});
app.use("/api", apiLimiter);

const allowedWeapons = ["rifle", "sniper", "pistol"];
const allowedQualities = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

function safeKeyEqual(actual, expected) {
    if (!actual || !expected) return false;
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
    const expectedKey = process.env.ADMIN_KEY;
    const suppliedKey = req.get("x-admin-key") || "";

    if (!expectedKey || expectedKey.length < 16) {
        return res.status(503).json({ error: "Код адміністратора не налаштовано. Встановіть ADMIN_KEY довжиною від 16 символів." });
    }
    if (!safeKeyEqual(suppliedKey, expectedKey)) {
        return res.status(403).json({ error: "Неправильний код адміністратора." });
    }
    next();
}

function validateSkin(body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const weaponType = body.weapon_type;
    const quality = body.quality;
    const price = Number(body.price);
    const floatValue = Number(body.float_value);
    const imagePath = typeof body.image_path === "string" ? body.image_path.trim() : "";

    if (!name || name.length > 100) return "Назва товару має містити від 1 до 100 символів.";
    if (!allowedWeapons.includes(weaponType)) return "Оберіть правильний тип зброї.";
    if (!allowedQualities.includes(quality)) return "Оберіть правильний стан предмета.";
    if (!Number.isFinite(price) || price <= 0 || price > 100000) return "Ціна має бути від 0.01 до 100000.";
    if (!Number.isFinite(floatValue) || floatValue < 0 || floatValue > 1) return "Float Value має бути від 0 до 1.";
    if (!imagePath.startsWith("assets/") || imagePath.includes("..") || imagePath.includes("\\")) {
        return "Виберіть зображення з папки assets.";
    }

    const absoluteImagePath = path.resolve(PUBLIC_DIR, imagePath);
    const assetsDirectory = path.resolve(PUBLIC_DIR, "assets") + path.sep;
    if (!absoluteImagePath.startsWith(assetsDirectory) || !require("fs").existsSync(absoluteImagePath)) {
        return "Вибране зображення не знайдено.";
    }

    return {
        name,
        weapon_type: weaponType,
        quality,
        price,
        float_value: floatValue,
        image_path: imagePath
    };
}

// Перевірка доступності сервера та бази даних.
app.get("/api/health", async function (req, res) {
    try {
        await pool.query("SELECT 1");
        res.json({ status: "ok", database: "connected" });
    } catch (error) {
        console.error("Health check:", error.message);
        res.status(503).json({ status: "error", database: "unavailable" });
    }
});

// READ: отримати всі скіни.
app.get("/api/skins", async function (req, res, next) {
    try {
        const result = await pool.query("SELECT * FROM skins ORDER BY id ASC");
        res.json(result.rows);
    } catch (error) { next(error); }
});

// READ: отримати один скін за ID.
app.get("/api/skins/:id", async function (req, res, next) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Некоректний ID товару." });
    try {
        const result = await pool.query("SELECT * FROM skins WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Товар не знайдено." });
        res.json(result.rows[0]);
    } catch (error) { next(error); }
});

// CREATE: додати новий скін.
app.post("/api/skins", requireAdmin, async function (req, res, next) {
    const skin = validateSkin(req.body);
    if (typeof skin === "string") return res.status(400).json({ error: skin });
    try {
        const result = await pool.query(
            `INSERT INTO skins (name, weapon_type, quality, price, float_value, image_path)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [skin.name, skin.weapon_type, skin.quality, skin.price, skin.float_value, skin.image_path]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ error: "Товар із такою назвою вже існує." });
        next(error);
    }
});

// UPDATE: оновити дані товару.
app.put("/api/skins/:id", requireAdmin, async function (req, res, next) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Некоректний ID товару." });
    const skin = validateSkin(req.body);
    if (typeof skin === "string") return res.status(400).json({ error: skin });
    try {
        const result = await pool.query(
            `UPDATE skins
             SET name = $1, weapon_type = $2, quality = $3, price = $4,
                 float_value = $5, image_path = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 RETURNING *`,
            [skin.name, skin.weapon_type, skin.quality, skin.price, skin.float_value, skin.image_path, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "Товар не знайдено." });
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ error: "Товар із такою назвою вже існує." });
        next(error);
    }
});

// DELETE: видалити товар.
app.delete("/api/skins/:id", requireAdmin, async function (req, res, next) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Некоректний ID товару." });
    try {
        const result = await pool.query("DELETE FROM skins WHERE id = $1 RETURNING id", [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Товар не знайдено." });
        res.json({ message: "Товар видалено.", id: result.rows[0].id });
    } catch (error) { next(error); }
});

// Перевірка коду адміністратора для інтерфейсу керування.
app.get("/api/admin/check", requireAdmin, function (req, res) {
    res.json({ authorized: true });
});

// Віддаємо HTML, CSS, JS та зображення з папки public.
app.use(express.static(PUBLIC_DIR));
app.get("/", function (req, res) {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use("/api", function (req, res) {
    res.status(404).json({ error: "API-маршрут не знайдено." });
});

app.use(function (error, req, res, next) {
    console.error("Помилка сервера:", error.message);
    if (res.headersSent) return next(error);
    res.status(500).json({ error: "Внутрішня помилка сервера. Спробуйте пізніше." });
});

async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, "0.0.0.0", function () {
            console.log("CS2 Market запущено на порту " + PORT);
            console.log("API доступне за адресою /api/skins");
        });
    } catch (error) {
        console.error("Не вдалося запустити застосунок:", error.message);
        process.exit(1);
    }
}

startServer();
