(function () {
    'use strict';

    // ========== Configuration ==========
    const API_BASE = '/api'; // Vercel proxy -> Cloudflare Worker -> D1

    // ========== DOM Cache ==========
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        tabBtns: $$('.tab-btn'),
        roomForm: $('#room-form'),
        restaurantForm: $('#restaurant-form'),
        reportsForm: $('#reports-form'),
reportsTbody: $('#reports-tbody'),
reportsEmpty: $('#reports-empty'),
reportsRefreshBtn: $('#reports-refresh-btn'),
reportsSearch: $('#reports-search'),
statTotal: $('#stat-total'),
statRooms: $('#stat-rooms'),
statRest: $('#stat-rest'),
statConfirmed: $('#stat-confirmed'),
        bookingForm: $('#booking-form'),
        restaurantBookingForm: $('#restaurant-booking-form'),
        lookupBtn: $('#lookup-btn'),
        lookupEmail: $('#lookup-email'),
        bookingsList: $('#bookings-list'),
        toast: $('#toast'),
        toastContent: $('#toast-content')
    };

    // ========== Utilities ==========
    const Utils = {
        showToast(message, type = 'success') {
            const colors = {
                success: 'bg-emerald-600',
                error: 'bg-red-600',
                info: 'bg-blue-600'
            };
            els.toastContent.className = `rounded-lg shadow-lg p-4 text-white text-sm ${colors[type] || colors.success}`;
            els.toastContent.textContent = message;
            els.toast.classList.remove('translate-y-20', 'opacity-0');
            clearTimeout(Utils._toastTimer);
            Utils._toastTimer = setTimeout(() => {
                els.toast.classList.add('translate-y-20', 'opacity-0');
            }, 3500);
        },

        formatDate(iso) {
            if (!iso) return '';
            return new Date(iso).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        },

        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        setMinDates() {
            const today = new Date().toISOString().split('T')[0];
            ['#check-in', '#check-out', '#rest-date'].forEach(sel => {
                const el = $(sel);
                if (el) el.min = today;
            });
        }
    };

    // ========== API Layer ==========
    const API = {
        async request(endpoint, options = {}) {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
            return data;
        },

        createBooking(payload) {
            return API.request('/bookings', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        },

        getBookings(email) {
            return API.request(`/bookings?email=${encodeURIComponent(email)}`);
        },
        getAllBookings() {
    return API.request('/bookings');
}
    };

    // ========== Tab Controller ==========
    const Tabs = {
        init() {
            els.tabBtns.forEach(btn => {
                btn.addEventListener('click', () => Tabs.switch(btn.dataset.tab));
            });
        },
        switch(tab) {
    els.tabBtns.forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('bg-emerald-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('text-gray-600', !active);
        btn.classList.toggle('hover:bg-gray-100', !active);
    });
    els.roomForm.classList.toggle('hidden', tab !== 'room');
    els.restaurantForm.classList.toggle('hidden', tab !== 'restaurant');
    els.reportsForm.classList.toggle('hidden', tab !== 'reports');

    // Auto-load reports when the tab is opened
    if (tab === 'reports') Reports.load();
}
    };

    // ========== Form Handlers ==========
    const Forms = {
        validateDates(checkIn, checkOut) {
            if (new Date(checkOut) <= new Date(checkIn)) {
                throw new Error('Check-out must be after check-in');
            }
        },

        async submitRoomBooking(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Booking...';

            try {
                const checkIn = $('#check-in').value;
                const checkOut = $('#check-out').value;
                Forms.validateDates(checkIn, checkOut);

                const payload = {
                    type: 'room',
                    name: $('#guest-name').value.trim(),
                    email: $('#guest-email').value.trim(),
                    phone: $('#guest-phone').value.trim(),
                    roomType: $('#room-type').value,
                    checkIn,
                    checkOut,
                    guests: parseInt($('#num-guests').value, 10),
                    requests: $('#special-requests').value.trim()
                };

                const result = await API.createBooking(payload);
                Utils.showToast(`Booking confirmed! ID: ${result.id}`, 'success');
                e.target.reset();
                if (els.lookupEmail.value.trim()) Forms.lookup();
            } catch (err) {
                Utils.showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        },

        async submitRestaurantBooking(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Reserving...';

            try {
                const payload = {
                    type: 'restaurant',
                    name: $('#rest-name').value.trim(),
                    email: $('#rest-email').value.trim(),
                    phone: $('#rest-phone').value.trim(),
                    date: $('#rest-date').value,
                    time: $('#rest-time').value,
                    guests: parseInt($('#rest-guests').value, 10),
                    tablePreference: $('#table-pref').value,
                    requests: $('#rest-requests').value.trim()
                };

                const result = await API.createBooking(payload);
                Utils.showToast(`Table reserved! ID: ${result.id}`, 'success');
                e.target.reset();
                if (els.lookupEmail.value.trim()) Forms.lookup();
            } catch (err) {
                Utils.showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        },

        async lookup() {
            const email = els.lookupEmail.value.trim();
            if (!email) {
                Utils.showToast('Please enter an email', 'error');
                return;
            }
            els.bookingsList.innerHTML = `<div class="text-center text-gray-400 py-8 text-sm">Loading...</div>`;
            try {
                const data = await API.getBookings(email);
                Forms.renderBookings(data.bookings || []);
            } catch (err) {
                els.bookingsList.innerHTML = '';
                Utils.showToast(err.message, 'error');
            }
        },

        renderBookings(bookings) {
            if (!bookings.length) {
                els.bookingsList.innerHTML = `
                    <div class="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500 text-sm">
                        No bookings found for this email.
                    </div>`;
                return;
            }

            els.bookingsList.innerHTML = bookings.map(b => {
                const isRoom = b.type === 'room';
                const badge = isRoom
                    ? '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">Room</span>'
                    : '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Restaurant</span>';

                const details = isRoom
                    ? `
                        <p class="text-xs text-gray-600 mt-1">${Utils.escapeHtml(b.room_type || '')} · ${b.guests} guest(s)</p>
                        <p class="text-xs text-gray-600">${Utils.formatDate(b.check_in)} → ${Utils.formatDate(b.check_out)}</p>
                    `
                    : `
                        <p class="text-xs text-gray-600 mt-1">${Utils.formatDate(b.date)} at ${Utils.escapeHtml(b.time || '')}</p>
                        <p class="text-xs text-gray-600">${b.guests} guest(s) · ${Utils.escapeHtml(b.table_preference || 'any')}</p>
                    `;

                return `
                    <div class="bg-white rounded-lg shadow-sm p-4 border-l-4 ${isRoom ? 'border-emerald-500' : 'border-amber-500'}">
                        <div class="flex justify-between items-start gap-2">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    ${badge}
                                    <span class="text-xs text-gray-400">#${Utils.escapeHtml(b.id)}</span>
                                </div>
                                <p class="text-sm font-medium text-gray-800 mt-2">${Utils.escapeHtml(b.name)}</p>
                                ${details}
                                ${b.requests ? `<p class="text-xs text-gray-500 italic mt-1">"${Utils.escapeHtml(b.requests)}"</p>` : ''}
                            </div>
                            <span class="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-full font-medium whitespace-nowrap">
                                ${Utils.escapeHtml(b.status || 'pending')}
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        },

        init() {
            els.bookingForm.addEventListener('submit', Forms.submitRoomBooking);
            els.restaurantBookingForm.addEventListener('submit', Forms.submitRestaurantBooking);
            els.lookupBtn.addEventListener('click', Forms.lookup);
            els.lookupEmail.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') Forms.lookup();
            });

            // Auto-set checkout when checkin changes
            $('#check-in').addEventListener('change', (e) => {
                const co = $('#check-out');
                if (!co.value || co.value <= e.target.value) {
                    const d = new Date(e.target.value);
                    d.setDate(d.getDate() + 1);
                    co.value = d.toISOString().split('T')[0];
                }
                co.min = e.target.value;
            });
        }
    };
// ========== Reports Module ==========
const Reports = {
    all: [],
    filter: 'all',
    query: '',

    async load() {
        els.reportsTbody.innerHTML = `
            <tr><td colspan="8" class="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
        `;
        els.reportsEmpty.classList.add('hidden');

        try {
            const data = await API.getAllBookings();
            Reports.all = data.bookings || [];
            Reports.render();
        } catch (err) {
            els.reportsTbody.innerHTML = `
                <tr><td colspan="8" class="px-3 py-8 text-center text-red-500">${Utils.escapeHtml(err.message)}</td></tr>
            `;
        }
    },

    applyFilters(list) {
        return list.filter(b => {
            if (Reports.filter !== 'all' && b.type !== Reports.filter) return false;
            if (!Reports.query) return true;
            const q = Reports.query.toLowerCase();
            return (
                (b.name || '').toLowerCase().includes(q) ||
                (b.email || '').toLowerCase().includes(q) ||
                (b.id || '').toLowerCase().includes(q) ||
                (b.phone || '').toLowerCase().includes(q)
            );
        });
    },

    updateStats(list) {
        els.statTotal.textContent = list.length;
        els.statRooms.textContent = list.filter(b => b.type === 'room').length;
        els.statRest.textContent = list.filter(b => b.type === 'restaurant').length;
        els.statConfirmed.textContent = list.filter(b => (b.status || '').toLowerCase() === 'confirmed').length;
    },

    detailsCell(b) {
        if (b.type === 'room') {
            return `<div class="font-medium text-gray-800">${Utils.escapeHtml(b.room_type || '')}</div>
                    <div class="text-[10px] text-gray-500">${Utils.formatDate(b.check_in)} → ${Utils.formatDate(b.check_out)}</div>`;
        }
        return `<div class="font-medium text-gray-800">Table · ${Utils.escapeHtml(b.table_preference || 'any')}</div>
                <div class="text-[10px] text-gray-500">${Utils.formatDate(b.date)} at ${Utils.escapeHtml(b.time || '')}</div>`;
    },

    statusPill(status) {
        const s = (status || 'pending').toLowerCase();
        const map = {
            confirmed: 'bg-emerald-100 text-emerald-700',
            pending:   'bg-amber-100 text-amber-700',
            cancelled: 'bg-red-100 text-red-700'
        };
        const cls = map[s] || 'bg-gray-100 text-gray-700';
        return `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}">${Utils.escapeHtml(s)}</span>`;
    },

    render() {
        const filtered = Reports.applyFilters(Reports.all);
        Reports.updateStats(Reports.all);

        if (!filtered.length) {
            els.reportsTbody.innerHTML = '';
            els.reportsEmpty.classList.remove('hidden');
            return;
        }
        els.reportsEmpty.classList.add('hidden');

        els.reportsTbody.innerHTML = filtered.map(b => {
            const isRoom = b.type === 'room';
            const typeBadge = isRoom
                ? '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">Room</span>'
                : '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium">Restaurant</span>';

            return `
                <tr class="hover:bg-gray-50 transition">
                    <td class="px-3 py-2 text-[10px] font-mono text-gray-500 whitespace-nowrap">${Utils.escapeHtml(b.id)}</td>
                    <td class="px-3 py-2">${typeBadge}</td>
                    <td class="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">${Utils.escapeHtml(b.name)}</td>
                    <td class="px-3 py-2 text-gray-600 hidden sm:table-cell">${Utils.escapeHtml(b.email)}</td>
                    <td class="px-3 py-2 text-gray-600 hidden md:table-cell whitespace-nowrap">${Utils.escapeHtml(b.phone)}</td>
                    <td class="px-3 py-2">${Reports.detailsCell(b)}</td>
                    <td class="px-3 py-2 text-gray-700 hidden sm:table-cell text-center">${b.guests || 1}</td>
                    <td class="px-3 py-2">${Reports.statusPill(b.status)}</td>
                </tr>
            `;
        }).join('');
    },

    init() {
        els.reportsRefreshBtn.addEventListener('click', () => Reports.load());

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                Reports.filter = btn.dataset.filter;
                document.querySelectorAll('.filter-btn').forEach(b => {
                    const active = b.dataset.filter === Reports.filter;
                    b.classList.toggle('bg-emerald-600', active);
                    b.classList.toggle('text-white', active);
                    b.classList.toggle('bg-gray-100', !active);
                    b.classList.toggle('text-gray-700', !active);
                });
                Reports.render();
            });
        });

        // Search box
        els.reportsSearch.addEventListener('input', (e) => {
            Reports.query = e.target.value.trim();
            Reports.render();
        });
    }
};
    // ========== Bootstrap ==========
    function init() {
        Utils.setMinDates();
        Tabs.init();
        Forms.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
