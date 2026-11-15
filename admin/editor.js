// Live editor for abdulsametacikgoz.com — loaded only when the page is opened with ?edit.
// Click a text on the page to change it; lists (projects, toolkit, contact) are edited in the side panel.
// "Kaydet" writes content/*.json to GitHub with the owner's own GitHub key; GitHub Pages then republishes.
(function () {
  'use strict';
  var REPO = 'sametackgz41/sametackgz41.github.io', BRANCH = 'main';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/';
  var FILES = ['texts', 'projects', 'toolkit', 'contact'];
  var KEY_STORE = 'site-editor-key';
  var SITE = window.SITE, root = document.documentElement;
  var shas = {}, dirty = {}, uploads = {}, token = '', canSave = false;

  // ---------- small helpers ----------
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var h = function (tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  };
  var getIn = function (o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); };
  var setIn = function (o, path, v) {
    var ks = path.split('.'), last = ks.pop();
    ks.forEach(function (k) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    o[last] = v;
  };
  var store = {
    get: function () { try { return localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } },
    set: function (v, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY_STORE, v); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); } catch (e) {} }
  };
  var b64encode = function (str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  var b64decode = function (b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  };
  var gh = function (path, opts) {
    opts = opts || {};
    opts.headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token };
    if (opts.body) opts.headers['Content-Type'] = 'application/json';
    return fetch(path.indexOf('http') === 0 ? path : API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || r.status); e.status = r.status; throw e; } return j; });
    });
  };
  var lang = function () { return root.lang === 'tr' ? 'tr' : 'en'; };

  // ---------- styles ----------
  document.head.appendChild(h('style', { text: [
    '.ed-on{outline:1px dashed color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:3px;border-radius:4px;cursor:text}',
    '.ed-on:hover{outline-style:solid}.ed-on:focus{outline:2px solid var(--accent);background:var(--accent-soft)}',
    '.js .reveal{opacity:1!important;transform:none!important;transition:none!important}',
    '.ed-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100;width:max-content;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px;',
    'max-width:calc(100% - 32px);padding:8px 8px 8px 16px;border-radius:999px;background:var(--text);color:var(--bg);box-shadow:0 12px 40px -8px rgba(0,0,0,.5);font:500 .88rem Inter,system-ui,sans-serif}',
    '.ed-bar b{font-weight:600}.ed-bar .ed-hint{opacity:.75}',
    '@media (max-width:720px){.ed-bar .ed-hint{display:none}.ed-bar{padding-left:12px;gap:6px;border-radius:22px}}',
    '@media (min-width:900px){.ed-panel-open .ed-bar{left:calc((100% - 420px) / 2)}}',
    '@media (max-width:899px){.ed-panel-open .ed-bar{display:none}}',
    '.ed-btn{border:0;border-radius:999px;padding:8px 14px;font:600 .85rem Inter,system-ui,sans-serif;cursor:pointer;background:color-mix(in srgb,var(--bg) 18%,transparent);color:inherit}',
    '.ed-btn:hover{background:color-mix(in srgb,var(--bg) 30%,transparent)}.ed-btn.ed-main{background:var(--accent);color:#111}.ed-btn:disabled{opacity:.45;cursor:default}',
    '.ed-panel{position:fixed;top:0;right:0;bottom:0;z-index:101;width:min(420px,100%);overflow:auto;background:var(--card);color:var(--text);border-left:1px solid var(--line);',
    'box-shadow:-20px 0 50px -20px rgba(0,0,0,.4);padding:20px 18px 120px;font:14px/1.5 Inter,system-ui,sans-serif}',
    '.ed-panel[hidden],.ed-modal[hidden]{display:none}.ed-panel h3{font-size:1.1rem;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center}',
    '.ed-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}.ed-tabs button{border:1px solid var(--line);background:none;color:var(--text);border-radius:999px;padding:6px 12px;cursor:pointer;font:inherit}',
    '.ed-tabs button.on{background:var(--accent-soft);border-color:var(--accent)}',
    '.ed-item{border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:12px;background:var(--bg)}',
    '.ed-item-head{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;font-weight:600}',
    '.ed-item-head span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ed-mini{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:8px;min-width:30px;height:30px;cursor:pointer;font:inherit}',
    '.ed-mini:hover{border-color:var(--accent)}',
    '.ed-panel label{display:block;font-size:.78rem;color:var(--muted);margin:8px 0 3px}',
    '.ed-panel input,.ed-panel textarea,.ed-modal input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit}',
    '.ed-panel textarea{min-height:70px;resize:vertical}.ed-add{width:100%;padding:10px;border-radius:12px;border:1px dashed var(--accent);background:none;color:var(--accent);font:600 .9rem Inter,sans-serif;cursor:pointer}',
    '.ed-modal{position:fixed;inset:0;z-index:102;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.55)}',
    '.ed-card{width:min(520px,100%);max-height:100%;overflow:auto;background:var(--card);color:var(--text);border-radius:20px;padding:22px;font:14px/1.6 Inter,system-ui,sans-serif;box-shadow:var(--shadow)}',
    '.ed-card h3{font-size:1.15rem;margin:0 0 8px}.ed-card ol{padding-left:20px;margin:8px 0 12px}.ed-card li{margin:3px 0}.ed-card a{color:var(--accent)}',
    '.ed-card .ed-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}',
    '.ed-card .ed-btn{background:var(--bg-2);color:var(--text)}.ed-card .ed-btn.ed-main{background:var(--accent);color:#111}',
    '.ed-err{color:#d9534f;font-size:.85rem;min-height:1.2em;margin-top:6px}',
    '.ed-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:103;background:var(--card);color:var(--text);border:1px solid var(--line);',
    'border-radius:12px;padding:10px 16px;box-shadow:var(--shadow);font:500 .9rem Inter,sans-serif;max-width:calc(100% - 32px)}'
  ].join('') }));

  var toastTimer;
  function toast(msg, ms) {
    var t = $('.ed-toast') || document.body.appendChild(h('div', { class: 'ed-toast', role: 'status' }));
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }

  // ---------- inline text editing ----------
  function fileOfKey(key) { return /^side_\d+_d$/.test(key) ? 'projects' : /^tool_\d+$/.test(key) ? 'toolkit' : 'texts'; }
  function fromHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html.replace(/<\/?(strong|b)\b[^>]*>/gi, '**').replace(/<br\s*\/?>/gi, ' ');
    return tmp.textContent.replace(/\*\*\*\*/g, '').replace(/ /g, ' ').replace(/\s*\n\s*/g, ' ');
  }
  function markDirty(file) { dirty[file] = true; updateBar(); }

  function bind() {
    document.querySelectorAll('.reveal').forEach(function (e) { e.classList.add('in'); });
    document.querySelectorAll('[data-i18n],[data-i18n-html]').forEach(function (el) {
      var key = el.dataset.i18n || el.dataset.i18nHtml;
      if (!SITE.refs[key] || el.dataset.edBound) return;
      el.dataset.edBound = '1';
      try { el.contentEditable = el.dataset.i18nHtml ? 'true' : 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; }
      el.classList.add('ed-on'); el.spellcheck = true;
      el.title = el.dataset.i18nHtml ? 'Tıklayıp düzenle (kalın: Ctrl+B)' : 'Tıklayıp düzenle';
      el.addEventListener('input', function () {
        var ref = SITE.refs[key], l = lang();
        ref[l] = el.dataset.i18nHtml ? fromHtml(el.innerHTML) : el.textContent.replace(/\s*\n\s*/g, ' ');
        SITE.setKey(key, ref);
        document.querySelectorAll('[data-i18n="' + key + '"]').forEach(function (o) { if (o !== el) o.textContent = ref[l]; });
        markDirty(fileOfKey(key));
      });
    });
    document.querySelectorAll('article.side[data-index] [data-edit]').forEach(function (el) {
      if (el.dataset.edBound) return;
      el.dataset.edBound = '1'; el.contentEditable = 'true'; el.classList.add('ed-on'); el.title = 'Tıklayıp düzenle';
      el.addEventListener('input', function () {
        var i = +el.closest('article').dataset.index;
        SITE.data.projects.projects[i][el.dataset.edit] = el.textContent.replace(/\s*\n\s*/g, ' ');
        markDirty('projects');
        if (panelTab === 'projects' && !panel.hidden) drawPanel();
      });
    });
    // Show images that are waiting to be uploaded on save.
    document.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src'); if (uploads[src]) img.src = uploads[src].preview;
    });
  }

  // While editing, links don't navigate (clicking a button's text should edit it) — except in-page anchors.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a || a.closest('.ed-panel,.ed-modal,.ed-bar')) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) !== '#' || a.querySelector('.ed-on') || a.classList.contains('ed-on')) e.preventDefault();
  }, true);
  // One line per text: Enter finishes editing instead of adding a line break.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('ed-on')) { e.preventDefault(); e.target.blur(); }
  }, true);
  // Paste as plain text so no foreign formatting sneaks in.
  document.addEventListener('paste', function (e) {
    if (!e.target.closest || !e.target.closest('.ed-on')) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' '));
  }, true);

  // ---------- side panel for lists ----------
  var LISTS = {
    projects: { label: 'Projeler', file: 'projects', path: 'projects', title: 'title', add: 'Proje ekle',
      blank: { title: 'Yeni proje', description: { en: '', tr: '' }, image: '', image_alt: '', icon: 'fa-solid fa-cube', tech: '', tech_icon: '', live_url: '', source_url: '' },
      fields: [
        ['title', 'Proje adı'], ['description.tr', 'Açıklama (Türkçe)', 'area'], ['description.en', 'Açıklama (English)', 'area'],
        ['image', 'Görsel (boşsa simge görünür)', 'image'], ['image_alt', 'Görselin kısa tarifi'],
        ['icon', 'Simge (görsel yoksa), ör. fa-solid fa-book-open'], ['tech', 'Teknolojiler, ör. React · Vite'],
        ['tech_icon', 'Teknoloji simgesi, ör. fa-brands fa-react'], ['live_url', 'Canlı site bağlantısı'], ['source_url', 'GitHub bağlantısı']
      ] },
    toolkit: { label: 'Araçlar', file: 'toolkit', path: 'groups', title: 'title.tr', add: 'Grup ekle',
      blank: { title: { en: 'New', tr: 'Yeni' }, icon: 'fa-solid fa-star', chips: [] },
      fields: [['title.tr', 'Grup adı (Türkçe)'], ['title.en', 'Grup adı (English)'], ['icon', 'Simge, ör. fa-solid fa-code'], ['chips', 'Araçlar (virgülle ayır)', 'csv']] },
    buttons: { label: 'İletişim butonları', file: 'contact', path: 'buttons', title: 'label', add: 'Buton ekle',
      blank: { label: 'Yeni', icon: 'fa-solid fa-link', url: 'https://' },
      fields: [['label', 'Yazı'], ['icon', 'Simge, ör. fa-brands fa-github'], ['url', 'Bağlantı']] },
    social: { label: 'Sosyal medya', file: 'contact', path: 'social', title: 'name', add: 'Hesap ekle',
      blank: { name: 'Yeni', handle: '@', icon: 'fa-brands fa-instagram', url: 'https://' },
      fields: [['name', 'Platform'], ['handle', 'Kullanıcı adı'], ['icon', 'Simge, ör. fa-brands fa-instagram'], ['url', 'Bağlantı']] }
  };
  var panelTab = 'projects', renderTimer;
  var panel = h('aside', { class: 'ed-panel', hidden: '', 'aria-label': 'Liste düzenleyici' });
  document.body.appendChild(panel);

  function rerender(file) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { SITE.render(file); }, 250);
  }

  function drawPanel() {
    var cfg = LISTS[panelTab], data = SITE.data[cfg.file] || (SITE.data[cfg.file] = {});
    var list = data[cfg.path] || (data[cfg.path] = []);
    panel.innerHTML = '';
    panel.appendChild(h('h3', {}, ['Listeleri düzenle', h('button', { class: 'ed-mini', 'aria-label': 'Kapat', text: '✕', onclick: function () { panel.hidden = true; updateBar(); } })]));
    panel.appendChild(h('div', { class: 'ed-tabs' }, Object.keys(LISTS).map(function (k) {
      return h('button', { class: k === panelTab ? 'on' : '', text: LISTS[k].label, onclick: function () { panelTab = k; drawPanel(); } });
    })));
    panel.appendChild(h('p', { style: 'color:var(--muted);font-size:.82rem;margin:0 0 12px', text: 'Değişiklikler sayfada hemen görünür. Simge adları: fontawesome.com/search (ücretsiz olanlar).' }));
    var changed = function () { markDirty(cfg.file); rerender(cfg.file); };
    list.forEach(function (item, i) {
      var head = h('span', { text: getIn(item, cfg.title) || '(adsız)' });
      var move = function (d) { var j = i + d; if (j < 0 || j >= list.length) return; list.splice(j, 0, list.splice(i, 1)[0]); changed(); drawPanel(); };
      var box = h('div', { class: 'ed-item' }, [h('div', { class: 'ed-item-head' }, [head,
        h('button', { class: 'ed-mini', title: 'Yukarı taşı', text: '↑', onclick: function () { move(-1); } }),
        h('button', { class: 'ed-mini', title: 'Aşağı taşı', text: '↓', onclick: function () { move(1); } }),
        h('button', { class: 'ed-mini', title: 'Sil', text: '🗑', onclick: function () {
          if (confirm('"' + (getIn(item, cfg.title) || 'Bu öğe') + '" silinsin mi? (Kaydet demeden siteye yansımaz.)')) { list.splice(i, 1); changed(); drawPanel(); }
        } })])]);
      cfg.fields.forEach(function (f) {
        var path = f[0], type = f[2], val = getIn(item, path);
        var input = type === 'area' ? h('textarea') : h('input', { type: 'text' });
        input.value = type === 'csv' ? (val || []).join(', ') : (val || '');
        input.addEventListener('input', function () {
          setIn(item, path, type === 'csv' ? input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : input.value);
          if (path === cfg.title) head.textContent = input.value || '(adsız)';
          changed();
        });
        box.appendChild(h('label', { text: f[1] }));
        box.appendChild(input);
        if (type === 'image') {
          var file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'margin-top:6px' });
          file.addEventListener('change', function () {
            var f0 = file.files[0]; if (!f0) return;
            if (f0.size > 3 * 1024 * 1024) { toast('Görsel 3 MB’tan küçük olmalı.'); return; }
            var name = '/assets/' + f0.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+/, '');
            var rd = new FileReader();
            rd.onload = function () {
              uploads[name] = { preview: rd.result, b64: String(rd.result).split(',')[1] };
              input.value = name; setIn(item, path, name); changed();
            };
            rd.readAsDataURL(f0);
          });
          box.appendChild(file);
        }
      });
      panel.appendChild(box);
    });
    panel.appendChild(h('button', { class: 'ed-add', text: '+ ' + cfg.add, onclick: function () {
      list.push(JSON.parse(JSON.stringify(cfg.blank))); changed(); drawPanel(); panel.scrollTop = panel.scrollHeight;
    } }));
  }

  // ---------- GitHub key ----------
  var modal = h('div', { class: 'ed-modal', hidden: '' });
  document.body.appendChild(modal);
  function askKey(msg) {
    modal.innerHTML = '';
    var input = h('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', spellcheck: 'false' });
    var remember = h('input', { type: 'checkbox', style: 'width:auto;margin-right:6px' });
    var err = h('div', { class: 'ed-err', text: msg || '' });
    var go = function () {
      var v = input.value.trim(); if (!v) { err.textContent = 'Anahtarı yapıştır.'; return; }
      err.textContent = 'Kontrol ediliyor…';
      connect(v).then(function () { store.set(v, remember.checked); modal.hidden = true; }, function (e) { err.textContent = e.message; });
    };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    modal.appendChild(h('div', { class: 'ed-card', role: 'dialog', 'aria-modal': 'true' }, [
      h('h3', { text: 'Kaydetmek için GitHub anahtarı' }),
      h('p', { text: 'Bir kere yapılır. Anahtar yalnızca bu tarayıcıda durur ve sadece bu sitenin dosyalarını değiştirebilir.' }),
      h('ol', {}, [
        h('li', {}, [h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener', text: 'Bu sayfayı aç' }), ' (GitHub → Fine-grained token).']),
        h('li', { text: 'Token name: site-editor · Expiration: 90 gün.' }),
        h('li', { text: 'Repository access: Only select repositories → sametackgz41.github.io' }),
        h('li', { text: 'Permissions → Repository permissions → Contents: Read and write.' }),
        h('li', { text: 'Generate token de, çıkan kodu kopyalayıp aşağı yapıştır.' })
      ]),
      input,
      h('label', { style: 'display:flex;align-items:center;margin-top:10px;font-size:.88rem' }, [remember, 'Bu cihazda hatırla (ortak bilgisayarda işaretleme)']),
      err,
      h('div', { class: 'ed-row' }, [
        h('button', { class: 'ed-btn', text: 'Kaydetmeden dene', onclick: function () { modal.hidden = true; updateBar(); } }),
        h('button', { class: 'ed-btn ed-main', text: 'Bağlan', onclick: go })
      ])
    ]));
    modal.hidden = false; setTimeout(function () { input.focus(); }, 50);
  }

  // Checks the key, then loads the newest content straight from GitHub (the live site can lag a minute behind).
  function connect(key) {
    token = key;
    return gh('https://api.github.com/repos/' + REPO).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) throw new Error('Bu anahtarın siteye yazma izni yok. "Contents: Read and write" seçili mi?');
      return Promise.all(FILES.map(function (f) {
        return gh('content/' + f + '.json?ref=' + BRANCH).then(function (j) { shas[f] = j.sha; SITE.data[f] = JSON.parse(b64decode(j.content)); });
      }));
    }).then(function () {
      canSave = true; dirty = {}; SITE.render(); updateBar(); toast('Bağlandı. En güncel içerik yüklendi.');
    }, function (e) {
      token = ''; canSave = false;
      throw new Error(e.status === 401 ? 'Anahtar geçersiz ya da süresi dolmuş.' : e.status === 404 ? 'Anahtar bu depoyu göremiyor. Depo seçimini kontrol et.' : 'Bağlanılamadı: ' + e.message);
    });
  }

  // ---------- saving ----------
  function save() {
    var files = Object.keys(dirty);
    if (!files.length) return;
    if (!canSave) { askKey(); return; }
    var btn = $('#edSave'); btn.disabled = true; btn.textContent = 'Kaydediliyor…';
    var used = Object.keys(uploads).filter(function (p) { return JSON.stringify(SITE.data).indexOf(p) !== -1; });
    var chain = Promise.resolve();
    used.forEach(function (p) {
      chain = chain.then(function () {
        var path = p.replace(/^\//, '');
        return gh(path + '?ref=' + BRANCH).then(function (j) { return j.sha; }, function () { return undefined; }).then(function (sha) {
          return gh(path, { method: 'PUT', body: JSON.stringify({ message: 'Upload ' + path + ' from the live editor', content: uploads[p].b64, branch: BRANCH, sha: sha }) });
        }).then(function () { delete uploads[p]; });
      });
    });
    files.forEach(function (f) {
      chain = chain.then(function () {
        return gh('content/' + f + '.json', { method: 'PUT', body: JSON.stringify({
          message: 'Update ' + f + ' from the live editor', branch: BRANCH, sha: shas[f],
          content: b64encode(JSON.stringify(SITE.data[f], null, 2) + '\n')
        }) }).then(function (j) { shas[f] = j.content.sha; delete dirty[f]; });
      });
    });
    chain.then(function () {
      toast('Kaydedildi ✓ 1-2 dakika içinde sitede görünür.', 6000);
    }, function (e) {
      toast(e.status === 409 || e.status === 422
        ? 'Dosya bu arada başka yerden değişmiş. Sayfayı yenileyip tekrar dene (yazdıkların silinir, önce kopyala).'
        : e.status === 401 ? 'Anahtarın süresi dolmuş; yenisini gir.' : 'Kaydedilemedi: ' + e.message, 9000);
      if (e.status === 401) { store.clear(); canSave = false; askKey('Anahtarın süresi dolmuş, yenisini yapıştır.'); }
    }).then(function () { btn.disabled = false; updateBar(); });
  }

  // ---------- toolbar ----------
  var bar = h('div', { class: 'ed-bar', role: 'toolbar', 'aria-label': 'Düzenleme modu' });
  document.body.appendChild(bar);
  function updateBar() {
    var n = Object.keys(dirty).length;
    bar.innerHTML = '';
    bar.appendChild(h('span', {}, [h('b', { text: '✎ Düzenleme modu' }), h('span', { class: 'ed-hint', text: ' · ' + (lang() === 'tr' ? 'Türkçe' : 'English') + ' yazıları' })]));
    bar.appendChild(h('button', { class: 'ed-btn', text: 'Listeler', onclick: function () { panel.hidden = !panel.hidden; if (!panel.hidden) drawPanel(); updateBar(); } }));
    bar.appendChild(h('button', { class: 'ed-btn', text: canSave ? 'Anahtar ✓' : 'Anahtar', title: canSave ? 'Anahtarı bu cihazdan sil' : 'GitHub anahtarı gir', onclick: function () {
      if (canSave && confirm('Anahtar bu cihazdan silinsin mi?')) { store.clear(); token = ''; canSave = false; updateBar(); }
      else if (!canSave) askKey();
    } }));
    bar.appendChild(h('button', { class: 'ed-btn', text: 'Çık', onclick: function () {
      if (n && !confirm('Kaydedilmemiş değişiklikler silinecek. Çıkılsın mı?')) return;
      dirty = {}; location.href = location.pathname;
    } }));
    bar.appendChild(h('button', { id: 'edSave', class: 'ed-btn ed-main', text: n ? 'Kaydet (' + n + ' dosya)' : 'Kaydedildi', onclick: save }));
    bar.lastChild.disabled = !n;
    document.body.classList.toggle('ed-panel-open', !panel.hidden);
  }
  addEventListener('beforeunload', function (e) { if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; } });
  // The TR/EN button re-labels the bar; texts already follow because applyLang reads the edited values.
  $('#langBtn').addEventListener('click', function () { setTimeout(updateBar, 0); });

  // ---------- start ----------
  SITE.onRender = bind;
  updateBar();
  var waitForContent = function (tries) {
    if (FILES.every(function (f) { return SITE.data[f]; }) || tries > 40) { bind(); return; }
    setTimeout(function () { waitForContent(tries + 1); }, 100);
  };
  waitForContent(0);
  var saved = store.get();
  if (saved) connect(saved).catch(function (e) { store.clear(); askKey(e.message); });
  else askKey();
})();
