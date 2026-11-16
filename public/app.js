// Клиєнтська частина CS2 Market.
// Вона отримує товари із сервера через Fetch API.

document.addEventListener("DOMContentLoaded", function () {
    // 1. Мобільне меню.
    const menuButton = document.querySelector(".menu-toggle");
    const mainNavigation = document.querySelector(".site-header .nav");

    if (menuButton && mainNavigation) {
        menuButton.addEventListener("click", function () {
            mainNavigation.classList.toggle("nav-open");
            const isOpen = mainNavigation.classList.contains("nav-open");
            menuButton.setAttribute("aria-expanded", isOpen);
            menuButton.textContent = isOpen ? "✕ Закрити" : "☰ Меню";
        });
    }

    // Допоміжна функція для запитів до REST API.
    async function apiRequest(url, options = {}) {
        let response;
        try {
            response = await fetch(url, options);
        } catch (error) {
            throw new Error("Не вдалося зв'язатися із сервером. Перевірте підключення.");
        }

        const data = await response.json().catch(function () { return {}; });
        if (!response.ok) {
            throw new Error(data.error || "Сталася помилка під час запиту.");
        }
        return data;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (symbol) {
            const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
            return entities[symbol];
        });
    }

    function getAdminKey() {
        return sessionStorage.getItem("cs2MarketAdminKey") || "";
    }

    function showMessage(element, message, type) {
        if (!element) return;
        element.textContent = message;
        element.className = "form-message " + (type || "");
    }

    // 2. Завантаження каталогу з бази даних.
    const catalog = document.querySelector("#catalog-products");
    if (catalog) {
        const countElement = document.querySelector("#products-count");
        const statusElement = document.querySelector("#catalog-status");
        const filterForm = document.querySelector("#catalog-filter");
        const filterMessage = document.querySelector("#filter-message");
        let allSkins = [];

        function renderCatalog(skins) {
            if (skins.length === 0) {
                catalog.innerHTML = '<p class="empty-state">За вашим запитом нічого не знайдено.</p>';
                return;
            }

            const adminKeyExists = Boolean(getAdminKey());
            catalog.innerHTML = skins.map(function (skin) {
                const id = Number(skin.id);
                const name = escapeHTML(skin.name);
                const image = escapeHTML(skin.image_path);
                const quality = escapeHTML(skin.quality);
                const floatValue = Number(skin.float_value).toFixed(5);
                const price = Number(skin.price).toFixed(2);
                const weapon = escapeHTML(skin.weapon_type);

                return `
                    <article class="card" data-id="${id}" data-name="${name}" data-weapon="${weapon}" data-price="${price}" data-quality="${quality}">
                        <a class="product-image" href="product.html?id=${id}" aria-label="Переглянути ${name}">
                            <img src="${image}" alt="Зображення ${name}" loading="lazy">
                        </a>
                        <h3 class="product-name"><a href="product.html?id=${id}">${name}</a></h3>
                        <p class="muted">${quality} · Float ${floatValue}</p>
                        <span class="price">$${price}</span>
                        <div class="card-actions">
                            <a class="button button-small" href="product.html?id=${id}">Детальніше</a>
                        </div>
                        ${adminKeyExists ? `
                            <div class="admin-actions">
                                <button class="button button-secondary button-small" type="button" data-action="edit" data-id="${id}">Змінити ціну</button>
                                <button class="button button-secondary button-small" type="button" data-action="delete" data-id="${id}">Видалити</button>
                            </div>` : ""}
                    </article>`;
            }).join("");
        }

        function applyFilters() {
            const search = (document.querySelector("#search")?.value || "").toLowerCase().trim();
            const weapon = document.querySelector("#weapon")?.value || "all";
            const quality = document.querySelector("#quality")?.value || "all";
            const minText = document.querySelector("#min-price")?.value || "";
            const maxText = document.querySelector("#max-price")?.value || "";
            const min = minText === "" ? 0 : Number(minText);
            const max = maxText === "" ? Infinity : Number(maxText);

            if (minText !== "" && maxText !== "" && min > max) {
                showMessage(filterMessage, "Мінімальна ціна не може бути більшою за максимальну.", "error");
                return;
            }
            showMessage(filterMessage, "", "");

            const filtered = allSkins.filter(function (skin) {
                const matchesName = skin.name.toLowerCase().includes(search);
                const matchesWeapon = weapon === "all" || skin.weapon_type === weapon;
                const matchesQuality = quality === "all" || skin.quality === quality;
                const price = Number(skin.price);
                return matchesName && matchesWeapon && matchesQuality && price >= min && price <= max;
            });

            renderCatalog(filtered);
            if (countElement) countElement.textContent = "Знайдено: " + filtered.length;
        }

        async function loadCatalog() {
            try {
                allSkins = await apiRequest("/api/skins");
                if (statusElement) statusElement.remove();
                applyFilters();
            } catch (error) {
                catalog.innerHTML = '<p class="empty-state">' + escapeHTML(error.message) + '</p>';
                if (countElement) countElement.textContent = "Каталог недоступний";
            }
        }

        if (filterForm) {
            filterForm.addEventListener("input", applyFilters);
            filterForm.addEventListener("change", applyFilters);
            filterForm.addEventListener("submit", function (event) {
                event.preventDefault();
                applyFilters();
            });
            filterForm.addEventListener("reset", function () {
                setTimeout(applyFilters, 0);
            });
        }

        // Один обробник керує кнопками редагування й видалення всіх карток.
        catalog.addEventListener("click", async function (event) {
            const button = event.target.closest("button[data-action]");
            if (!button) return;

            const id = Number(button.dataset.id);
            const skin = allSkins.find(function (item) { return Number(item.id) === id; });
            if (!skin) return;

            const headers = { "Content-Type": "application/json", "x-admin-key": getAdminKey() };

            if (button.dataset.action === "edit") {
                const newPrice = prompt("Введіть нову ціну для " + skin.name, Number(skin.price).toFixed(2));
                if (newPrice === null) return;
                const price = Number(newPrice);
                if (!Number.isFinite(price) || price <= 0 || price > 100000) {
                    alert("Введіть ціну від 0.01 до 100000.");
                    return;
                }
                try {
                    await apiRequest("/api/skins/" + id, {
                        method: "PUT",
                        headers: headers,
                        body: JSON.stringify({ ...skin, price: price })
                    });
                    await loadCatalog();
                } catch (error) {
                    alert(error.message);
                }
            }

            if (button.dataset.action === "delete") {
                if (!confirm("Видалити " + skin.name + " з каталогу?")) return;
                try {
                    await apiRequest("/api/skins/" + id, { method: "DELETE", headers: headers });
                    await loadCatalog();
                } catch (error) {
                    alert(error.message);
                }
            }
        });

        loadCatalog();
    }

    // 3. Сторінка одного товару: отримуємо його за ID через GET-запит.
    const productDetails = document.querySelector("#product-details");
    if (productDetails) {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id || !/^\d+$/.test(id)) {
            productDetails.innerHTML = '<p class="empty-state">Не вказано номер товару. Поверніться до каталогу.</p>';
        } else {
            apiRequest("/api/skins/" + id)
                .then(function (skin) {
                    document.querySelector(".page-title").textContent = skin.name;
                    document.querySelector(".page-description").textContent = "Інформація про вибраний предмет.";
                    productDetails.innerHTML = `
                        <div class="detail-layout">
                            <div class="detail-image"><img src="${escapeHTML(skin.image_path)}" alt="${escapeHTML(skin.name)}"></div>
                            <section class="panel">
                                <h2>Інформація про предмет</h2>
                                <ul class="detail-list">
                                    <li><span class="muted">Назва</span><strong>${escapeHTML(skin.name)}</strong></li>
                                    <li><span class="muted">Тип зброї</span><strong>${escapeHTML(skin.weapon_type)}</strong></li>
                                    <li><span class="muted">Стан</span><strong>${escapeHTML(skin.quality)}</strong></li>
                                    <li><span class="muted">Float Value</span><strong>${Number(skin.float_value).toFixed(5)}</strong></li>
                                </ul>
                                <span class="price">$${Number(skin.price).toFixed(2)}</span>
                                <a class="button full-width" href="index.html">Повернутися до каталогу</a>
                            </section>
                        </div>`;
                })
                .catch(function (error) {
                    productDetails.innerHTML = '<p class="empty-state">' + escapeHTML(error.message) + '</p>';
                });
        }
    }

    // 4. Перевірка коду адміністратора та додавання нового товару.
    const adminLoginForm = document.querySelector("#admin-login-form");
    if (adminLoginForm) {
        const adminInput = document.querySelector("#admin-key");
        const adminMessage = document.querySelector("#admin-message");
        const addSkinForm = document.querySelector("#add-skin-form");
        const addSkinMessage = document.querySelector("#add-skin-message");

        adminLoginForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const key = adminInput.value.trim();
            if (!key) {
                showMessage(adminMessage, "Введіть код адміністратора.", "error");
                return;
            }
            try {
                await apiRequest("/api/admin/check", { headers: { "x-admin-key": key } });
                sessionStorage.setItem("cs2MarketAdminKey", key);
                showMessage(adminMessage, "Режим керування увімкнено.", "success");
                addSkinForm.hidden = false;
            } catch (error) {
                sessionStorage.removeItem("cs2MarketAdminKey");
                addSkinForm.hidden = true;
                showMessage(adminMessage, error.message, "error");
            }
        });

        if (getAdminKey()) {
            apiRequest("/api/admin/check", { headers: { "x-admin-key": getAdminKey() } })
                .then(function () {
                    addSkinForm.hidden = false;
                    showMessage(adminMessage, "Режим керування увімкнено для цієї вкладки.", "success");
                })
                .catch(function () {
                    sessionStorage.removeItem("cs2MarketAdminKey");
                });
        }

        addSkinForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const newSkin = {
                name: document.querySelector("#skin-name").value.trim(),
                weapon_type: document.querySelector("#skin-weapon").value,
                price: Number(document.querySelector("#skin-price").value),
                quality: document.querySelector("#skin-quality").value,
                float_value: Number(document.querySelector("#skin-float").value),
                image_path: document.querySelector("#skin-image").value
            };

            try {
                await apiRequest("/api/skins", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-admin-key": getAdminKey() },
                    body: JSON.stringify(newSkin)
                });
                showMessage(addSkinMessage, "Товар успішно додано до каталогу.", "success");
                addSkinForm.reset();
            } catch (error) {
                showMessage(addSkinMessage, error.message, "error");
            }
        });
    }

    // 5. Демонстраційна перевірка форми поповнення з лабораторної № 4.
    const depositForm = document.querySelector("#deposit-form");
    if (depositForm) {
        const depositInput = document.querySelector("#deposit");
        const depositMessage = document.querySelector("#deposit-message");

        depositForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const rawValue = depositInput.value.trim();
            const amount = Number(rawValue);

            if (rawValue === "") {
                showMessage(depositMessage, "Помилка: введіть суму поповнення.", "error");
            } else if (!Number.isFinite(amount) || amount <= 0) {
                showMessage(depositMessage, "Помилка: сума повинна бути більшою за 0.", "error");
            } else if (amount > 1000) {
                showMessage(depositMessage, "Помилка: максимальна сума — 1000 $.", "error");
            } else {
                showMessage(depositMessage, "Демонстраційну заявку на $" + amount.toFixed(2) + " створено.", "success");
                depositForm.reset();
            }
        });
    }
});
