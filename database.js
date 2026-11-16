const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error("Не задано DATABASE_URL. Створіть файл .env за прикладом .env.example.");
}

// Pool повторно використовує підключення до PostgreSQL.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on("error", function (error) {
    console.error("Помилка неактивного підключення до бази даних:", error.message);
});

const initialSkins = [
    { name: "AK-47 | Redline", weapon_type: "rifle", quality: "Field-Tested", price: 24.50, float_value: 0.25000, image_path: "assets/ak47-redline.jpeg" },
    { name: "AWP | Asiimov", weapon_type: "sniper", quality: "Field-Tested", price: 118.00, float_value: 0.27000, image_path: "assets/awp-asiimov.jpg" },
    { name: "M4A1-S | Printstream", weapon_type: "rifle", quality: "Factory New", price: 245.00, float_value: 0.02000, image_path: "assets/m4-printstream.webp" },
    { name: "USP-S | Cortex", weapon_type: "pistol", quality: "Minimal Wear", price: 8.40, float_value: 0.08000, image_path: "assets/usp-cortex.webp" },
    { name: "Glock-18 | Water Elemental", weapon_type: "pistol", quality: "Minimal Wear", price: 6.75, float_value: 0.10000, image_path: "assets/glock-water.jpg" },
    { name: "Desert Eagle | Mecha Industries", weapon_type: "pistol", quality: "Field-Tested", price: 12.80, float_value: 0.22000, image_path: "assets/deagle-mecha.jpg" }
];

async function initDatabase() {
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await pool.query(schema);

    const result = await pool.query("SELECT COUNT(*)::int AS count FROM skins");
    if (result.rows[0].count === 0) {
        for (const skin of initialSkins) {
            await pool.query(
                `INSERT INTO skins (name, weapon_type, quality, price, float_value, image_path)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [skin.name, skin.weapon_type, skin.quality, skin.price, skin.float_value, skin.image_path]
            );
        }
        console.log("Початкові товари додано до бази даних.");
    }
}

module.exports = { pool, initDatabase };
