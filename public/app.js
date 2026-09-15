// Application State
const appState = {
    config: {},
    cars: [],
    filteredCars: [],
    selectedCarForWhatsApp: null,
    currentDetailCar: null,
    activeDetailImageIdx: 0,
    quickTemplate: 'availability'
};

// HTML Escaping Utility for XSS Prevention
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    await fetchPublicData();
    setupUrlHashListener();
});

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'info') icon = 'fa-circle-info';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Fetch Showroom Public Data
async function fetchPublicData() {
    try {
        let res = null;
        try {
            res = await fetch('/api/public/data', { cache: 'no-store' });
        } catch (netErr) {
            // Network error or offline - will try static fallback
        }

        // If API route is not available, try static fallback
        if (!res || !res.ok) {
            try {
                res = await fetch('data/showroom.json', { cache: 'no-store' });
            } catch (fallbackErr) {
                // Secondary fallback
            }
        }

        let config = {};
        let cars = [];

        if (res && res.ok) {
            const data = await res.json();
            config = data.config || {};
            cars = data.cars || [];
        }

        appState.config = config;
        appState.cars = cars;
        appState.filteredCars = [...appState.cars];

        updateShowroomUI();
        applyFilters();
    } catch (err) {
        console.error('Data error:', err);
        showToast('Could not load showroom data.', 'error');
    }
}

// Format Currency in PKR with Lakh / Crore representation
function formatPKR(amount) {
    if (!amount || isNaN(amount)) return 'Price on Call';
    const num = Number(amount);
    const formatted = `PKR ${num.toLocaleString()}`;
    
    if (num >= 10000000) {
        const crores = (num / 10000000).toFixed(2);
        return `${formatted} (${crores} Crore)`;
    } else if (num >= 100000) {
        const lakhs = (num / 100000).toFixed(2);
        return `${formatted} (${lakhs} Lakh)`;
    }
    return formatted;
}

// Normalizer and formatter for Admin WhatsApp contact (Supports local e.g. 03238194402 & intl 923238194402)
function getAdminPhoneDetails(raw) {
    let clean = String(raw || appState.config?.whatsappNumber || '923238194402').replace(/[^0-9]/g, '');
    let display = '03238194402';

    if (clean.startsWith('03') && clean.length === 11) {
        display = clean;
        clean = '92' + clean.slice(1);
    } else if (clean.startsWith('923') && clean.length === 12) {
        display = '0' + clean.slice(2);
    } else if (clean.startsWith('3') && clean.length === 10) {
        display = '0' + clean;
        clean = '92' + clean;
    } else if (!clean) {
        clean = '923238194402';
        display = '03238194402';
    } else {
        display = clean;
    }

    let formattedLocal = display;
    if (display.startsWith('03') && display.length === 11) {
        formattedLocal = `${display.slice(0, 4)}-${display.slice(4)}`;
    }
    let formattedInt = clean.startsWith('92') ? `+92 ${clean.slice(2, 5)} ${clean.slice(5)}` : `+${clean}`;

    return {
        cleanNumber: clean,
        rawLocal: display,
        formattedLocal: formattedLocal,
        formattedInt: formattedInt
    };
}

