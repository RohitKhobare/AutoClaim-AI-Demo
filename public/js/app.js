/* AutoClaim AI — client interactions (no framework, no build step) */
(function () {
  'use strict';

  // ── theme ──────────────────────────────────────────────────
  var root = document.documentElement;
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('autoclaim-theme', theme); } catch (e) {}
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('title', theme === 'dark' ? 'Light theme' : 'Dark theme');
    });
  }
  var initial = root.getAttribute('data-theme') || 'light';
  applyTheme(initial);
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-theme-toggle]');
    if (!toggle) return;
    e.preventDefault();
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // ── mobile nav / sidebar ──────────────────────────────────
  document.addEventListener('click', function (e) {
    var navToggle = e.target.closest('[data-nav-toggle]');
    if (navToggle) {
      e.preventDefault();
      var links = document.getElementById('primary-nav');
      if (links) links.classList.toggle('is-open');
    }
    var sideToggle = e.target.closest('[data-sidebar-toggle]');
    if (sideToggle) {
      e.preventDefault();
      var side = document.querySelector('.sidebar');
      var back = document.querySelector('.sidebar-backdrop');
      if (side) side.classList.toggle('is-open');
      if (back) back.classList.toggle('is-open');
    }
    var closeFlash = e.target.closest('[data-dismiss]');
    if (closeFlash) closeFlash.closest('.flash').remove();
  });

  // close dropdown menus on outside click
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.user-menu[open], details.lang-menu[open]').forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });

  // ── confirm actions ───────────────────────────────────────
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var msg = form.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // ── file inputs ───────────────────────────────────────────
  document.querySelectorAll('[data-file-drop]').forEach(function (drop) {
    var input = drop.querySelector('input[type="file"]');
    if (!input) return;
    var nameEl = drop.querySelector('[data-file-name]');
    function show() {
      if (!input.files || !input.files.length) return;
      var f = input.files[0];
      if (nameEl) nameEl.textContent = f.name + ' · ' + Math.round(f.size / 1024) + ' KB';
      drop.classList.add('has-file');
    }
    input.addEventListener('change', show);
    drop.addEventListener('dragover', function (ev) { ev.preventDefault(); drop.classList.add('is-drag'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-drag'); });
    drop.addEventListener('drop', function (ev) {
      ev.preventDefault();
      drop.classList.remove('is-drag');
      if (ev.dataTransfer.files.length) {
        input.files = ev.dataTransfer.files;
        show();
      }
    });
  });

  // ── claim wizard ──────────────────────────────────────────
  var wizard = document.querySelector('[data-wizard]');
  if (wizard) {
    var steps = wizard.querySelectorAll('[data-step]');
    var dots = wizard.querySelectorAll('[data-dot]');
    var current = 1;
    var total = steps.length;

    function render() {
      steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== current; });
      dots.forEach(function (d) {
        var n = Number(d.dataset.dot);
        d.classList.toggle('active', n === current);
        d.classList.toggle('done', n < current);
      });
      var prev = wizard.querySelector('[data-prev]');
      var next = wizard.querySelector('[data-next]');
      var submit = wizard.querySelector('[data-submit]');
      if (prev) prev.hidden = current === 1;
      if (next) next.hidden = current === total;
      if (submit) submit.hidden = current !== total;
      wizard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function validateStep(step) {
      var container = wizard.querySelector('[data-step="' + step + '"]');
      if (!container) return true;
      var ok = true;
      container.querySelectorAll('[required]').forEach(function (el) {
        if (!el.checkValidity()) {
          el.reportValidity();
          ok = false;
        }
      });
      return ok;
    }

    wizard.addEventListener('click', function (e) {
      var next = e.target.closest('[data-next]');
      var prev = e.target.closest('[data-prev]');
      if (next) {
        e.preventDefault();
        if (!validateStep(current)) return;
        current = Math.min(total, current + 1);
        render();
      }
      if (prev) {
        e.preventDefault();
        current = Math.max(1, current - 1);
        render();
      }
    });

    // vehicle → policy sync
    var vehicleSelect = wizard.querySelector('[data-vehicle-select]');
    if (vehicleSelect) {
      var sync = function () {
        var opt = vehicleSelect.options[vehicleSelect.selectedIndex];
        if (!opt) return;
        var policyId = opt.dataset.policy;
        var policyField = wizard.querySelector('[data-policy-field]');
        var info = wizard.querySelector('[data-vehicle-info]');
        if (policyField) policyField.value = policyId || '';
        if (info) {
          if (!policyId) {
            info.innerHTML = '<div class="note-box is-warn">No policy is linked to this vehicle. Please contact support before filing a claim.</div>';
          } else {
            var end = opt.dataset.policyEnd || '';
            var active = opt.dataset.policyStatus === 'active';
            info.innerHTML = '<div class="note-box ' + (active ? 'is-success' : 'is-warn') + '">Policy <b>' +
              (opt.dataset.policyNumber || '') + '</b> · valid till ' + end +
              (active ? ' · active cover' : ' · cover not active on this policy') + '</div>';
          }
        }
      };
      vehicleSelect.addEventListener('change', sync);
      sync();
    }

    render();
  }

  // ── analysis page: stage animation then submit ─────────────
  var analyze = document.querySelector('[data-analyze]');
  if (analyze) {
    var rows = Array.prototype.slice.call(analyze.querySelectorAll('[data-as]'));
    var pctEl = analyze.querySelector('[data-analyze-pct]');
    var startedAt = Date.now();
    var duration = 4200;
    rows.forEach(function (r, i) {
      setTimeout(function () {
        rows.forEach(function (x) { if (x !== r && !x.classList.contains('done')) x.classList.remove('active'); });
        r.classList.add('active');
        var st = r.querySelector('.as-state');
        if (st) st.textContent = 'Running';
      }, i * (duration / rows.length));
      setTimeout(function () {
        r.classList.remove('active');
        r.classList.add('done');
        var st = r.querySelector('.as-state');
        if (st) st.textContent = 'Done';
        if (pctEl) pctEl.textContent = Math.round(((i + 1) / rows.length) * 100) + '%';
      }, (i + 1) * (duration / rows.length));
    });
    setTimeout(function () { analyze.submit(); }, duration + 500);

    var tick = setInterval(function () {
      if (!document.body.contains(analyze)) return clearInterval(tick);
      var s = ((Date.now() - startedAt) / 1000).toFixed(1);
      var el = analyze.querySelector('[data-analyze-timer]');
      if (el) el.textContent = s + 's';
    }, 100);
  }

  // ── auto-format registration number ──────────────────────
  document.querySelectorAll('input[name="registration_no"]').forEach(function (input) {
    input.addEventListener('blur', function () {
      input.value = input.value.replace(/\s+/g, '').toUpperCase();
    });
  });

  // ── dashboard bar tooltips ───────────────────────────────
  document.querySelectorAll('[data-bar-value]').forEach(function (b) {
    b.setAttribute('title', b.dataset.barValue);
  });

  // ── auto dismiss flash after 7s ──────────────────────────
  setTimeout(function () {
    document.querySelectorAll('.flash-wrap .flash').forEach(function (f) {
      f.style.transition = 'opacity .4s ease, transform .4s ease';
      f.style.opacity = '0';
      f.style.transform = 'translateY(-6px)';
      setTimeout(function () { f.remove(); }, 420);
    });
  }, 7000);

  // ── print button ─────────────────────────────────────────
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-print]')) {
      e.preventDefault();
      window.print();
    }
  });
})();
