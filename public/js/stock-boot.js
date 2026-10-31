// Starts the Stock & Dispatch app in the right mode. The app keeps everything in browser storage,
// so each mode gets its own copy of those entries:
//   viewer     a read-only copy of the published records, refreshed on every open
//   publisher  a draft on this computer, shared with everyone by pressing Publish
//   standalone the page opened as a file: the original behaviour
(async function () {
  const KEYS = ['colours', 'constructions', 'tracers', 'coils', 'dispatches', 'counters', 'bagconfig', 'bagtare', 'bagpacking', 'bagmanual'];
  const SYNCED = 'ppc_stock_synced';

  // Everything that changes a record. Viewers neither see these buttons nor can run them.
  const CHANGES = ['addManualBag', 'addOption', 'addPickedToCart', 'addSingleCoil', 'cancelBagEdit', 'clearAllData', 'clearAllDispatches', 'clearManualBags',
    'confirmDispatch', 'deleteCoil', 'deleteDispatchCoils', 'deleteDispatchGroup', 'deleteManualBag', 'deleteNonMovableCoil', 'deleteReturnedCoil',
    'deleteSelectedNonMovable', 'deleteSelectedReturned', 'deleteSelectedStock', 'deleteSessionCoil', 'editCoil', 'editDispatchGroup', 'editManualBag',
    'importAllExcel', 'importBagExcel', 'importDispatchExcel', 'importDispatchPDF', 'lockItemDetails', 'moveSelectedNonMovableToStock', 'moveSelectedToNonMovable',
    'moveSelectedToStock', 'recodeOldStock', 'redispatchSelected', 'removeFromCart', 'returnCoils', 'saveEditedCoil', 'unlockItemDetails'];

  const css = document.createElement('style');
  css.textContent = CHANGES.map(n => `.ppc-viewer [onclick^="${n}("]`)
    .concat(['.ppc-viewer [onclick*="ImportFile"]', '.ppc-viewer [onclick*="importAllFile"]', '.ppc-viewer [onclick^="downloadBagTemplate"]', '.ppc-viewer [onclick^="downloadDispatchTemplate"]',
      '.ppc-viewer [onclick^="exportBagImportExcel"]', '.ppc-viewer [onclick^="exportDispatchImportExcel"]', '.ppc-viewer nav.tabs button[data-page="dispatch"]', '.ppc-viewer .ppc-entry'])
    .join(',') + '{display:none!important}';
  document.head.appendChild(css);

  const get = (prefix, k) => { try { return localStorage.getItem(prefix + k); } catch (e) { return null; } };
  const raw = prefix => KEYS.map(k => get(prefix, k)).join('\u0001');
  const contents = prefix => {
    const out = {};
    KEYS.forEach(k => { const v = get(prefix, k); if (v !== null) { try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; } } });
    return out;
  };
  const replaceAll = (prefix, data) => KEYS.forEach(k => {
    const v = data ? data[k] : undefined;
    try {
      if (v === undefined) localStorage.removeItem(prefix + k);
      else localStorage.setItem(prefix + k, typeof v === 'string' ? v : JSON.stringify(v));
    } catch (e) { if (typeof v !== 'undefined') window.alert('These records are too large for this browser to hold.'); }
  });
  const readSynced = () => { try { return localStorage.getItem(SYNCED); } catch (e) { return null; } };
  const writeSynced = () => { try { localStorage.setItem(SYNCED, raw('pp_')); } catch (e) {} };

  function loadApp() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/stock-app.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('The app could not be loaded. Check the connection and reload.'));
      document.body.appendChild(s);
    });
  }

  try {
    const pub = await PPC.start();
    const published = pub && pub.stock ? pub.stock : null;
    let hasDraft = false;

    if (PPC.mode === 'viewer') {
      window.PPC_STOCK_PREFIX = 'ppview_';
      replaceAll('ppview_', published && published.data);
    } else if (PPC.mode === 'publisher') {
      const synced = readSynced();
      hasDraft = synced !== null ? raw('pp_') !== synced : get('pp_', 'coils') !== null;
      if (!hasDraft && published) replaceAll('pp_', published.data);
    }

    await loadApp();

    if (PPC.mode === 'publisher' && !hasDraft) writeSynced();
    if (PPC.mode === 'viewer') {
      CHANGES.forEach(n => { window[n] = () => {}; });
      ['bp_ropeSize', 'lockedCodeLabel', 'r_resin', 'i_resin'].forEach(id => {
        const el = document.getElementById(id), panel = el && el.closest('.panel');
        if (panel) panel.classList.add('ppc-entry');
      });
      document.querySelectorAll('#page-stockEntry .panel.no-print').forEach(p => p.classList.add('ppc-entry'));
    }
    if (PPC.mode !== 'standalone') {
      PPC.mountBar({
        discard() { try { localStorage.removeItem(SYNCED); } catch (e) {} replaceAll('pp_', null); location.reload(); },
        sets: [{
          id: 'stock',
          dirty: () => raw('pp_') !== readSynced(),
          source: () => 'Stock and dispatch records',
          payload: () => contents('pp_'),
          onPublished: writeSynced
        }]
      });
    }
  } catch (e) {
    console.error(e);
    window.alert(e.message);
  } finally {
    PPC.ready();
  }
})();