// Update UI Branding & Header details
function updateShowroomUI() {
    const { showroomName, whatsappNumber, address, description } = appState.config;
    const phoneInfo = getAdminPhoneDetails(whatsappNumber || '923238194402');

    if (showroomName) {
        document.title = `${showroomName} — Luxury Automotive Showroom`;
        ['brandHeaderTitle', 'brandDrawerTitle', 'footerBrand'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = showroomName;
        });
    }

    if (description) {
        const descEl = document.getElementById('heroDescription');
        if (descEl) descEl.textContent = description;
    }

    if (address) {
        const addrEl = document.getElementById('showroomAddress');
        if (addrEl) addrEl.textContent = address;
    }

    const defaultMsg = encodeURIComponent(`Hello ${showroomName || 'Showroom'}, I am browsing your verified luxury inventory and would like to connect with the admin.`);
    const waLink = `https://wa.me/${phoneInfo.cleanNumber}?text=${defaultMsg}`;

    // Header Admin WA Link & Display
    const headerWa = document.getElementById('headerAdminWaLink');
    if (headerWa) headerWa.href = waLink;
    const headerPhone = document.getElementById('headerAdminPhone');
    if (headerPhone) headerPhone.textContent = phoneInfo.rawLocal;

    // Drawer Admin WA Link & Display
    const drawerWa = document.getElementById('drawerAdminWaLink');
    if (drawerWa) drawerWa.href = waLink;
    const drawerPhone = document.getElementById('drawerAdminPhone');
    if (drawerPhone) drawerPhone.textContent = phoneInfo.rawLocal;

    // Contact Card
    const contactPhone = document.getElementById('contactAdminPhone');
    if (contactPhone) contactPhone.textContent = phoneInfo.rawLocal;
    const footerBtn = document.getElementById('footerWhatsappBtn');
    if (footerBtn) footerBtn.href = waLink;

    // Footer WhatsApp Logo Link
    const footerWaLogo = document.getElementById('footerWaLogo');
    if (footerWaLogo) footerWaLogo.href = waLink;
    const footerAdminLink = document.getElementById('footerAdminLink');
    if (footerAdminLink) footerAdminLink.href = waLink;

    // Floating Button
    const floatingBtn = document.getElementById('floatingWhatsappBtn');
    if (floatingBtn) floatingBtn.href = waLink;

    // WhatsApp Inquiry Modal Subtitle
    const modalPhoneSub = document.getElementById('modalAdminPhoneSub');
    if (modalPhoneSub) modalPhoneSub.textContent = phoneInfo.rawLocal;
    const modalPhoneLink = document.getElementById('modalAdminPhoneSubLink');
    if (modalPhoneLink) modalPhoneLink.href = waLink;

    // Hero image from first available car if available
    if (appState.cars.length > 0 && appState.cars[0].images?.[0]) {
        const heroImg = document.getElementById('heroFeaturedImg');
        if (heroImg) heroImg.src = appState.cars[0].images[0];
    }
}

