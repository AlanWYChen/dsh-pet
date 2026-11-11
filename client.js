window.__ModuleLoader__.load({
  id: 'dsh-desktop-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // The same whale-tail artwork as the plugin icon, sized for the Settings nav.
    const SECTION_ICON = 'data:image/png;base64,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';
    const BALANCE_SYMBOLS = { CNY: '¥', USD: '$' };
    function formatBalance(value, t) {
      if (!value || value.status !== 'ready' || typeof value.amount !== 'number'
          || !Number.isFinite(value.amount)) return t('balanceUnavailable');
      if (!BALANCE_SYMBOLS[value.currency]) return t('balanceUnavailable');
      return `${BALANCE_SYMBOLS[value.currency]}${value.amount.toFixed(2)}`;
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const dictionaries = {
          en: { title: 'Desktop Pet', detail: 'Owned by this DSH instance. Closing a tab keeps it running.', on: 'Running', off: 'Stopped', start: 'Start', stop: 'Stop', busy: 'Updating…', failed: 'Could not update desktop pet', retry: 'Retry', loading: 'Loading…', debugMode: 'Debug mode', debugDetail: 'Show mood previews and the test notification in the pet menu.', balance: 'Balance', threshold: 'Low-balance threshold', sound: 'Sound', testNotification: 'Test notification', balanceUnavailable: 'Unavailable' },
          zh: { title: '桌面宠物', detail: '由当前 DSH 实例管理，关闭标签页不会停止。', on: '运行中', off: '已停止', start: '启动', stop: '停止', busy: '正在更新…', failed: '无法更新桌面宠物', retry: '重试', loading: '正在加载…', debugMode: '调试模式', debugDetail: '在宠物菜单中显示状态预览和通知测试。', balance: '余额', threshold: '低余额提醒阈值', sound: '提示音', testNotification: '测试通知', balanceUnavailable: '暂不可用' },
        };
        for (const [language, dictionary] of Object.entries(dictionaries))
          ctx.effect(() => ctx.locale.register('desktop-pet', language, dictionary));
        const t = ctx.locale.bind('desktop-pet');
        function PetSetting() {
          React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
          const [status, setStatus] = React.useState(null);
          const [busy, setBusy] = React.useState(false);
          const [error, setError] = React.useState('');
          const [debugMode, setDebugMode] = React.useState(null);
          const [debugBusy, setDebugBusy] = React.useState(false);
          const [debugError, setDebugError] = React.useState('');
          const [balance, setBalance] = React.useState(null);
          const [threshold, setThreshold] = React.useState(null);
          const [sound, setSound] = React.useState(true);
          const mounted = React.useRef(true);
          async function post(action, value) {
            const body = value === undefined ? { action } : { action, value };
            const response = await fetch('/api/deepseek-pet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error(t('failed'));
            return response.json();
          }
          async function update(action) {
            setBusy(true); setError('');
            try {
              const response = await fetch('/api/deepseek-pet', action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) } : { cache: 'no-store' });
              if (!response.ok) throw new Error(t('failed'));
              const value = await response.json();
              if (mounted.current) { setStatus(value); setError(value.error || ''); }
            } catch { if (mounted.current) setError(t('failed')); }
            finally { if (mounted.current) setBusy(false); }
          }
          async function updateDebug(action = 'debug-status') {
            setDebugBusy(true); setDebugError('');
            try {
              const response = await fetch('/api/deepseek-pet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
              if (!response.ok) throw new Error(t('failed'));
              const value = await response.json();
              if (mounted.current) { setDebugMode(value.debugMode === true); setDebugError(value.error || ''); }
            } catch { if (mounted.current) setDebugError(t('failed')); }
            finally { if (mounted.current) setDebugBusy(false); }
          }
          async function loadBalance() {
            try {
              const value = await post('balance');
              if (!mounted.current) return;
              setBalance(value?.balance ?? null);
              if (Number.isFinite(value?.threshold?.amount)) setThreshold(value.threshold.amount);
            } catch { if (mounted.current) setBalance(null); }
          }
          function saveThreshold(raw) {
            const amount = Number(raw);
            if (!Number.isFinite(amount) || amount <= 0) return;
            setThreshold(amount);
            return post('set-threshold', { currency: 'CNY', amount }).catch(() => {});
          }
          function saveSound(checked) {
            const value = checked === true;
            setSound(value);
            return post('set-sound', value).catch(() => {});
          }
          function testNotification() {
            return post('test-notification').catch(() => {});
          }
          React.useEffect(() => {
            mounted.current = true; update(); updateDebug(); loadBalance();
            const refresh = () => { update(); updateDebug(); loadBalance(); };
            window.addEventListener('focus', refresh);
            return () => { mounted.current = false; window.removeEventListener('focus', refresh); };
          }, []);
          return h('div', { className: 'dsp-page' },
            h('style', null, '.dsp-page{display:flex;flex-direction:column;gap:16px}.dsp-setting{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:20px}.dsp-setting p{margin:4px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.dsp-setting button{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 14px;min-height:36px;white-space:nowrap;cursor:pointer}.dsp-setting button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}.dsp-setting button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.dsp-setting button:disabled{opacity:.6;cursor:wait}.dsp-setting .dsp-error{color:var(--dsw-alias-state-error-primary)}.dsp-setting input[type=checkbox]{width:18px;height:18px;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}.dsp-setting input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.dsp-setting input[type=number]{width:96px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 10px;min-height:36px;margin-top:8px}.dsp-actions{display:flex;align-items:center;gap:12px;flex:none}'),
            h('div', { className: 'dsp-setting' },
            h('div', null, h('div', null, t('title')), h('p', null, t('detail')), status && h('p', { role: 'status' }, status.running ? t('on') : t('off')), error && h('p', { className: 'dsp-error', role: 'alert' }, error)),
            h('button', { type: 'button', disabled: busy, onClick: () => update(!status ? undefined : status.running ? 'disable' : 'enable') }, busy ? t('busy') : !status ? t('retry') : status.running ? t('stop') : t('start'))),
            h('div', { className: 'dsp-setting' },
              h('div', null, h('label', { htmlFor: 'dsp-debug-mode' }, t('debugMode')), h('p', null, t('debugDetail')), debugError && h('p', { className: 'dsp-error', role: 'alert' }, debugError)),
              h('input', { id: 'dsp-debug-mode', type: 'checkbox', 'aria-label': t('debugMode'), checked: debugMode === true, disabled: debugMode === null || debugBusy, onChange: event => updateDebug(event.target.checked ? 'debug-enable' : 'debug-disable') })),
            h('div', { className: 'dsp-setting' },
              h('div', null,
                h('div', null, t('balance')),
                h('p', { role: 'status' }, formatBalance(balance, t)),
                h('label', { htmlFor: 'dsp-threshold' }, t('threshold')),
                h('input', { id: 'dsp-threshold', type: 'number', min: 0.01, step: 0.01, 'aria-label': t('threshold'), value: threshold == null ? '' : threshold, onChange: event => saveThreshold(event.target.value) }))),
            h('div', { className: 'dsp-setting' },
              h('div', null, h('label', { htmlFor: 'dsp-sound' }, t('sound'))),
              h('div', { className: 'dsp-actions' },
                h('input', { id: 'dsp-sound', type: 'checkbox', 'aria-label': t('sound'), checked: sound === true, onChange: event => saveSound(event.target.checked) }),
                h('button', { id: 'dsp-test-notification', type: 'button', onClick: testNotification }, t('testNotification')))));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'deepseek-desktop-pet', order: 46, label: () => t('title') }, PetSetting));
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register(
          { name: 'settings.section.icon', id: 'deepseek-desktop-pet', order: 46, label: () => t('title') },
          ({ size = 18, active } = {}) => h('img', {
            src: SECTION_ICON, width: size, height: size, alt: '', 'aria-hidden': 'true', draggable: false,
            style: { display: 'block', objectFit: 'contain', opacity: active ? 1 : 0.82 },
          })));
      },
    };
  },
});
