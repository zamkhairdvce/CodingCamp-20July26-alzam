/* =========================================
   Expense & Budget Visualizer — app.js
   Features:
   - Add / Delete transactions
   - LocalStorage persistence
   - Chart.js Pie Chart (auto-update)
   - Sort transactions
   - Spending limit highlight
   - Dark / Light mode toggle
   - Custom categories
   ========================================= */

// ─── State ────────────────────────────────
let transactions = [];
let customCategories = [];
let spendingLimit = 0;
let currentSort = 'date-desc';
let spendingChart = null;

// ─── Category config ──────────────────────
const BUILT_IN_CATEGORIES = ['Food', 'Transport', 'Fun'];

const CATEGORY_ICONS = {
  Food: '🍔',
  Transport: '🚗',
  Fun: '🎉',
};

const CATEGORY_COLORS = {
  Food: '#f59e0b',
  Transport: '#3b82f6',
  Fun: '#ec4899',
};

const CUSTOM_COLOR_POOL = [
  '#10b981', '#8b5cf6', '#ef4444', '#06b6d4',
  '#f97316', '#84cc16', '#e11d48', '#0ea5e9',
];

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat] || '📦';
}

function getCategoryColor(cat) {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  // Deterministic color from pool for custom categories
  const idx = customCategories.indexOf(cat);
  return CUSTOM_COLOR_POOL[idx % CUSTOM_COLOR_POOL.length] || '#64748b';
}

function getCategoryTagClass(cat) {
  if (cat === 'Food') return 'tag-food';
  if (cat === 'Transport') return 'tag-transport';
  if (cat === 'Fun') return 'tag-fun';
  return 'tag-custom';
}

// ─── Format currency ──────────────────────
function formatRupiah(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

// ─── LocalStorage ─────────────────────────
function saveToStorage() {
  localStorage.setItem('bt_transactions', JSON.stringify(transactions));
  localStorage.setItem('bt_customCategories', JSON.stringify(customCategories));
  localStorage.setItem('bt_spendingLimit', spendingLimit.toString());
  localStorage.setItem('bt_theme', document.documentElement.getAttribute('data-theme') || 'light');
}

function loadFromStorage() {
  const tx = localStorage.getItem('bt_transactions');
  const cc = localStorage.getItem('bt_customCategories');
  const sl = localStorage.getItem('bt_spendingLimit');
  const theme = localStorage.getItem('bt_theme');

  transactions = tx ? JSON.parse(tx) : [];
  customCategories = cc ? JSON.parse(cc) : [];
  spendingLimit = sl ? parseFloat(sl) : 0;

  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeIcon').textContent = '☀️';
    document.getElementById('themeLabel').textContent = 'Light';
  }

  if (spendingLimit > 0) {
    document.getElementById('spendingLimit').value = spendingLimit;
  }
}

// ─── Render Balance ───────────────────────
function renderBalance() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('totalBalance').textContent = formatRupiah(total);

  const limitInfo = document.getElementById('limitInfo');
  if (spendingLimit > 0) {
    const remaining = spendingLimit - total;
    if (remaining < 0) {
      limitInfo.textContent = `⚠️ Over limit by ${formatRupiah(Math.abs(remaining))}`;
      limitInfo.className = 'limit-info over-limit';
    } else {
      limitInfo.textContent = `Remaining: ${formatRupiah(remaining)} / ${formatRupiah(spendingLimit)}`;
      limitInfo.className = 'limit-info';
    }
  } else {
    limitInfo.textContent = '';
    limitInfo.className = 'limit-info';
  }
}

// ─── Render Transaction List ──────────────
function getSortedTransactions() {
  const arr = [...transactions];
  switch (currentSort) {
    case 'date-asc':
      return arr.sort((a, b) => a.id - b.id);
    case 'date-desc':
      return arr.sort((a, b) => b.id - a.id);
    case 'amount-asc':
      return arr.sort((a, b) => a.amount - b.amount);
    case 'amount-desc':
      return arr.sort((a, b) => b.amount - a.amount);
    case 'category':
      return arr.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return arr;
  }
}

