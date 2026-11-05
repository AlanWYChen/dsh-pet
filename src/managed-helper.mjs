import { spawn as spawnProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mainPath = fileURLToPath(new URL('./main.cjs', import.meta.url));

/** One DSH-owned Electron pet. Browser connections do not own its lifetime. */
export class ManagedPet {
  constructor({ url, spawn = spawnProcess, readyTimeout = 10_000, stopTimeout = 1_500 }) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('Expected an HTTP(S) DSH URL');
    this.url = parsed.href;
    this.spawn = spawn;
    this.readyTimeout = readyTimeout;
    this.stopTimeout = stopTimeout;
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

  setEnabled(enabled) {
    const operation = this.queue.then(async () => {
      if (this.disposed) return this.status();
      this.enabled = Boolean(enabled);
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
      const env = { ...process.env, DSH_PET_MANAGED: '1', DSH_PET_URL: this.url, DSH_PET_DEBUG: this.debugMode ? '1' : '0' };
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
      child.on('message', onState);
      child.once('exit', () => child.off('message', onState));
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
