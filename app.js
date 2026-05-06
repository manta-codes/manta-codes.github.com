// ── Column config ─────────────────────────────────────────────────────────────
// Update these strings to match the exact column headers in your data file.
var COL = {
  seriesId:    'Series ID',
  category:    'Category',
  subcategory: 'Subcategory',
  seasonalAdj: 'Seasonal Adj.',
  notes:       'Notes',
  year:        'Year',
  period:      'Period',
  month:       'Month',
  value:       'CPI Value'
};

// Columns rendered in the table (order determines display order).
var TABLE_COLUMNS = [
  { key: COL.seriesId,    label: 'Series ID' },
  { key: COL.category,    label: 'Category' },
  { key: COL.subcategory, label: 'Subcategory' },
  { key: COL.seasonalAdj, label: 'Seasonal Adj.' },
  { key: COL.notes,       label: 'Notes' },
  { key: COL.year,        label: 'Year' },
  { key: COL.period,      label: 'Period' },
  { key: COL.month,       label: 'Month' },
  { key: COL.value,       label: 'CPI Value', numeric: true }
];

var NUMERIC_COLS = new Set([COL.value]);

// Natural month sort order — handles both full names and abbreviations.
var MONTH_ORDER = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  january:1, february:2, march:3, april:4, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12
};

// ── State ─────────────────────────────────────────────────────────────────────
var allData      = [];
var filteredData = [];
var sortState    = { col: null, dir: 'asc' };

// ── DOM refs ──────────────────────────────────────────────────────────────────
var elLoading    = document.getElementById('loading');
var elError      = document.getElementById('error');
var elErrorText  = document.getElementById('error-text');
var elTable      = document.getElementById('data-table');
var elTHeadRow   = document.getElementById('table-head-row');
var elTBody      = document.getElementById('table-body');
var elNoResults  = document.getElementById('no-results');
var elRowCount   = document.getElementById('row-count');
var elCatFilter  = document.getElementById('filter-category');
var elSubFilter  = document.getElementById('filter-subcategory');
var elMonFilter  = document.getElementById('filter-month');
var elYearFilter = document.getElementById('filter-year');
var elClearBtn   = document.getElementById('btn-clear');

// ── Bootstrap ─────────────────────────────────────────────────────────────────
loadData();

// ── Data loading ──────────────────────────────────────────────────────────────
// Tries data.json first; on 404 falls back to data.csv.
function loadData() {
  fetch('data.json')
    .then(function (res) {
      if (!res.ok) throw new Error('json_not_found');
      return res.json();
    })
    .then(function (data) {
      init(data);
    })
    .catch(function (err) {
      if (err.message === 'json_not_found' || err instanceof SyntaxError) {
        // Fall back to CSV
        fetch('data.csv')
          .then(function (res) {
            if (!res.ok) throw new Error('csv_not_found');
            return res.text();
          })
          .then(function (text) {
            init(parseCSV(text));
          })
          .catch(function () {
            showError('Could not find <code>data.json</code> or <code>data.csv</code>.');
          });
      } else {
        showError('Failed to parse data.json: ' + err.message);
      }
    });
}

function init(data) {
  allData = coerceTypes(data || []);
  buildTableHead();
  populateFilters(allData);
  applyFilters();
  hide(elLoading);
  show(elTable);
}

// Cast numeric-looking strings to numbers for accurate sorting and display.
function coerceTypes(data) {
  if (!data.length) return data;
  var sample = data[0];
  var numericKeys = Object.keys(sample).filter(function (k) {
    return !isNaN(parseFloat(sample[k])) && sample[k] !== '';
  });
  return data.map(function (row) {
    var out = Object.assign({}, row);
    numericKeys.forEach(function (k) {
      if (out[k] !== '' && out[k] !== null && out[k] !== undefined) {
        out[k] = parseFloat(out[k]);
      }
    });
    return out;
  });
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  var headers = splitCSVRow(lines[0]).map(function (h) { return h.trim(); });
  var result = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var vals = splitCSVRow(lines[i]);
    var obj = {};
    headers.forEach(function (h, idx) {
      obj[h] = vals[idx] !== undefined ? vals[idx].trim() : '';
    });
    result.push(obj);
  }
  return result;
}

