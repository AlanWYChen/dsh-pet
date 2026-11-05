window.__ModuleLoader__.load({
  id: 'deepseek-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const dictionaries = {
          en: { title: 'Pet', detail: 'Owned by this DSH instance. Closing a tab keeps it running.', on: 'Running', off: 'Stopped', start: 'Start', stop: 'Stop', busy: 'Updating…', failed: 'Could not update desktop pet', retry: 'Retry', loading: 'Loading…', debugMode: 'Debug mode', debugDetail: 'Show mood previews and the test notification in the pet menu.' },
          zh: { title: '大肥鱼', detail: '由当前 DSH 实例管理，关闭标签页不会停止。', on: '运行中', off: '已停止', start: '启动', stop: '停止', busy: '正在更新…', failed: '无法更新桌面宠物', retry: '重试', loading: '正在加载…', debugMode: '调试模式', debugDetail: '在宠物菜单中显示状态预览和通知测试。' },
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
          const mounted = React.useRef(true);
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
          React.useEffect(() => {
            mounted.current = true; update(); updateDebug();
            const refresh = () => { update(); updateDebug(); };
            window.addEventListener('focus', refresh);
            return () => { mounted.current = false; window.removeEventListener('focus', refresh); };
          }, []);
          return h('div', { className: 'dsp-page' },
            h('style', null, '.dsp-page{display:flex;flex-direction:column;gap:16px}.dsp-setting{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:20px}.dsp-setting p{margin:4px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.dsp-setting button{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 14px;min-height:36px;white-space:nowrap;cursor:pointer}.dsp-setting button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}.dsp-setting button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.dsp-setting button:disabled{opacity:.6;cursor:wait}.dsp-setting .dsp-error{color:var(--dsw-alias-state-error-primary)}.dsp-setting input[type=checkbox]{width:18px;height:18px;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}.dsp-setting input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}'),
            h('div', { className: 'dsp-setting' },
            h('div', null, h('div', null, t('title')), h('p', null, t('detail')), status && h('p', { role: 'status' }, status.running ? t('on') : t('off')), error && h('p', { className: 'dsp-error', role: 'alert' }, error)),
            h('button', { type: 'button', disabled: busy, onClick: () => update(!status ? undefined : status.running ? 'disable' : 'enable') }, busy ? t('busy') : !status ? t('retry') : status.running ? t('stop') : t('start'))),
            h('div', { className: 'dsp-setting' },
              h('div', null, h('label', { htmlFor: 'dsp-debug-mode' }, t('debugMode')), h('p', null, t('debugDetail')), debugError && h('p', { className: 'dsp-error', role: 'alert' }, debugError)),
              h('input', { id: 'dsp-debug-mode', type: 'checkbox', 'aria-label': t('debugMode'), checked: debugMode === true, disabled: debugMode === null || debugBusy, onChange: event => updateDebug(event.target.checked ? 'debug-enable' : 'debug-disable') })));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'deepseek-desktop-pet', order: 46, label: () => t('title') }, PetSetting));
      },
    };
  },
});