function renderTransactions() {
  const list = document.getElementById('transactionList');
  const empty = document.getElementById('emptyState');
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  list.innerHTML = '';

  if (transactions.length === 0) {
    list.appendChild(empty);
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  const sorted = getSortedTransactions();

  sorted.forEach((tx) => {
    const isOver = spendingLimit > 0 && total > spendingLimit;
    const item = document.createElement('div');
    item.className = 'transaction-item' + (isOver ? ' over-limit' : '');
    item.dataset.id = tx.id;

    item.innerHTML = `
      <div class="transaction-icon">${getCategoryIcon(tx.category)}</div>
      <div class="transaction-info">
        <div class="transaction-name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</div>
        <div class="transaction-meta">
          <span class="category-tag ${getCategoryTagClass(tx.category)}">${escapeHtml(tx.category)}</span>
          ${isOver ? '<span class="over-limit-badge">Over Limit</span>' : ''}
        </div>
      </div>
      <div class="transaction-amount">${formatRupiah(tx.amount)}</div>
      <button class="btn btn-danger delete-btn" data-id="${tx.id}" aria-label="Delete ${escapeHtml(tx.name)}">✕</button>
    `;

    list.appendChild(item);
  });

  // Attach delete handlers
  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteTransaction(Number(btn.dataset.id)));
  });
}

