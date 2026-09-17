// Application State
const appState = {
    config: {}
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

// Normalizer and formatter for Admin WhatsApp contact
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

// Fetch Showroom Public Data
async function fetchPublicData() {
    try {
        let res = null;
        try {
            res = await fetch('/api/public/data', { cache: 'no-store' });
        } catch (netErr) {
            // Static fallback
        }

        if (!res || !res.ok) {
            try {
                res = await fetch('data/showroom.json', { cache: 'no-store' });
            } catch (fallbackErr) {
                // Secondary fallback
            }
        }

        let config = {};
        if (res && res.ok) {
            const data = await res.json();
            config = data.config || {};
        }

        appState.config = config;
        updateShowroomUI();
    } catch (err) {
        console.error('Data error:', err);
    }
}

// Update UI Branding & Header details
function updateShowroomUI() {
    const { showroomName, whatsappNumber, address, description } = appState.config;
    const phoneInfo = getAdminPhoneDetails(whatsappNumber || '923238194402');

    if (showroomName) {
        document.title = `${showroomName} — Luxury Cars on Installments & Cash`;
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

    const defaultMsg = encodeURIComponent(`Hello ${showroomName || 'Showroom'}, I want to inquire about your vehicle services and installment plans for instant deals.`);
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
    const footerBtn = document.getElementById('footerWhatsappBtn');
    if (footerBtn) footerBtn.href = waLink;

    // Footer WhatsApp Logo Link
    const footerWaLogo = document.getElementById('footerWaLogo');
    if (footerWaLogo) footerWaLogo.href = waLink;

    // Floating Button
    const floatingBtn = document.getElementById('floatingWhatsappBtn');
    if (floatingBtn) floatingBtn.href = waLink;

    // Hero & Services Instant Deal CTA Buttons
    const heroDealBtn = document.getElementById('heroDealBtn');
    if (heroDealBtn) heroDealBtn.href = waLink;
    const servicesWaDealBtn = document.getElementById('servicesWaDealBtn');
    if (servicesWaDealBtn) servicesWaDealBtn.href = waLink;
    const servicesCallBtn = document.getElementById('servicesCallBtn');
    if (servicesCallBtn) {
        servicesCallBtn.href = `tel:${phoneInfo.rawLocal}`;
        servicesCallBtn.innerHTML = `<i class="fa-solid fa-phone"></i> Call: ${escapeHTML(phoneInfo.formattedLocal || phoneInfo.rawLocal)}`;
    }
}

// Modal & Drawer Helpers
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

// Business Hours Toggle
function toggleHours() {
    const box = document.getElementById('hoursBox');
    if (box) box.classList.toggle('open');
}