// Render Inventory Cards with XSS-safe interpolation
function renderCarGrid() {
    const container = document.getElementById('carGrid');
    if (!container) return;

    if (!appState.filteredCars.length) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1.5rem; background: var(--card-bg); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
                <i class="fa-solid fa-car-rear" style="font-size: 2.8rem; margin-bottom: 1rem; color: var(--accent-lime); opacity: 0.7;"></i>
                <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">No matching vehicles found</h3>
                <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto 1.5rem;">Try adjusting your keywords, increasing maximum price filter, or resetting vehicle status.</p>
                <button class="btn-primary btn-sm" onclick="clearFilters()"><i class="fa-solid fa-rotate-left"></i> Reset All Filters</button>
            </div>`;
        return;
    }

    const phoneInfo = getAdminPhoneDetails(appState.config?.whatsappNumber);

    container.innerHTML = appState.filteredCars.map(car => {
        const formattedPrice = formatPKR(car.cashPrice);
        const isSold = car.status === 'sold';
        const images = (car.images && car.images.length) ? car.images : ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80'];

        let statusText = '🟢 Available';
        if (car.status === 'pending') statusText = '🟠 In Progress';
        if (car.status === 'sold') statusText = '🔴 Sold';

        const safeId = escapeHTML(car.id);
        const safeName = escapeHTML(car.name);
        const safeYear = escapeHTML(car.year);
        const safeMileage = escapeHTML(car.mileage);
        const safeSpecs = escapeHTML(car.specs);
        const carWaMsg = encodeURIComponent(`Hello, I am inquiring about ${car.name} (${car.year}) listed for ${formattedPrice}.`);

        return `
            <article class="car-card" id="vehicle-${safeId}">
                <div class="card-image-wrapper">
                    ${images.map((img, idx) => `
                        <img src="${encodeURI(img)}" alt="${safeName}" class="car-slider-img ${idx === 0 ? 'active' : ''}" loading="lazy" onclick="openCarDetailModal('${safeId}')" style="cursor: pointer;">
                    `).join('')}
                    
                    ${images.length > 1 ? `
                        <button class="slider-nav slider-prev" aria-label="Previous image" onclick="slideImage(event, '${safeId}', -1)"><i class="fa-solid fa-chevron-left"></i></button>
                        <button class="slider-nav slider-next" aria-label="Next image" onclick="slideImage(event, '${safeId}', 1)"><i class="fa-solid fa-chevron-right"></i></button>
                    ` : ''}

                    <span class="status-badge badge-${escapeHTML(car.status)}">${statusText}</span>
                </div>

                <div class="card-details">
                    <h3 class="car-name" onclick="openCarDetailModal('${safeId}')" style="cursor: pointer;">${safeName} (${safeYear})</h3>
                    <p class="car-specs-text"><i class="fa-solid fa-gauge-high"></i> ${safeMileage} • ${safeSpecs}</p>

                    <div class="price-box" onclick="openCarDetailModal('${safeId}')" style="cursor: pointer;">
                        <span class="cash-price-label">Cash Price</span>
                        <div class="cash-price-val">${formattedPrice}</div>
                        ${car.installmentAvailable ? `<div class="installment-val"><i class="fa-solid fa-calendar-check"></i> Financing Available</div>` : ''}
                    </div>

                    <div class="card-admin-contact">
                        <a href="https://wa.me/${phoneInfo.cleanNumber}?text=${carWaMsg}" target="_blank" rel="noopener noreferrer" class="card-wa-link" title="WhatsApp ${phoneInfo.rawLocal}">
                            <i class="fa-brands fa-whatsapp text-lime"></i> <strong>${phoneInfo.rawLocal}</strong>
                        </a>
                    </div>

                    <div class="card-actions">
                        <!-- Direct WhatsApp Slide -->
                        <button class="btn-action btn-cash-action" ${isSold ? 'disabled' : ''} onclick="slideIntoWhatsApp('${safeId}', 'cash')" title="WhatsApp with ${phoneInfo.rawLocal}">
                            <i class="fa-brands fa-whatsapp"></i> ${isSold ? 'Sold Out' : 'WhatsApp Deal'}
                        </button>
                        
                        <!-- View Specs & Details Modal -->
                        <button class="btn-action btn-inst-action" onclick="openCarDetailModal('${safeId}')" title="View specifications">
                            <i class="fa-solid fa-circle-info"></i> Details
                        </button>

                        <!-- Share Vehicle Link -->
                        <button class="btn-share" onclick="shareCar('${safeId}')" title="Share Vehicle Link" aria-label="Share">
                            <i class="fa-solid fa-share-nodes"></i>
                        </button>
                    </div>
                </div>
            </article>`;
    }).join('');
}

// Slide images inside car card
function slideImage(e, carId, direction) {
    if (e) e.stopPropagation();
    const card = document.getElementById(`vehicle-${carId}`);
    if (!card) return;

    const slides = Array.from(card.querySelectorAll('.car-slider-img'));
    if (slides.length <= 1) return;

    const currentIndex = slides.findIndex(img => img.classList.contains('active'));
    slides[currentIndex].classList.remove('active');

    const nextIndex = (currentIndex + direction + slides.length) % slides.length;
    slides[nextIndex].classList.add('active');
}

// Search, Sort & Filter Logic
function applyFilters() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const status = document.getElementById('statusFilter')?.value || 'all';
    const maxPrice = parseFloat(document.getElementById('maxPriceInput')?.value);
    const installmentOnly = document.getElementById('installmentOnlyToggle')?.checked;
    const sortBy = document.getElementById('sortBySelect')?.value || 'featured';

    const hasFiltersActive = search || status !== 'all' || !isNaN(maxPrice) || installmentOnly || sortBy !== 'featured';
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !hasFiltersActive);

    let filtered = appState.cars.filter(car => {
        const matchesSearch = !search || 
            (car.name || '').toLowerCase().includes(search) || 
            (car.year || '').toString().includes(search) || 
            (car.specs || '').toLowerCase().includes(search) ||
            (car.mileage || '').toLowerCase().includes(search);
        
        const matchesStatus = status === 'all' || car.status === status;
        const matchesPrice = isNaN(maxPrice) || ((car.cashPrice || 0) <= maxPrice);
        const matchesInstallment = !installmentOnly || car.installmentAvailable;

        return matchesSearch && matchesStatus && matchesPrice && matchesInstallment;
    });

    if (sortBy === 'price-asc') {
        filtered.sort((a, b) => (a.cashPrice || 0) - (b.cashPrice || 0));
    } else if (sortBy === 'price-desc') {
        filtered.sort((a, b) => (b.cashPrice || 0) - (a.cashPrice || 0));
    } else if (sortBy === 'year-desc') {
        filtered.sort((a, b) => parseInt(b.year || 0) - parseInt(a.year || 0));
    }

    appState.filteredCars = filtered;

    const badge = document.getElementById('inventoryCountBadge');
    if (badge) {
        badge.textContent = `Showing ${filtered.length} of ${appState.cars.length} verified vehicle${appState.cars.length === 1 ? '' : 's'}`;
    }

    renderCarGrid();
}

function clearFilters() {
    const search = document.getElementById('searchInput');
    if (search) search.value = '';
    const status = document.getElementById('statusFilter');
    if (status) status.value = 'all';
    const maxPrice = document.getElementById('maxPriceInput');
    if (maxPrice) maxPrice.value = '';
    const instToggle = document.getElementById('installmentOnlyToggle');
    if (instToggle) instToggle.checked = false;
    const sortBy = document.getElementById('sortBySelect');
    if (sortBy) sortBy.value = 'featured';

    applyFilters();
    showToast('Filters reset to default.', 'info');
}

// Modal & Drawer Helpers
function openModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

function toggleDrawer(isOpen) {
    const drawer = document.getElementById('mobileDrawer');
    if (drawer) {
        if (typeof isOpen === 'boolean') {
            drawer.classList.toggle('open', isOpen);
        } else {
            drawer.classList.toggle('open');
        }
    }
}

// Direct 1-Click WhatsApp Slide
function slideIntoWhatsApp(carId, type = 'cash') {
    const car = appState.cars.find(c => c.id === carId);
    if (!car) return;

    const showroom = appState.config.showroomName || 'HUSSAIN Showroom';
    const phoneInfo = getAdminPhoneDetails(appState.config.whatsappNumber);

    const formattedPrice = formatPKR(car.cashPrice);
    const vehicleLink = `${window.location.origin}/#vehicle-${car.id}`;

    let msg = `Assalam-o-Alaikum Admin! I am interested in this vehicle from ${showroom}:\n\n` +
              `🚗 *${car.name} (${car.year})*\n` +
              `💰 Cash Price: ${formattedPrice}\n` +
              `📊 Status: ${car.status.toUpperCase()}\n` +
              `🛣️ Mileage: ${car.mileage}\n` +
              `⚙️ Specs: ${car.specs}\n`;

    if (type === 'installment' && car.installmentPlan) {
        msg += `💳 Financing Plan: ${car.installmentPlan}\n`;
    }

    msg += `🔗 Vehicle Link: ${vehicleLink}\n\n` +
           `Is this vehicle currently available for inspection and test drive?`;

    const waUrl = `https://wa.me/${phoneInfo.cleanNumber}?text=${encodeURIComponent(msg)}`;
    const win = window.open(waUrl, '_blank');
    if (!win) {
        window.location.href = waUrl;
    }
    showToast(`Connecting with Admin (${phoneInfo.formattedLocal}) on WhatsApp...`, 'success');
}

