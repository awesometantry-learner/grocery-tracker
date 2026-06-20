// ================================================================
// DATABASE  (IndexedDB — data lives on your phone's browser)
// ================================================================
const DB = (() => {
  const NAME = 'GroceryTrackerDB';
  const VER  = 1;
  let db;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VER);

      req.onupgradeneeded = e => {
        const d = e.target.result;

        if (!d.objectStoreNames.contains('trips')) {
          const ts = d.createObjectStore('trips', { keyPath: 'id', autoIncrement: true });
          ts.createIndex('date', 'date');
        }

        if (!d.objectStoreNames.contains('items')) {
          const is = d.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
          is.createIndex('tripId', 'tripId');
          is.createIndex('name',   'name');
        }
      };

      req.onsuccess = e => { db = e.target.result; resolve(); };
      req.onerror   = ()  => reject(req.error);
    });
  }

  function store(name, mode) {
    return db.transaction(name, mode).objectStore(name);
  }

  function all(storeName) {
    return new Promise((res, rej) => {
      const req = store(storeName, 'readonly').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function addTrip(trip) {
    return new Promise((res, rej) => {
      const req = store('trips', 'readwrite').add({ ...trip, createdAt: Date.now() });
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function updateTrip(trip) {
    return new Promise((res, rej) => {
      const req = store('trips', 'readwrite').put(trip);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    });
  }

  async function getTrip(id) {
    return new Promise((res, rej) => {
      const req = store('trips', 'readonly').get(id);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function getAllTrips() {
    const trips = await all('trips');
    return trips.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  async function deleteTrip(id) {
    await clearItemsFor(id);
    return new Promise((res, rej) => {
      const req = store('trips', 'readwrite').delete(id);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    });
  }

  async function getItemsFor(tripId) {
    return new Promise((res, rej) => {
      const req = store('items', 'readonly').index('tripId').getAll(tripId);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function saveItems(tripId, items) {
    return new Promise((res, rej) => {
      if (!items.length) return res();
      const tx = db.transaction('items', 'readwrite');
      const s  = tx.objectStore('items');
      items.forEach(it => s.add({ ...it, tripId }));
      tx.oncomplete = () => res();
      tx.onerror    = () => rej(tx.error);
    });
  }

  async function clearItemsFor(tripId) {
    const items = await getItemsFor(tripId);
    return new Promise((res, rej) => {
      if (!items.length) return res();
      const tx = db.transaction('items', 'readwrite');
      const s  = tx.objectStore('items');
      items.forEach(it => s.delete(it.id));
      tx.oncomplete = () => res();
      tx.onerror    = () => rej(tx.error);
    });
  }

  async function searchItems(query) {
    const q    = query.toLowerCase().trim();
    const rows = await all('items');
    return rows.filter(it => it.name.includes(q));
  }

  async function allItemNames() {
    const rows = await all('items');
    return [...new Set(rows.map(r => r.displayName))].sort();
  }

  async function allStoreNames() {
    const trips = await all('trips');
    return [...new Set(trips.map(t => t.store).filter(Boolean))].sort();
  }

  return { open, addTrip, updateTrip, getTrip, getAllTrips, deleteTrip, getItemsFor, saveItems, clearItemsFor, searchItems, allItemNames, allStoreNames };
})();

// ================================================================
// HELPERS
// ================================================================
function fmt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function fmtRs(n) {
  if (n === null || n === undefined || n === '') return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function compressPhoto(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function toast(msg, ms = 2500) {
  document.querySelectorAll('.toast').forEach(el => el.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ================================================================
// STATE
// ================================================================
const S = {
  view:        'home',
  editId:      null,
  photo:       null,
  priceChart:  null,
};

// ================================================================
// NAVIGATION
// ================================================================
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));

  const titles = { home: 'Grocery Tracker', history: 'History', compare: 'Price Compare', trip: S.editId ? 'Edit Trip' : 'New Trip' };
  document.getElementById('headerTitle').textContent = titles[name] || 'Grocery Tracker';

  const back = document.getElementById('headerBack');
  const btn  = document.getElementById('headerBtn');

  if (name === 'trip') {
    back.style.display = 'flex';
    btn.textContent    = 'Cancel';
    btn.style.display  = 'block';
    back.onclick = btn.onclick = async () => { await loadHome(); showView('home'); };
  } else {
    back.style.display = 'none';
    btn.style.display  = 'none';
  }

  S.view = name;
}

// ================================================================
// HOME
// ================================================================
async function loadHome() {
  const trips = await DB.getAllTrips();
  const ym    = today().slice(0, 7);

  const monthTrips = trips.filter(t => t.date.startsWith(ym));
  const total      = monthTrips.reduce((s, t) => s + (parseFloat(t.total) || 0), 0);

  document.getElementById('monthTotal').textContent = fmtRs(total);
  document.getElementById('monthTrips').textContent = monthTrips.length;

  const box = document.getElementById('recentTrips');
  if (trips.length === 0) {
    box.innerHTML = `<div class="empty-state"><span class="empty-state-emoji">🛒</span>No trips yet — add your first one above!</div>`;
    return;
  }

  box.innerHTML = '';
  for (const t of trips.slice(0, 6)) box.appendChild(await tripCard(t));
}

async function tripCard(trip) {
  const items = await DB.getItemsFor(trip.id);
  const div   = document.createElement('div');
  div.className = 'trip-card';
  div.innerHTML = `
    ${trip.photo
      ? `<div class="trip-thumb"><img src="${trip.photo}" alt="receipt"></div>`
      : `<div class="trip-thumb">🛒</div>`}
    <div class="trip-info">
      <div class="trip-store">${trip.store || 'Grocery Shop'}</div>
      <div class="trip-date">${fmt(trip.date)}</div>
      <div class="trip-items-count">${items.length} item${items.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="trip-total">${fmtRs(trip.total)}</div>
  `;
  div.onclick = () => openModal(trip.id);
  return div;
}

// ================================================================
// ADD / EDIT TRIP
// ================================================================
async function startAddTrip(editId = null) {
  S.editId = editId;
  S.photo  = null;

  // Reset form
  document.getElementById('tripDate').value  = today();
  document.getElementById('tripStore').value = '';
  document.getElementById('tripTotal').value = '';
  document.getElementById('itemsList').innerHTML = '';
  setPhotoPreview(null);
  document.getElementById('scanBtn').style.display    = 'none';
  document.getElementById('scanStatus').style.display = 'none';
  updateItemsEmpty();

  // Populate autocomplete lists
  const stores = await DB.allStoreNames();
  document.getElementById('storeList').innerHTML = stores.map(s => `<option value="${s}">`).join('');

  const names = await DB.allItemNames();
  document.getElementById('itemSuggestions').innerHTML = names.map(n => `<option value="${n}">`).join('');

  if (editId) {
    const trip  = await DB.getTrip(editId);
    const items = await DB.getItemsFor(editId);

    document.getElementById('tripDate').value  = trip.date;
    document.getElementById('tripStore').value = trip.store  || '';
    document.getElementById('tripTotal').value = trip.total  || '';

    if (trip.photo) {
      S.photo = trip.photo;
      setPhotoPreview(trip.photo);
      document.getElementById('scanBtn').style.display = 'block';
    }
    items.forEach(it => addItemRow(it));
    updateItemsEmpty();
  }

  showView('trip');
}

function setPhotoPreview(src) {
  const preview = document.getElementById('photoPreview');
  const placeholder = document.getElementById('photoPlaceholder');
  const removeBtn = document.getElementById('removePhotoBtn');

  if (src) {
    preview.src          = src;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    removeBtn.style.display   = 'inline-flex';
  } else {
    preview.src          = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    removeBtn.style.display   = 'none';
  }
}

function updateItemsEmpty() {
  const rows = document.querySelectorAll('#itemsList .item-row');
  document.getElementById('itemsEmpty').style.display = rows.length ? 'none' : 'block';
}

function addItemRow(data = {}) {
  const tpl  = document.getElementById('itemTemplate').content.cloneNode(true);
  const row  = tpl.querySelector('.item-row');

  const nameInput  = row.querySelector('.item-name');
  const qtyInput   = row.querySelector('.item-qty');
  const unitSelect = row.querySelector('.item-unit');
  const priceInput = row.querySelector('.item-price');
  const removeBtn  = row.querySelector('.item-remove');

  if (data.displayName) nameInput.value  = data.displayName;
  if (data.quantity)    qtyInput.value   = data.quantity;
  if (data.unit)        unitSelect.value = data.unit;
  if (data.pricePerUnit) priceInput.value = data.pricePerUnit;

  removeBtn.onclick = () => { row.remove(); updateItemsEmpty(); };

  document.getElementById('itemsList').appendChild(row);
  updateItemsEmpty();
  nameInput.focus();
}

function collectItems() {
  return [...document.querySelectorAll('#itemsList .item-row')]
    .map(row => {
      const name  = row.querySelector('.item-name').value.trim();
      if (!name) return null;
      const qty   = parseFloat(row.querySelector('.item-qty').value)   || null;
      const unit  = row.querySelector('.item-unit').value;
      const price = parseFloat(row.querySelector('.item-price').value) || null;
      return {
        name:         name.toLowerCase(),
        displayName:  name,
        quantity:     qty,
        unit,
        pricePerUnit: price,
        totalPrice:   qty && price ? +(qty * price).toFixed(2) : price,
      };
    })
    .filter(Boolean);
}

async function submitTrip(e) {
  e.preventDefault();

  const date  = document.getElementById('tripDate').value;
  const store = document.getElementById('tripStore').value.trim();
  const total = parseFloat(document.getElementById('tripTotal').value) || null;
  const items = collectItems();

  if (!date) { toast('Please pick a date'); return; }

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    if (S.editId) {
      const existing = await DB.getTrip(S.editId);
      await DB.updateTrip({ ...existing, date, store, total, photo: S.photo });
      await DB.clearItemsFor(S.editId);
      await DB.saveItems(S.editId, items);
      toast('Trip updated ✓');
    } else {
      const id = await DB.addTrip({ date, store, total, photo: S.photo });
      await DB.saveItems(id, items);
      toast('Trip saved ✓');
    }

    S.editId = null;
    await loadHome();
    showView('home');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Trip';
  }
}

// ================================================================
// HISTORY
// ================================================================
async function loadHistory(q = '') {
  let trips = await DB.getAllTrips();

  if (q.trim()) {
    const lq = q.toLowerCase();
    trips = trips.filter(t =>
      (t.store || '').toLowerCase().includes(lq) ||
      (t.date  || '').includes(lq)
    );
  }

  const box = document.getElementById('historyList');

  if (!trips.length) {
    box.innerHTML = `<div class="empty-state"><span class="empty-state-emoji">🔍</span>${q ? 'No trips match your search.' : 'No trips recorded yet.'}</div>`;
    return;
  }

  // Group by month
  const groups = {};
  trips.forEach(t => {
    const key = t.date.slice(0, 7);
    (groups[key] = groups[key] || []).push(t);
  });

  box.innerHTML = '';
  for (const [key, list] of Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))) {
    const monthTotal = list.reduce((s, t) => s + (parseFloat(t.total) || 0), 0);
    const g = document.createElement('div');
    g.className = 'month-group';
    g.innerHTML = `<div class="month-label">${fmtMonth(key + '-01')} &nbsp;·&nbsp; ${fmtRs(monthTotal)}</div>`;
    for (const t of list) g.appendChild(await tripCard(t));
    box.appendChild(g);
  }
}

// ================================================================
// PRICE COMPARE
// ================================================================
async function loadCompare() {
  const names = await DB.allItemNames();
  const box   = document.getElementById('suggestedItems');
  document.getElementById('compareList').innerHTML = names.map(n => `<option value="${n}">`).join('');

  if (names.length) {
    box.innerHTML = names.slice(0, 10).map(n =>
      `<button class="chip" data-item="${n}">${n}</button>`
    ).join('');
  }
}

async function runCompare(query) {
  query = query.trim();
  if (!query) return;

  document.getElementById('compareSearch').value = query;

  const rows = await DB.searchItems(query);
  if (!rows.length) {
    document.getElementById('compareResult').style.display = 'none';
    document.getElementById('compareEmpty').innerHTML = `
      <div class="compare-hint">🔍</div>
      <p>No results for "<strong>${query}</strong>".<br>Add some shopping trips with this item to start tracking!</p>
    `;
    document.getElementById('compareEmpty').style.display = 'block';
    return;
  }

  // Attach date & store from parent trip
  const enriched = (await Promise.all(rows.map(async r => {
    const trip = await DB.getTrip(r.tripId);
    return trip ? { ...r, date: trip.date, store: trip.store } : null;
  }))).filter(r => r && r.pricePerUnit && r.date);

  if (!enriched.length) {
    document.getElementById('compareResult').style.display = 'none';
    document.getElementById('compareEmpty').innerHTML = `<div class="compare-hint">💡</div><p>Found the item but no unit price was recorded. Try adding the price per unit next time!</p>`;
    document.getElementById('compareEmpty').style.display = 'block';
    return;
  }

  enriched.sort((a, b) => a.date.localeCompare(b.date));

  document.getElementById('compareEmpty').style.display = 'none';
  document.getElementById('compareResult').style.display = 'block';

  // Chart
  const labels = enriched.map(r => fmt(r.date));
  const prices = enriched.map(r => r.pricePerUnit);
  const unit   = enriched[0].unit;

  if (S.priceChart) S.priceChart.destroy();

  S.priceChart = new Chart(document.getElementById('priceChart').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `₹ per ${unit}`,
        data: prices,
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.08)',
        pointBackgroundColor: '#16a34a',
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: `${query} — Price History`, font: { size: 14, weight: '700' }, color: '#111827' },
        tooltip: { callbacks: { label: ctx => ` ₹${ctx.parsed.y} / ${unit}` } }
      },
      scales: {
        y: { ticks: { callback: v => '₹' + v }, beginAtZero: false },
        x: { ticks: { maxRotation: 40, font: { size: 11 } } }
      }
    }
  });

  // Stats
  const min     = Math.min(...prices);
  const max     = Math.max(...prices);
  const avg     = prices.reduce((a, b) => a + b, 0) / prices.length;
  const first   = prices[0];
  const last    = prices[prices.length - 1];
  const pct     = (((last - first) / first) * 100).toFixed(1);
  const pctClass = pct > 0 ? 'price-up' : pct < 0 ? 'price-down' : 'price-same';
  const pctSign  = pct > 0 ? '+' : '';

  document.getElementById('compareSummary').innerHTML = `
    <div class="summary-card">
      <span class="val">${fmtRs(last)}</span>
      <span class="lbl">Latest</span>
    </div>
    <div class="summary-card">
      <span class="val">${fmtRs(avg.toFixed(2))}</span>
      <span class="lbl">Average</span>
    </div>
    <div class="summary-card">
      <span class="val ${pctClass}">${pctSign}${pct}%</span>
      <span class="lbl">Change</span>
    </div>
  `;

  const rows2 = [...enriched].reverse().map(r => `
    <tr>
      <td>${fmt(r.date)}</td>
      <td>${r.store || '—'}</td>
      <td class="price-cell">₹${r.pricePerUnit}/${r.unit}</td>
    </tr>
  `).join('');

  document.getElementById('compareTable').innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Store</th><th>Price</th></tr></thead>
      <tbody>${rows2}</tbody>
    </table>
  `;
}

// ================================================================
// MODAL (Trip Detail)
// ================================================================
async function openModal(tripId) {
  const trip  = await DB.getTrip(tripId);
  const items = await DB.getItemsFor(tripId);

  const photoHtml = trip.photo
    ? `<img src="${trip.photo}" class="modal-photo" alt="Receipt">`
    : '';

  const itemsHtml = items.length
    ? `<div class="modal-items-heading">Items Purchased</div>
       ${items.map(it => `
         <div class="modal-item-row">
           <div>
             <div class="modal-item-name">${it.displayName}</div>
             ${it.quantity ? `<div class="modal-item-qty">${it.quantity} ${it.unit}</div>` : ''}
           </div>
           <div class="modal-item-price">
             ${it.pricePerUnit ? `<div class="modal-item-unit-price">₹${it.pricePerUnit}/${it.unit}</div>` : ''}
             ${it.totalPrice   ? `<div class="modal-item-total-price">= ${fmtRs(it.totalPrice)}</div>` : ''}
           </div>
         </div>
       `).join('')}`
    : `<div class="empty-state" style="padding:14px 0 4px">No items recorded for this trip.</div>`;

  const totalHtml = trip.total
    ? `<div class="modal-total-box">
         <span class="modal-total-label">Total Bill</span>
         <span class="modal-total-value">${fmtRs(trip.total)}</span>
       </div>`
    : '';

  document.getElementById('modalBody').innerHTML = `
    ${photoHtml}
    <div class="modal-store">${trip.store || 'Grocery Shop'}</div>
    <div class="modal-date-store">${fmt(trip.date)}</div>
    ${totalHtml}
    ${itemsHtml}
    <div class="modal-actions">
      <button class="btn-secondary" id="modalEditBtn">✏️ Edit</button>
      <button class="btn-danger"    id="modalDeleteBtn">🗑️ Delete</button>
    </div>
  `;

  document.getElementById('modalEditBtn').onclick   = () => { closeModal(); startAddTrip(trip.id); };
  document.getElementById('modalDeleteBtn').onclick = () => confirmDelete(trip.id);

  document.getElementById('tripModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('tripModal').style.display = 'none';
}

async function confirmDelete(tripId) {
  if (!confirm('Delete this trip? All data for this trip will be lost.')) return;
  await DB.deleteTrip(tripId);
  closeModal();
  toast('Trip deleted');
  await loadHome();
}

// ================================================================
// SETTINGS  (API key stored in localStorage)
// ================================================================
function getApiKey() {
  return localStorage.getItem('anthropic_api_key') || '';
}

function setupSettings() {
  document.getElementById('settingsBtn').onclick = openSettings;
  document.getElementById('settingsClose').onclick = closeSettings;
  document.getElementById('settingsOverlay').onclick = closeSettings;
  document.getElementById('saveApiKeyBtn').onclick = () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key) { toast('Please paste your API key first'); return; }
    localStorage.setItem('anthropic_api_key', key);
    closeSettings();
    toast('API key saved ✓');
  };
}

function openSettings() {
  document.getElementById('apiKeyInput').value = getApiKey();
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

// ================================================================
// AI RECEIPT SCANNING
// ================================================================
async function scanReceipt() {
  const apiKey = getApiKey();
  if (!apiKey) {
    openSettings();
    toast('Add your API key first to enable scanning');
    return;
  }

  const scanBtn    = document.getElementById('scanBtn');
  const scanStatus = document.getElementById('scanStatus');

  scanBtn.disabled    = true;
  scanBtn.textContent = '⏳ Reading your receipt…';
  scanStatus.className    = 'scan-status scanning';
  scanStatus.textContent  = '✨ AI is reading your receipt — this takes about 10 seconds…';
  scanStatus.style.display = 'block';

  try {
    const base64 = S.photo.split(',')[1];
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
            },
            {
              type: 'text',
              text: `Look at this grocery receipt and extract all the information. Return ONLY a valid JSON object — no explanation, no markdown, just raw JSON — in this exact format:
{
  "store": "store name as written on receipt, or null",
  "date": "date in YYYY-MM-DD format, or null",
  "total": total bill amount as a number without currency symbol or null,
  "items": [
    {
      "name": "item name in plain English",
      "quantity": quantity as a number or null,
      "unit": one of kg/g/litre/ml/pcs/pack/dozen/bunch,
      "pricePerUnit": price per unit as a number or null
    }
  ]
}
Rules:
- All prices must be plain numbers (no ₹ or Rs symbols)
- For items sold by weight (e.g. Tomato 0.5kg @ ₹40/kg), set quantity=0.5, unit=kg, pricePerUnit=40
- For items sold as pieces (e.g. 2 soaps @ ₹30 each), set quantity=2, unit=pcs, pricePerUnit=30
- If you cannot read something clearly, use null
- Today's date context: ${today()}`
            }
          ]
        }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `Error ${res.status}`;
      if (res.status === 401) throw new Error('Invalid API key. Please check it in Settings.');
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data.content[0].text.trim();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not read the receipt clearly. Try a clearer photo.');
    const parsed = JSON.parse(jsonMatch[0]);

    // Fill in the form
    if (parsed.store) document.getElementById('tripStore').value = parsed.store;
    if (parsed.date)  document.getElementById('tripDate').value  = parsed.date;
    if (parsed.total) document.getElementById('tripTotal').value = parsed.total;

    document.getElementById('itemsList').innerHTML = '';
    if (parsed.items && parsed.items.length) {
      parsed.items.forEach(it => addItemRow({
        displayName:  it.name,
        quantity:     it.quantity,
        unit:         it.unit || 'pcs',
        pricePerUnit: it.pricePerUnit,
      }));
    }
    updateItemsEmpty();

    const count = parsed.items ? parsed.items.length : 0;
    scanStatus.className   = 'scan-status success';
    scanStatus.textContent = `✓ Found ${count} item${count !== 1 ? 's' : ''}! Check the details below and tap Save.`;

  } catch (err) {
    scanStatus.className   = 'scan-status error';
    scanStatus.textContent = '⚠️ ' + (err.message || 'Something went wrong. Try again.');
  } finally {
    scanBtn.disabled    = false;
    scanBtn.textContent = '✨ Scan Receipt with AI';
  }
}