// ─── Render Chart ─────────────────────────
function renderChart() {
  const canvas = document.getElementById('spendingChart');
  const chartEmpty = document.getElementById('chartEmpty');

  if (transactions.length === 0) {
    canvas.style.display = 'none';
    chartEmpty.style.display = 'block';
    if (spendingChart) {
      spendingChart.destroy();
      spendingChart = null;
    }
    return;
  }

  canvas.style.display = 'block';
  chartEmpty.style.display = 'none';

  // Aggregate by category
  const categoryTotals = {};
  transactions.forEach((tx) => {
    categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(categoryTotals);
  const data = labels.map((l) => categoryTotals[l]);
  const colors = labels.map((l) => getCategoryColor(l));

  if (spendingChart) {
    spendingChart.data.labels = labels;
    spendingChart.data.datasets[0].data = data;
    spendingChart.data.datasets[0].backgroundColor = colors;
    spendingChart.update();
  } else {
    spendingChart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: getComputedStyle(document.documentElement)
            .getPropertyValue('--bg-card').trim() || '#ffffff',
          borderWidth: 3,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 16,
              font: { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
              color: getComputedStyle(document.documentElement)
                .getPropertyValue('--text-primary').trim() || '#1a202c',
              usePointStyle: true,
              pointStyleWidth: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${formatRupiah(ctx.parsed)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }
}

// Update chart colors when theme changes
function updateChartTheme() {
  if (!spendingChart) return;
  const textColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--text-primary').trim();
  const bgColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-card').trim();

  spendingChart.data.datasets[0].borderColor = bgColor;
  spendingChart.options.plugins.legend.labels.color = textColor;
  spendingChart.update();
}

// ─── Full Render ──────────────────────────
function renderAll() {
  renderBalance();
  renderTransactions();
  renderChart();
}

// ─── Add Transaction ──────────────────────
function addTransaction(name, amount, category) {
  const tx = {
    id: Date.now(),
    name: name.trim(),
    amount: parseFloat(amount),
    category,
  };
  transactions.push(tx);
  saveToStorage();
  renderAll();
}

// ─── Delete Transaction ───────────────────
function deleteTransaction(id) {
  transactions = transactions.filter((t) => t.id !== id);
  saveToStorage();
  renderAll();
}

// ─── Form Validation ──────────────────────
function validateForm(name, amount, category) {
  let valid = true;

  const nameInput = document.getElementById('itemName');
  const amountInput = document.getElementById('amount');
  const categoryInput = document.getElementById('category');
  const nameError = document.getElementById('nameError');
  const amountError = document.getElementById('amountError');
  const categoryError = document.getElementById('categoryError');

  // Reset
  [nameInput, amountInput, categoryInput].forEach((el) => el.classList.remove('invalid'));
  [nameError, amountError, categoryError].forEach((el) => el.classList.remove('visible'));

  if (!name.trim()) {
    nameInput.classList.add('invalid');
    nameError.classList.add('visible');
    valid = false;
  }

  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    amountInput.classList.add('invalid');
    amountError.classList.add('visible');
    valid = false;
  }

  if (!category) {
    categoryInput.classList.add('invalid');
    categoryError.classList.add('visible');
    valid = false;
  }

  return valid;
}

// ─── Populate Category Select ─────────────
function populateCategorySelect() {
  const select = document.getElementById('category');
  const currentVal = select.value;

  // Keep only the default placeholder
  select.innerHTML = '<option value="">-- Select Category --</option>';

  const allCategories = [...BUILT_IN_CATEGORIES, ...customCategories];
  const icons = { Food: '🍔', Transport: '🚗', Fun: '🎉' };

  allCategories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = `${icons[cat] || '📦'} ${cat}`;
    select.appendChild(opt);
  });

  // Restore selection if still valid
  if (currentVal && allCategories.includes(currentVal)) {
    select.value = currentVal;
  }
}

// ─── Escape HTML helper ───────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ─── Event Listeners ──────────────────────
function initEventListeners() {
  // Form submit
  document.getElementById('transactionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('itemName').value;
    const amount = document.getElementById('amount').value;
    const category = document.getElementById('category').value;

    if (!validateForm(name, amount, category)) return;

    addTransaction(name, amount, category);

    // Reset form
    e.target.reset();
    document.getElementById('category').value = '';
  });

  // Sort change
  document.getElementById('sortBy').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderTransactions();
  });

  // Spending limit
  document.getElementById('setLimitBtn').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('spendingLimit').value);
    if (!isNaN(val) && val >= 0) {
      spendingLimit = val;
      saveToStorage();
      renderAll();
    }
  });

  document.getElementById('spendingLimit').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('setLimitBtn').click();
  });

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('themeIcon').textContent = isDark ? '🌙' : '☀️';
    document.getElementById('themeLabel').textContent = isDark ? 'Dark' : 'Light';
    saveToStorage();
    updateChartTheme();
  });

  // Add custom category — open modal
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.add('open');
    document.getElementById('customCategoryInput').value = '';
    document.getElementById('customCategoryInput').classList.remove('invalid');
    document.getElementById('modalError').classList.remove('visible');
    setTimeout(() => document.getElementById('customCategoryInput').focus(), 50);
  });

  // Modal — cancel
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

  // Modal — backdrop click
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Modal — confirm
  document.getElementById('confirmModalBtn').addEventListener('click', confirmAddCategory);

  // Modal — enter key
  document.getElementById('customCategoryInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddCategory();
    if (e.key === 'Escape') closeModal();
  });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function confirmAddCategory() {
  const input = document.getElementById('customCategoryInput');
  const error = document.getElementById('modalError');
  const val = input.value.trim();

  input.classList.remove('invalid');
  error.classList.remove('visible');

  if (!val) {
    input.classList.add('invalid');
    error.classList.add('visible');
    return;
  }

  const allCategories = [...BUILT_IN_CATEGORIES, ...customCategories];
  if (allCategories.map(c => c.toLowerCase()).includes(val.toLowerCase())) {
    input.classList.add('invalid');
    error.textContent = 'Category already exists.';
    error.classList.add('visible');
    return;
  }

  customCategories.push(val);
  saveToStorage();
  populateCategorySelect();

  // Auto-select the new category
  document.getElementById('category').value = val;

  closeModal();
}

// ─── Init ─────────────────────────────────
function init() {
  loadFromStorage();
  populateCategorySelect();
  initEventListeners();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