// Vehicle Detail Modal
function openCarDetailModal(carId) {
    const car = appState.cars.find(c => c.id === carId);
    if (!car) return;

    const phoneInfo = getAdminPhoneDetails(appState.config.whatsappNumber);
    appState.currentDetailCar = car;
    appState.activeDetailImageIdx = 0;

    const titleEl = document.getElementById('detailCarTitle');
    const subEl = document.getElementById('detailCarSub');
    const bodyEl = document.getElementById('detailModalBody');

    if (titleEl) titleEl.textContent = `${car.name} (${car.year})`;
    if (subEl) subEl.textContent = `${car.mileage} • Verified Inventory ID: ${car.id}`;

    const images = (car.images && car.images.length) ? car.images : ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80'];
    const isSold = car.status === 'sold';

    const safeId = escapeHTML(car.id);
    const safeName = escapeHTML(car.name);
    const safeYear = escapeHTML(car.year);
    const safeMileage = escapeHTML(car.mileage);
    const safeSpecs = escapeHTML(car.specs);

    bodyEl.innerHTML = `
        <div class="modal-admin-contact-strip">
            <a href="https://wa.me/${phoneInfo.cleanNumber}?text=${encodeURIComponent('Hello, I am interested in ' + car.name + ' (' + car.year + ')')}" target="_blank" rel="noopener noreferrer" class="modal-wa-link-strip" title="WhatsApp ${phoneInfo.rawLocal}">
                <i class="fa-brands fa-whatsapp"></i> <strong>${phoneInfo.rawLocal}</strong>
            </a>
        </div>

        <div class="detail-gallery-main">
            <img id="detailMainImg" src="${encodeURI(images[0])}" alt="${safeName}">
        </div>

        ${images.length > 1 ? `
            <div class="detail-thumbs-strip">
                ${images.map((img, idx) => `
                    <img src="${encodeURI(img)}" class="detail-thumb ${idx === 0 ? 'active' : ''}" onclick="selectDetailImage(${idx})" alt="Thumb ${idx + 1}">
                `).join('')}
            </div>
        ` : ''}

        <div class="detail-price-box">
            <div>
                <span class="cash-price-label">Verified Cash Price</span>
                <div class="detail-price-main">${formatPKR(car.cashPrice)}</div>
                <div class="detail-price-crore">${car.status === 'available' ? '🟢 Ready for immediate transfer & delivery' : (car.status === 'pending' ? '🟠 Sale agreement in progress' : '🔴 Vehicle Sold')}</div>
            </div>
            ${car.installmentAvailable ? `
                <div style="text-align: right;">
                    <span class="cash-price-label" style="color: #38bdf8;">Financing Option</span>
                    <div style="color: #38bdf8; font-weight: 700; font-size: 0.95rem;">${escapeHTML(car.installmentPlan || 'Customizable Down Payment')}</div>
                </div>
            ` : ''}
        </div>

        <div class="detail-specs-grid">
            <div class="spec-pill">
                <span class="spec-pill-label">Model Year</span>
                <span class="spec-pill-val">${safeYear}</span>
            </div>
            <div class="spec-pill">
                <span class="spec-pill-label">Odometer</span>
                <span class="spec-pill-val">${safeMileage}</span>
            </div>
            <div class="spec-pill">
                <span class="spec-pill-label">Inventory Status</span>
                <span class="spec-pill-val">${escapeHTML(car.status.toUpperCase())}</span>
            </div>
            <div class="spec-pill" style="grid-column: span 2;">
                <span class="spec-pill-label">Key Specifications & Extras</span>
                <span class="spec-pill-val">${safeSpecs}</span>
            </div>
        </div>

        <div class="detail-cta-row">
            <button class="btn-whatsapp-large" ${isSold ? 'disabled' : ''} onclick="slideIntoWhatsApp('${safeId}', 'cash')">
                <i class="fa-brands fa-whatsapp" style="font-size: 1.4rem;"></i> Slide to WhatsApp with All Details
            </button>
            <button class="btn-secondary" onclick="openWhatsAppModal('${safeId}', 'custom')">
                <i class="fa-solid fa-sliders"></i> Customize Inquiry
            </button>
            <button class="btn-secondary" onclick="shareCar('${safeId}')" title="Copy Share Link">
                <i class="fa-solid fa-share-nodes"></i> Share
            </button>
        </div>
    `;

    openModal('vehicleDetailModal');
}