// ================================================================
// PHOTO HANDLERS
// ================================================================
function setupPhoto() {
  const photoInput   = document.getElementById('photoInput');
  const galleryInput = document.getElementById('galleryInput');

  const handle = async file => {
    if (!file) return;
    const compressed = await compressPhoto(file);
    S.photo = compressed;
    setPhotoPreview(compressed);
    // Show scan button if API key is set
    document.getElementById('scanBtn').style.display = 'block';
    document.getElementById('scanStatus').style.display = 'none';
    document.getElementById('scanStatus').textContent = '';
  };

  document.getElementById('cameraBtn').onclick  = () => photoInput.click();
  document.getElementById('galleryBtn').onclick  = () => galleryInput.click();
  document.getElementById('photoArea').onclick   = e => {
    if (e.target.id !== 'removePhotoBtn' && !S.photo) galleryInput.click();
  };
  document.getElementById('removePhotoBtn').onclick = () => {
    S.photo = null;
    setPhotoPreview(null);
    photoInput.value   = '';
    galleryInput.value = '';
    document.getElementById('scanBtn').style.display    = 'none';
    document.getElementById('scanStatus').style.display = 'none';
  };

  document.getElementById('scanBtn').onclick = scanReceipt;

  photoInput.onchange   = e => handle(e.target.files[0]);
  galleryInput.onchange = e => handle(e.target.files[0]);
}

// ================================================================
// SERVICE WORKER (offline support)
// ================================================================
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ================================================================
// INIT
// ================================================================
async function init() {
  await DB.open();

  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.view;
      showView(v);
      if (v === 'home')    await loadHome();
      if (v === 'history') await loadHistory();
      if (v === 'compare') await loadCompare();
    });
  });

  // Add Trip CTA
  document.getElementById('addTripBtn').addEventListener('click', () => startAddTrip());

  // Trip form
  document.getElementById('tripForm').addEventListener('submit', submitTrip);

  // Add item button
  document.getElementById('addItemBtn').addEventListener('click', () => addItemRow());

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', closeModal);

  // History search
  document.getElementById('historySearch').addEventListener('input', e => loadHistory(e.target.value));

  // Compare
  document.getElementById('compareBtn').addEventListener('click', () => {
    runCompare(document.getElementById('compareSearch').value);
  });
  document.getElementById('compareSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') runCompare(e.target.value);
  });
  document.getElementById('suggestedItems').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) runCompare(chip.dataset.item);
  });

  // Photo
  setupPhoto();

  // Settings
  setupSettings();

  // SW
  registerSW();

  // Load home
  await loadHome();
}

document.addEventListener('DOMContentLoaded', init);
