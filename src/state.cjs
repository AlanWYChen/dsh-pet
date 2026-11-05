const STATES = new Set(['thinking', 'done', 'hungry', 'sleeping', 'error', 'permission', 'permission-resolved']);
function normalizeEvent(input) {
  if (!input || typeof input !== 'object' || !STATES.has(input.state)) throw new Error('Invalid pet state');
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  if (['permission', 'permission-resolved'].includes(input.state) && (!text(input.sessionId, 160) || !text(input.requestId, 200))) throw new Error('Permission events require sessionId and requestId');
  return { state: input.state, sessionId: text(input.sessionId, 160), title: text(input.title, 120), eventId: text(input.eventId, 200), requestId: text(input.requestId, 200), at: Date.now() };
}
class PetState {
  constructor() { this.active = new Map(); this.permissions = new Map(); this.seen = new Set(); this.current = normalizeEvent({ state: 'sleeping' }); }
  accept(input) {
    const event = normalizeEvent(input);
    if (event.eventId && this.seen.has(event.eventId)) return null;
    if (event.eventId) { this.seen.add(event.eventId); if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value); }
    const key = JSON.stringify([event.sessionId, event.requestId]);
    if (event.state === 'permission') {
      this.permissions.set(key, event);
      if (!this.active.has(event.sessionId)) this.active.set(event.sessionId, { ...event, state: 'thinking' });
    } else if (event.state === 'permission-resolved') {
      this.permissions.delete(key);
    } else if (event.state === 'thinking') {
      this.active.set(event.sessionId, event);
    } else {
      this.active.delete(event.sessionId);
      for (const [id, pending] of this.permissions) if (pending.sessionId === event.sessionId) this.permissions.delete(id);
    }
    // Sleeping describes this session ending, not every session being idle.
    // Keep another running turn visible after unrelated cleanup/disposal.
    const restingView = event.state === 'sleeping' && this.active.size > 0
      ? [...this.active.values()].at(-1) : event;
    this.current = [...this.permissions.values()].at(-1)
      || (event.state === 'permission-resolved' ? this.idle() : restingView);
    return event;
  }
  idle() {
    this.current = [...this.permissions.values()].at(-1) || [...this.active.values()].at(-1) || normalizeEvent({ state: 'sleeping' });
    return this.current;
  }
}
module.exports = { normalizeEvent, PetState };