function selectDetailImage(idx) {
    if (!appState.currentDetailCar) return;
    const images = appState.currentDetailCar.images || [];
    if (!images[idx]) return;

    appState.activeDetailImageIdx = idx;
    const mainImg = document.getElementById('detailMainImg');
    if (mainImg) mainImg.src = images[idx];

    document.querySelectorAll('.detail-thumb').forEach((t, i) => {
        t.classList.toggle('active', i === idx);
    });
}

// WhatsApp Customizer Modal
function openWhatsAppModal(carId, paymentType = 'cash') {
    const car = appState.cars.find(c => c.id === carId);
    if (!car) return;

    appState.selectedCarForWhatsApp = car;
    document.getElementById('modalCarId').value = carId;
    document.getElementById('modalPaymentType').value = paymentType;

    const summaryEl = document.getElementById('modalVehicleSummary');
    if (summaryEl) {
        const thumb = car.images?.[0] || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80';
        summaryEl.innerHTML = `
            <img src="${encodeURI(thumb)}" style="width: 70px; height: 50px; border-radius: 6px; object-fit: cover;" alt="${escapeHTML(car.name)}">
            <div>
                <strong style="display: block; font-size: 0.95rem;">${escapeHTML(car.name)} (${escapeHTML(car.year)})</strong>
                <span style="color: var(--accent-lime); font-weight: 700; font-size: 0.85rem;">${formatPKR(car.cashPrice)}</span>
            </div>
        `;
    }

    setQuickMessageTemplate('availability');
    openModal('whatsappModal');
}

