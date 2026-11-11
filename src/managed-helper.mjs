import { spawn as spawnProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mainPath = fileURLToPath(new URL('./main.cjs', import.meta.url));
const { loadConfig, saveConfig } = require('./config.cjs');

/** One DSH-owned Electron pet. Browser connections do not own its lifetime. */
export class ManagedPet {
  constructor({ url, spawn = spawnProcess, readyTimeout = 10_000, stopTimeout = 1_500, configFile } = {}) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('Expected an HTTP(S) DSH URL');
    this.url = parsed.href;
    this.spawn = spawn;
    this.readyTimeout = readyTimeout;
    this.stopTimeout = stopTimeout;
    // When omitted the helper keeps today's in-memory behavior: no disk I/O at all.
    this.configFile = configFile || undefined;
    this.config = null;
    this.sound = true;
    this.enabled = false;
    this.running = false;
    this.error = undefined;
    this.child = null;
    this.disposed = false;
    this.queue = Promise.resolve();
    this.stopping = new WeakSet();
    this.delivery = { lastState: null, sent: 0, received: 0 };
    this.debugMode = false;
  }

  readConfig() {
    if (!this.configFile) return null;
    try {
      const config = loadConfig({ file: this.configFile });
      this.config = config;
      this.sound = config.sound;
      return config;
    } catch { return null; }
  }

  persist(patch) {
    if (!this.configFile) return;
    try {
      const base = this.config || loadConfig({ file: this.configFile });
      const next = saveConfig({ ...base, ...patch }, { file: this.configFile });
      this.config = next;
      this.sound = next.sound;
    } catch { this.error = 'Pet configuration save failed'; }
  }

  /** Start the helper exactly once from the saved enabled state (host boot). */
  async autoStart() {
    const operation = this.queue.then(async () => {
      if (this.disposed) return this.status();
      if (!this.configFile) return this.status();
      const config = this.readConfig();
      if (!config || !config.enabled) {
        if (!this.running) this.enabled = false;
        return this.status();
      }
      this.enabled = true;
      if (this.running) return this.status();
      await this.start();
      return this.status();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  status() {
    return { enabled: this.enabled, running: this.running, ...(this.error ? { error: this.error } : {}) };
  }

  diagnostics() { return { ...this.delivery }; }

  debugStatus() { return { debugMode: this.debugMode }; }

  setDebugMode(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Debug mode must be a boolean');
    this.debugMode = enabled;
    if (this.running && this.child?.connected) {
      try {
        this.child.send({ type: 'pet:config', debugMode: enabled }, error => {
          if (error) this.error = 'Pet configuration send failed';
        });
      } catch { this.error = 'Pet configuration send failed'; }
    }
    return this.debugStatus();
  }

  /** Push a runtime setting to a running helper; a stopped pet just ignores it. */
  sendConfig(patch) {
    const child = this.child;
    if (!this.running || !child?.connected) return false;
    try {
      child.send({ type: 'pet:config', ...patch }, error => {
        if (error && this.child === child) this.error = 'Pet configuration send failed';
      });
      return true;
    } catch { this.error = 'Pet configuration send failed'; return false; }
  }

  /** Persist the sound setting and apply it to the running helper immediately. */
  setSound(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Sound must be a boolean');
    this.sound = enabled;
    if (this.config) this.config = { ...this.config, sound: enabled };
    if (this.configFile) this.persist({ sound: enabled });
    this.sendConfig({ sound: enabled });
    return { sound: enabled };
  }

  /** Persist the low-balance threshold used by the host-side watcher. */
  setBalanceThreshold(threshold) {
    if (!threshold || typeof threshold !== 'object' || Array.isArray(threshold)
        || threshold.currency !== 'CNY' || !Number.isFinite(threshold.amount) || threshold.amount <= 0) {
      throw new TypeError('Balance threshold must be a positive CNY amount');
    }
    const value = { currency: 'CNY', amount: threshold.amount };
    if (this.config) this.config = { ...this.config, balanceThreshold: value };
    if (this.configFile) this.persist({ balanceThreshold: value });
    return { balanceThreshold: value };
  }

  setEnabled(enabled) {
    const operation = this.queue.then(async () => {
      if (this.disposed) return this.status();
      this.enabled = Boolean(enabled);
      if (this.configFile) {
        this.readConfig();
        this.persist({ enabled: this.enabled });
      }
      if (this.enabled) await this.start();
      else { await this.stop(); this.error = undefined; }
      return this.status();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async start() {
    if (this.child && this.running) return;
    if (this.child) await this.stop();
    this.error = undefined;
    try {
      const config = this.configFile ? (this.config || this.readConfig()) : null;
      const env = { ...process.env, DSH_PET_MANAGED: '1', DSH_PET_URL: this.url, DSH_PET_DEBUG: this.debugMode ? '1' : '0',
        DSH_PET_SOUND: config && config.sound === false ? '0' : '1' };
      if (config && config.position) {
        env.DSH_PET_POSITION = JSON.stringify({ x: config.position.x, y: config.position.y });
      }
      delete env.ELECTRON_RUN_AS_NODE;
      const child = this.spawn(require('electron'), [mainPath], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      this.child = child;
      this.delivery.lastState = null;
      const onState = message => {
        if (this.child !== child || message?.type !== 'pet:state'
            || !['sleeping', 'thinking', 'done', 'permission', 'hungry', 'error'].includes(message.state)) return;
        this.delivery.lastState = message.state;
        this.delivery.received++;
      };
      const onPosition = message => {
        if (this.child !== child || message?.type !== 'pet:position') return;
        if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
        this.persist({ position: { x: Math.round(message.x), y: Math.round(message.y) } });
      };
      child.on('message', onState);
      child.on('message', onPosition);
      child.once('exit', () => { child.off('message', onState); child.off('message', onPosition); });
      child.stderr?.resume();
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          child.off('message', onMessage);
          error ? reject(error) : resolve();
        };
        const onMessage = message => {
          if (message?.type === 'ready' && this.child === child && child.connected) {
            this.running = true;
            // A setting can change while the window is still loading.
            if (this.debugMode !== (env.DSH_PET_DEBUG === '1')) this.setDebugMode(this.debugMode);
            finish();
          }
        };
        const fail = message => {
          if (this.child === child) {
            this.running = false;
            if (!this.stopping.has(child)) this.error = message;
          }
          finish(new Error(message));
        };
        const timer = setTimeout(() => finish(new Error('Pet startup timed out')), this.readyTimeout);
        child.on('message', onMessage);
        // Keep an error handler for the child's entire lifetime (EventEmitter's
        // unhandled error otherwise terminates the Harness).
        child.on('error', () => fail('Pet process failed'));
        child.once('exit', () => {
          fail(settled ? 'Pet process exited' : 'Pet exited before ready');
          if (this.child === child) this.child = null;
        });
        child.once('disconnect', () => fail('Pet IPC disconnected'));
      });
    } catch (error) {
      const message = ['Pet startup timed out', 'Pet exited before ready', 'Pet IPC disconnected'].includes(error.message)
        ? error.message : 'Pet process failed';
      await this.stop();
      this.error = message;
    }
  }

  send(notification) {
    const child = this.child;
    if (!this.running || !child?.connected) return false;
    try {
      child.send({ type: 'pet:event', event: notification }, error => {
        if (error && this.child === child) this.error = 'Pet IPC send failed';
      });
      this.delivery.sent++;
      return true;
    } catch { this.error = 'Pet IPC send failed'; return false; }
  }

  async stop() {
    const child = this.child;
    this.running = false;
    if (!child) return;
    this.stopping.add(child);
    await new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off('exit', done);
        resolve();
      };
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} done(); }, this.stopTimeout);
      child.once('exit', done);
      if (child.exitCode != null || child.signalCode != null) { done(); return; }
      try {
        if (child.connected) child.send({ type: 'shutdown' }, error => { if (error) { try { child.kill(); } catch {} } });
        else child.kill();
      } catch { try { child.kill(); } catch {} }
    });
    if (this.child === child) this.child = null;
  }

  async dispose() {
    // Disarm immediately, including enable calls already queued but not started.
    this.disposed = true;
    const operation = this.queue.then(async () => {
      this.enabled = false;
      await this.stop();
      this.error = undefined;
    });
    this.queue = operation.catch(() => {});
    await operation;
  }
}