function splitCSVRow(row) {
  var result = [];
  var inQuotes = false;
  var current = '';
  for (var i = 0; i < row.length; i++) {
    var c = row[i];
    if (c === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

// ── Table head ────────────────────────────────────────────────────────────────
function buildTableHead() {
  TABLE_COLUMNS.forEach(function (col) {
    var th = document.createElement('th');
    th.textContent = col.label;
    th.dataset.key = col.key;
    th.addEventListener('click', function () { onSort(col.key, th); });
    elTHeadRow.appendChild(th);
  });
}

// ── Filter dropdowns ──────────────────────────────────────────────────────────
function populateFilters(data) {
  fillSelect(elCatFilter,  unique(data, COL.category).sort(),                     'All Categories');
  fillSelect(elSubFilter,  unique(data, COL.subcategory).sort(),                  'All Subcategories');
  fillSelect(elMonFilter,  unique(data, COL.month).sort(compareMonths),           'All Months');
  fillSelect(elYearFilter, unique(data, COL.year).sort(function (a, b) { return Number(a) - Number(b); }), 'All Years');
}

function fillSelect(el, values, placeholder) {
  el.innerHTML = '<option value="">' + placeholder + '</option>';
  values.forEach(function (v) {
    var opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}

// ── Filter events ─────────────────────────────────────────────────────────────
elCatFilter.addEventListener('change', function () {
  // Scope subcategory dropdown to the selected category.
  var cat = elCatFilter.value;
  var subset = cat ? allData.filter(function (r) { return r[COL.category] === cat; }) : allData;
  fillSelect(elSubFilter, unique(subset, COL.subcategory).sort(), 'All Subcategories');
  applyFilters();
});

elSubFilter.addEventListener('change',  applyFilters);
elMonFilter.addEventListener('change',  applyFilters);
elYearFilter.addEventListener('change', applyFilters);

elClearBtn.addEventListener('click', function () {
  elCatFilter.value  = '';
  elSubFilter.value  = '';
  elMonFilter.value  = '';
  elYearFilter.value = '';
  fillSelect(elSubFilter, unique(allData, COL.subcategory).sort(), 'All Subcategories');
  applyFilters();
});

// ── Core filter + render ──────────────────────────────────────────────────────
function applyFilters() {
  var cat  = elCatFilter.value;
  var sub  = elSubFilter.value;
  var mon  = elMonFilter.value;
  var year = elYearFilter.value;

  filteredData = allData.filter(function (row) {
    if (cat  && row[COL.category]          !== cat)  return false;
    if (sub  && row[COL.subcategory]       !== sub)  return false;
    if (mon  && String(row[COL.month])     !== mon)  return false;
    if (year && String(row[COL.year])      !== year) return false;
    return true;
  });

  if (sortState.col) sortData();
  renderTable(filteredData);
  updateRowCount(filteredData.length, allData.length);
}

// ── Sorting ───────────────────────────────────────────────────────────────────
function onSort(key, th) {
  sortState.dir = sortState.col === key && sortState.dir === 'asc' ? 'desc' : 'asc';
  sortState.col = key;

  document.querySelectorAll('#table-head-row th').forEach(function (h) {
    h.classList.remove('sort-asc', 'sort-desc');
  });
  th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');

  sortData();
  renderTable(filteredData);
}

function sortData() {
  var key = sortState.col;
  var dir = sortState.dir === 'asc' ? 1 : -1;

  filteredData.sort(function (a, b) {
    var av = a[key], bv = b[key];
    if (key === COL.month) return dir * compareMonths(String(av), String(bv));
    if (NUMERIC_COLS.has(key) || key === COL.year) return dir * (Number(av) - Number(bv));
    return dir * String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTable(data) {
  if (data.length === 0) {
    hide(elTable);
    show(elNoResults);
    return;
  }
  hide(elNoResults);
  show(elTable);

  var fragment = document.createDocumentFragment();
  data.forEach(function (row) {
    var tr = document.createElement('tr');
    TABLE_COLUMNS.forEach(function (col) {
      var td = document.createElement('td');
      var val = row[col.key];
      td.textContent = val !== null && val !== undefined ? val : '';
      if (col.numeric) td.classList.add('numeric');
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });

  elTBody.innerHTML = '';
  elTBody.appendChild(fragment);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateRowCount(shown, total) {
  if (shown === total) {
    elRowCount.textContent = total.toLocaleString() + ' records';
  } else {
    elRowCount.textContent = shown.toLocaleString() + ' of ' + total.toLocaleString() + ' records';
  }
}

function unique(data, key) {
  return Array.from(new Set(
    data.map(function (r) { return r[key]; })
        .filter(function (v) { return v !== null && v !== undefined && v !== ''; })
  ));
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function showError(msg) {
  hide(elLoading);
  elErrorText.innerHTML = msg;
  show(elError);
}

function compareMonths(a, b) {
  var ai = MONTH_ORDER[String(a).toLowerCase()];
  var bi = MONTH_ORDER[String(b).toLowerCase()];
  if (ai && bi) return ai - bi;
  var an = Number(a), bn = Number(b);
  if (!isNaN(an) && !isNaN(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}