function setQuickMessageTemplate(templateKey) {
    appState.quickTemplate = templateKey;
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(templateKey));
    });
    updateWhatsAppPreview();
}

function updateWhatsAppPreview() {
    const car = appState.selectedCarForWhatsApp;
    if (!car) return;

    const buyerName = document.getElementById('buyerNameInput')?.value.trim() || 'A Showroom Visitor';
    const buyerPhone = document.getElementById('buyerPhoneInput')?.value.trim();
    const showroom = appState.config.showroomName || 'HUSSAIN Showroom';
    const vehicleLink = `${window.location.origin}/#vehicle-${car.id}`;

    let topicLine = 'I would like to inquire about this vehicle.';
    if (appState.quickTemplate === 'availability') {
        topicLine = 'Is this vehicle still available for sale? When can I inspect it?';
    } else if (appState.quickTemplate === 'inspection') {
        topicLine = 'I would like to book an in-person vehicle inspection and test drive appointment.';
    } else if (appState.quickTemplate === 'price') {
        topicLine = 'What is your best final cash deal and transfer package for this car?';
    } else if (appState.quickTemplate === 'installment') {
        topicLine = car.installmentPlan ? `I am interested in your financing terms: ${car.installmentPlan}. Could you share down payment and monthly breakdown?` : 'Do you offer installment or financing arrangements for this vehicle?';
    }

    let msg = `Hello ${showroom},\n\n` +
              `I am interested in the *${car.name} (${car.year})*.\n` +
              `• Price: ${formatPKR(car.cashPrice)}\n` +
              `• Specs: ${car.specs}\n` +
              `• Mileage: ${car.mileage}\n` +
              `• Vehicle Link: ${vehicleLink}\n\n` +
              `${topicLine}\n\n` +
              `Buyer: ${buyerName}`;

    if (buyerPhone) msg += `\nPhone: ${buyerPhone}`;

    const previewEl = document.getElementById('whatsappMessagePreview');
    if (previewEl) previewEl.value = msg;

    const phoneInfo = getAdminPhoneDetails(appState.config.whatsappNumber);
    const sendBtn = document.getElementById('btnDirectSendWhatsApp');
    if (sendBtn) {
        sendBtn.href = `https://wa.me/${phoneInfo.cleanNumber}?text=${encodeURIComponent(msg)}`;
    }
}

function handleWhatsAppModalSubmit(e) {
    const phoneInfo = getAdminPhoneDetails(appState.config.whatsappNumber);
    const message = encodeURIComponent(document.getElementById('whatsappMessagePreview')?.value || '');
    const url = `https://wa.me/${phoneInfo.cleanNumber}?text=${message}`;
    window.open(url, '_blank');
    closeModal('whatsappModal');
    showToast(`Sliding to WhatsApp chat with Admin (${phoneInfo.formattedLocal})...`, 'success');
}

// Share Vehicle
function shareCar(carId) {
    const shareUrl = `${window.location.origin}/share/car/${carId}`;
    if (navigator.share) {
        navigator.share({
            title: appState.config.showroomName || 'Showroom Vehicle',
            text: 'Check out this luxury vehicle listing at HUSSAIN Showroom!',
            url: shareUrl
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast('Vehicle link copied to clipboard!', 'success');
        }).catch(() => {
            prompt('Copy vehicle direct link:', shareUrl);
        });
    }
}

// Deep linking from URL hash (e.g. /#vehicle-car-101)
function setupUrlHashListener() {
    function checkHash() {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#vehicle-')) {
            const carId = hash.replace('#vehicle-', '');
            const car = appState.cars.find(c => c.id === carId);
            if (car) {
                setTimeout(() => openCarDetailModal(car.id), 300);
            }
        }
    }
    window.addEventListener('hashchange', checkHash);
    checkHash();
}

// Business Hours Toggle
function toggleHours() {
    const box = document.getElementById('hoursBox');
    if (box) box.classList.toggle('open');
}

