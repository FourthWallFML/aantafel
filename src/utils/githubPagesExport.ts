import { Recipe, RecurringItem, UserProfile } from '../types';

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

async function resolveImageToDataUrl(src: string): Promise<string> {
  if (!src) return '';
  if (src.startsWith('data:image/')) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

export function downloadManifestJson(profile: UserProfile) {
  const manifest = {
    id: './',
    name: `${profile.cookbookTitle || 'Aan Tafel!'} — Familiekookboek`,
    short_name: 'Aan Tafel!',
    description: profile.cookbookSubtitle || 'Familiekookboek en boodschappenlijst',
    start_url: './index.html',
    scope: './',
    display: 'standalone',
    theme_color: '#1C3454',
    background_color: '#F8F5EF',
    icons: [
      {
        src: './pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: './pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
  triggerDownload('manifest.json', JSON.stringify(manifest, null, 2), 'application/manifest+json');
}

export function downloadServiceWorkerJs() {
  const swCode = `// Aan Tafel! Service Worker (sw.js) voor GitHub Pages offline ondersteuning
const CACHE_NAME = 'aantafel-v1';
const CORE_ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
`;
  triggerDownload('sw.js', swCode, 'application/javascript');
}

export function downloadGithubActionsWorkflow() {
  const yaml = `name: Publiceer Aan Tafel! op GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Code ophalen
        uses: actions/checkout@v4

      - name: Node.js instellen
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: GitHub Pages configureren
        uses: actions/configure-pages@v5

      - name: Afhankelijkheden installeren
        run: npm install --legacy-peer-deps

      - name: Bouwen voor GitHub Pages
        env:
          VITE_BASE_PATH: /\${{ github.event.repository.name }}/
        run: npm run build

      - name: Artefact uploaden
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Publiceren op GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;
  triggerDownload('deploy.yml', yaml, 'text/yaml');
}

export async function downloadStandaloneIndexHtml(
  recipes: Recipe[],
  profile: UserProfile
): Promise<void> {
  const embeddedRecipes = await Promise.all(
    recipes.map(async (r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      story: r.story,
      category: r.category,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      servings: r.servings,
      authorName: r.authorName,
      coverImage: await resolveImageToDataUrl(r.coverImage),
      ingredients: r.ingredients,
      steps: r.steps,
      notes: r.notes,
    }))
  );

  const logoMarkDataUrl = await resolveImageToDataUrl(`${import.meta.env.BASE_URL}logo-aantafel-mark.png`);

  const safeTitle = escapeHtml(profile.cookbookTitle || 'Aan Tafel!');
  const safeSubtitle = escapeHtml(profile.cookbookSubtitle || 'Verzameld aan de keukentafel');
  const safeFamily = escapeHtml(profile.familyName || 'Familie-editie');

  const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <meta name="theme-color" content="#1C3454" />
  <link rel="manifest" href="./manifest.json" />
  <style>
    :root { --bg:#fafafa; --ink:#111315; --navy:#1c3454; --muted:#52525b; --line:#e4e4e7; --accent:#14532d; --amber:#92400e; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--ink); line-height:1.55; }
    header { position:sticky; top:0; z-index:10; background:rgba(250,250,250,0.95); backdrop-filter:blur(6px); border-bottom:1px solid var(--line); }
    .wrap { max-width:1100px; margin:0 auto; padding:0 20px; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:60px; flex-wrap:wrap; padding:10px 0; }
    .brand { display:inline-flex; align-items:center; gap:10px; font-size:20px; font-weight:700; letter-spacing:-0.02em; color:var(--navy); }
    .brand img { height:34px; width:auto; display:block; }
    .tabs { display:flex; gap:12px; }
    .tab { border:0; background:none; padding:6px 10px; font-size:14px; font-weight:600; color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; }
    .tab.active { color:var(--ink); border-bottom-color:var(--accent); }
    .hero { background:#fff; border:1px solid var(--line); border-radius:16px; padding:28px; margin:24px 0; }
    .hero h1 { margin:6px 0 8px; font-size:30px; line-height:1.15; }
    .hero p { margin:0; color:var(--muted); max-width:65ch; }
    .controls { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-bottom:20px; }
    .cats { display:flex; gap:6px; flex-wrap:wrap; }
    .cat { border:1px solid var(--line); background:#fff; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; color:#3f3f46; }
    .cat.active { background:#111315; color:#fff; border-color:#111315; }
    input[type="search"] { padding:8px 12px; border:1px solid var(--line); border-radius:8px; min-width:240px; font-size:14px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:20px; }
    .card { background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; }
    .card img { width:100%; aspect-ratio:4/3; object-fit:cover; display:block; background:#f4f4f5; }
    .card-body { padding:16px; flex:1; display:flex; flex-direction:column; justify-content:space-between; gap:12px; }
    .meta { font-size:12px; color:var(--muted); }
    .meta strong { color:var(--accent); }
    .card h2 { margin:4px 0 6px; font-size:18px; line-height:1.25; cursor:pointer; }
    .btn { border:0; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:600; cursor:pointer; }
    .btn-primary { background:var(--accent); color:#fff; }
    .btn-soft { background:#f4f4f5; color:var(--ink); }
    .detail { background:#fff; border:1px solid var(--line); border-radius:16px; padding:28px; margin:20px 0; }
    .spread { display:grid; grid-template-columns:260px 1fr; gap:32px; margin-top:20px; }
    @media (max-width:760px) { .spread { grid-template-columns:1fr; } }
    .ing-list { list-style:none; padding:0; margin:14px 0 0; font-size:13.5px; line-height:1.45; }
    .ing-list li { margin-bottom:7px; padding-left:12px; text-indent:-12px; font-weight:400; color:#3f3f46; }
    .ing-list li strong { font-weight:700; color:#121212; }
    .story { font-style:italic; color:#18181b; margin-top:0; }
    .steps p { margin:0 0 12px; }
    .list-cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
    .box { background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px; }
    .shop-row { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f4f4f5; font-size:14px; }
    .shop-row.done { text-decoration:line-through; color:#a1a1aa; }
    @media print { header, .no-print { display:none !important; } body { background:#fff; } .detail { border:0; padding:0; } }
  </style>
</head>
<body>
  <header class="no-print">
    <div class="wrap topbar">
      <div class="brand">${logoMarkDataUrl ? `<img src="${logoMarkDataUrl}" alt="Aan Tafel!" />` : ''}${safeTitle}</div>
      <div class="tabs">
        <button class="tab active" id="tab-book" onclick="setView('book')">Kookboek</button>
        <button class="tab" id="tab-shop" onclick="setView('shop')">Boodschappen (<span id="shop-count">0</span>)</button>
      </div>
    </div>
  </header>
  <main class="wrap" id="app"></main>
  <script>
    const META = { title: ${safeJsonForScript(profile.cookbookTitle || 'Ons Familiekookboek')}, subtitle: ${safeJsonForScript(profile.cookbookSubtitle || '')}, family: ${safeJsonForScript(profile.familyName || 'Familie-editie')} };
    const RECIPES = ${safeJsonForScript(embeddedRecipes)};
    let view = 'book', activeCat = 'Alle', query = '', openId = null;
    let selectedIds = JSON.parse(localStorage.getItem('tfb_sel') || '[]');
    let checkedKeys = JSON.parse(localStorage.getItem('tfb_chk') || '[]');

    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function saveState(){
      localStorage.setItem('tfb_sel', JSON.stringify(selectedIds));
      localStorage.setItem('tfb_chk', JSON.stringify(checkedKeys));
      document.getElementById('shop-count').textContent = selectedIds.length;
    }
    function setView(v){ view = v; openId = null; render(); }
    function toggleSel(id){
      selectedIds = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
      saveState(); render();
    }
    function toggleChk(key){
      checkedKeys = checkedKeys.includes(key) ? checkedKeys.filter(x => x !== key) : [...checkedKeys, key];
      saveState(); render();
    }
    function openRecipe(id){ openId = id; render(); window.scrollTo({top:0,behavior:'smooth'}); }

    function render(){
      document.getElementById('tab-book').className = 'tab' + (view === 'book' ? ' active' : '');
      document.getElementById('tab-shop').className = 'tab' + (view === 'shop' ? ' active' : '');
      document.getElementById('shop-count').textContent = selectedIds.length;
      const root = document.getElementById('app');

      if (openId) {
        const r = RECIPES.find(x => x.id === openId);
        if (!r) { openId = null; return render(); }
        root.innerHTML = \`
          <div class="no-print" style="margin-top:20px;display:flex;gap:10px;justify-content:space-between;">
            <button class="btn btn-soft" onclick="openId=null;render()">← Terug naar kookboek</button>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-soft" onclick="window.print()">Afdrukken</button>
              <button class="btn btn-primary" onclick="toggleSel('\${esc(r.id)}')">\${selectedIds.includes(r.id) ? '✓ Op boodschappenlijst' : '+ Op boodschappenlijst'}</button>
            </div>
          </div>
          <article class="detail">
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;">\${esc(r.category)}</div>
            <h1 style="margin:6px 0 12px;font-size:32px;line-height:1.12;">\${esc(r.title)}</h1>
            <hr style="border:0;border-top:1px solid #d4d4d8;margin:0;" />
            <div class="spread">
              <div>
                <div style="font-size:13px;font-weight:700;">Voor \${r.servings} \${r.servings === 1 ? 'persoon' : 'personen'}</div>
                <div style="font-size:13px;color:#52525b;">Voorbereiden: \${r.prepMinutes} minuten</div>
                <div style="font-size:13px;color:#52525b;">Bereiden: \${r.cookMinutes} minuten</div>
                <ul class="ing-list">
                  \${(r.ingredients||[]).map(i => {
                    const base = [i.amount, i.unit, i.name].filter(Boolean).join(' ');
                    const prep = (i.preparation || '').trim();
                    return \`<li><strong>\${esc(base)}\${prep ? ',' : ''}</strong>\${prep ? ' ' + esc(prep) : ''}</li>\`;
                  }).join('')}
                </ul>
              </div>
              <div>
                \${r.subtitle ? \`<p class="story">\${esc(r.subtitle)}</p>\` : ''}
                \${r.story ? \`<p class="story">\${esc(r.story)}</p>\` : ''}
                <div class="steps">
                  \${(r.steps||[]).map((s, idx) => \`<p><strong>\${idx+1}.</strong> \${esc(s)}</p>\`).join('')}
                </div>
                \${r.notes ? \`<p style="font-size:13.5px;font-style:italic;color:#52525b;border-top:1px solid #e4e4e7;padding-top:12px;">\${esc(r.notes)}</p>\` : ''}
                \${r.coverImage ? \`<p style="font-size:13px;font-style:italic;color:#52525b;margin-top:16px;"><a href="#standalone-photo" style="color:inherit;text-decoration:none;">Foto op bladzijde 2 ↓</a></p>\` : ''}
              </div>
            </div>
            \${r.coverImage ? \`<div id="standalone-photo" style="margin-top:28px;padding-top:24px;border-top:1px solid #e4e4e7;"><img src="\${r.coverImage}" alt="\${esc(r.title)}" style="width:100%;max-height:460px;object-fit:cover;display:block;" /></div>\` : ''}
          </article>\`;
        return;
      }

      if (view === 'shop') {
        const chosen = RECIPES.filter(r => selectedIds.includes(r.id));
        const buckets = { vers: [], proviandkast: [], diepvries: [], bakkerij: [] };
        chosen.forEach(r => (r.ingredients||[]).forEach(i => {
          const cat = buckets[i.storageCategory] ? i.storageCategory : 'proviandkast';
          const key = cat + ':' + (i.name||'').toLowerCase().trim();
          const existing = buckets[cat].find(x => x.key === key);
          const qty = [i.amount, i.unit].filter(Boolean).join(' ');
          if (existing) existing.qtys.push(qty);
          else buckets[cat].push({ key, name: i.name, qtys: qty ? [qty] : [] });
        }));
        const labels = { vers: 'Vers te kopen', proviandkast: 'In de voorraad (checken)', diepvries: 'Diepvries', bakkerij: 'Bakkerij & Overig' };
        root.innerHTML = \`
          <div class="hero">
            <div class="meta"><strong>Boodschappenlijst</strong> · \${chosen.length} gerechten geselecteerd</div>
            <h1>Weekboodschappen</h1>
            <p>Selecteer gerechten in het kookboek om je lijst automatisch op te splitsen tussen vers en voorraad.</p>
          </div>
          <div class="list-cols">
            \${Object.keys(buckets).filter(k => buckets[k].length > 0).map(k => \`
              <div class="box">
                <h3 style="margin:0 0 10px;font-size:15px;">\${labels[k]} (\${buckets[k].length})</h3>
                \${buckets[k].map(item => {
                  const done = checkedKeys.includes(item.key);
                  return \`<label class="shop-row \${done ? 'done' : ''}"><input type="checkbox" \${done ? 'checked' : ''} onchange="toggleChk('\${esc(item.key)}')" /> <span><strong>\${esc(item.name)}</strong> \${item.qtys.length ? '— ' + esc(item.qtys.join(' + ')) : ''}</span></label>\`;
                }).join('')}
              </div>\`).join('') || '<div class="box">Nog geen gerechten geselecteerd. Klik in het kookboek op "+ Lijst".</div>'}
          </div>\`;
        return;
      }

      const cats = ['Alle', ...Array.from(new Set(RECIPES.map(r => r.category)))];
      const filtered = RECIPES.filter(r => (activeCat === 'Alle' || r.category === activeCat) && (!query || (r.title + ' ' + r.subtitle + ' ' + (r.ingredients||[]).map(i=>i.name).join(' ')).toLowerCase().includes(query.toLowerCase())));
      root.innerHTML = \`
        <section class="hero">
          <div class="meta"><strong>\${esc(META.family)}</strong> · \${RECIPES.length} recepten · Offline beschikbaar</div>
          <h1>\${esc(META.title)}</h1>
          <p>\${esc(META.subtitle)}</p>
        </section>
        <div class="controls">
          <div class="cats">\${cats.map(c => \`<button class="cat \${c===activeCat?'active':''}" onclick="activeCat='\${esc(c)}';render()">\${esc(c)}</button>\`).join('')}</div>
          <input type="search" value="\${esc(query)}" placeholder="Zoek recept of ingrediënt..." oninput="query=this.value;render()" />
        </div>
        <div class="grid">
          \${filtered.map(r => \`
            <article class="card">
              \${r.coverImage ? \`<img src="\${r.coverImage}" alt="\${esc(r.title)}" onclick="openRecipe('\${esc(r.id)}')" style="cursor:pointer;" />\` : ''}
              <div class="card-body">
                <div>
                  <div class="meta"><strong>\${esc(r.category)}</strong> · \${esc(r.authorName)} · \${(r.prepMinutes||0)+(r.cookMinutes||0)} min</div>
                  <h2 onclick="openRecipe('\${esc(r.id)}')">\${esc(r.title)}</h2>
                  <p style="margin:0;font-size:13px;color:#52525b;">\${esc(r.subtitle)}</p>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid #f4f4f5;">
                  <button class="btn btn-soft" onclick="openRecipe('\${esc(r.id)}')">Lees recept</button>
                  <button class="btn \${selectedIds.includes(r.id)?'btn-primary':'btn-soft'}" onclick="toggleSel('\${esc(r.id)}')">\${selectedIds.includes(r.id)?'✓ Op lijst':'+ Lijst'}</button>
                </div>
              </div>
            </article>\`).join('')}
        </div>\`;
    }

    render();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  </script>
</body>
</html>`;

  triggerDownload('index.html', html, 'text/html;charset=utf-8');
}

export interface FullBackupPayload {
  exportedAt: string;
  version: number;
  profile: UserProfile;
  recipes: Recipe[];
  recurringItems: RecurringItem[];
}

export function downloadJsonBackup(
  profile: UserProfile,
  recipes: Recipe[],
  recurringItems: RecurringItem[]
) {
  const payload: FullBackupPayload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    profile,
    recipes,
    recurringItems,
  };
  const dateSlug = new Date().toISOString().slice(0, 10);
  triggerDownload(
    `aan-tafel-backup-${dateSlug}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
}
