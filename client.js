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
            h('style', null, '.dsp-page{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px}.dsp-setting{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px}.dsp-setting p{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.dsp-setting button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;white-space:nowrap}.dsp-setting button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dsp-setting button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dsp-setting button:disabled{opacity:.6;cursor:wait}.dsp-setting button.primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}.dsp-setting button.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.dsp-setting input[type=checkbox]{width:18px;height:18px;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}.dsp-setting input[type=number]{box-sizing:border-box;width:120px;height:32px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px}.dsp-setting input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dsp-actions{display:flex;align-items:center;gap:8px;flex:none}.dsp-value{font-size:14px;font-weight:510;line-height:22px;white-space:nowrap}'),
            h('div', { className: 'dsp-setting' },
            h('div', null, h('div', null, t('title')), h('p', null, t('detail')), status && h('p', { role: 'status' }, status.running ? t('on') : t('off')), error && h('p', { className: 'dsp-error', role: 'alert' }, error)),
            h('button', { type: 'button', disabled: busy, className: status && status.running ? undefined : 'primary', onClick: () => update(!status ? undefined : status.running ? 'disable' : 'enable') }, busy ? t('busy') : !status ? t('retry') : status.running ? t('stop') : t('start'))),
            h('div', { className: 'dsp-setting' },
              h('div', null, h('label', { htmlFor: 'dsp-debug-mode' }, t('debugMode')), h('p', null, t('debugDetail')), debugError && h('p', { className: 'dsp-error', role: 'alert' }, debugError)),
              h('input', { id: 'dsp-debug-mode', type: 'checkbox', 'aria-label': t('debugMode'), checked: debugMode === true, disabled: debugMode === null || debugBusy, onChange: event => updateDebug(event.target.checked ? 'debug-enable' : 'debug-disable') })),
            h('div', { className: 'dsp-setting' },
              h('div', null, h('div', null, t('balance'))),
              h('span', { className: 'dsp-value', role: 'status' }, formatBalance(balance, t))),
            h('div', { className: 'dsp-setting' },
              h('div', null, h('label', { htmlFor: 'dsp-threshold' }, t('threshold'))),
              h('input', { id: 'dsp-threshold', type: 'number', min: 0.01, step: 0.01, 'aria-label': t('threshold'), value: threshold == null ? '' : threshold, onChange: event => saveThreshold(event.target.value) })),
            h('div', { className: 'dsp-setting' },
              h('div', null, h('label', { htmlFor: 'dsp-sound' }, t('sound'))),
              h('div', { className: 'dsp-actions' },
                h('input', { id: 'dsp-sound', type: 'checkbox', 'aria-label': t('sound'), checked: sound === true, onChange: event => saveSound(event.target.checked) }),
                h('button', { id: 'dsp-test-notification', type: 'button', onClick: testNotification }, t('testNotification')))));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'deepseek-desktop-pet', order: 46, label: () => t('title') }, PetSetting));
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register(
          { name: 'settings.section.icon', id: 'deepseek-desktop-pet', order: 46, label: () => t('title') },
          ({ size = 18, active } = {}) => h('span', {
            'aria-hidden': 'true',
            style: {
              display: 'block', width: size, height: size, backgroundColor: 'currentColor',
              WebkitMaskImage: `url(${SECTION_ICON})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
              maskImage: `url(${SECTION_ICON})`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center',
              opacity: active ? 1 : 0.72,
            },
          })));
      },
    };
  },
});
