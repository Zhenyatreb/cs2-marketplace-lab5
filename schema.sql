CREATE TABLE IF NOT EXISTS skins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    weapon_type VARCHAR(20) NOT NULL CHECK (weapon_type IN ('rifle', 'sniper', 'pistol')),
    quality VARCHAR(30) NOT NULL CHECK (quality IN ('Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred')),
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0 AND price <= 100000),
    float_value NUMERIC(6, 5) NOT NULL CHECK (float_value >= 0 AND float_value <= 1),
    image_path VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skins_name ON skins (name);
