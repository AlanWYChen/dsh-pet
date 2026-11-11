const moods = {
  sleeping: { image: 'active/sleeping.png', eyebrow: 'OFF DUTY', message: '先睡一小会儿…', detail: "I'll wake up when your reply is ready.", status: 'Sleeping, but listening', alt: 'Blue whale girl sleeping' },
  thinking: { image: 'active/thinking.png', eyebrow: 'DEEP IN THOUGHT', message: '正在努力思考…', detail: 'You do your thing. I’ll keep watch.', status: 'Your chat is working', alt: 'Blue whale girl thinking' },
  done: { image: 'active/complete.png', eyebrow: 'A LITTLE SOMETHING FOR YOU', message: '回答好啦，快来看看！', detail: 'Your reply is ready. Click to open DSH.', status: 'Reply ready · click above to open', alt: 'Winking blue whale girl wearing a deer hat' },
  permission: { image: 'active/permission.png', eyebrow: 'YOUR PERMISSION, PLEASE', message: '这一步，要你点头…', detail: 'Permission needed. Click to review in DSH.', status: 'Waiting for your approval', alt: 'Blue whale girl pausing her thoughts to ask for permission' },
  hungry: { image: 'active/hungry.png', eyebrow: 'RICE, PLEASE', message: '饿饿，想吃白米饭…', detail: 'This turn reached its token limit.', status: 'Token limit reached', alt: 'Blue whale girl asking for rice' },
  'low-balance': { image: 'active/hungry.png', eyebrow: 'RUNNING LOW', message: '钱包快见底啦…', detail: 'Your DeepSeek balance is low. Top up to keep swimming.', status: 'Balance low · click above to top up', alt: 'Blue whale girl asking for more credit' },
  error: { image: 'active/hungry.png', eyebrow: 'A LITTLE HICCUP', message: '这次没游到终点…', detail: 'Your chat stopped. Open DSH to check.', status: 'Chat needs attention', alt: 'Concerned blue whale girl' }
};
const petElement = document.getElementById('pet');
const ocean = document.querySelector('.ocean');
const notification = document.getElementById('notification');
const alertStates = new Set(['done', 'permission', 'hungry', 'error', 'low-balance']);
let currentState = 'sleeping';
let interacting = false;
let dismissed = false;
let audioContext;

function isAlert() {
  return alertStates.has(currentState);
}
function updateBubble() {
  notification.hidden = dismissed || (!isAlert() && !interacting);
  if (isAlert() && !dismissed) petElement.dataset.alert = 'true';
  else delete petElement.dataset.alert;
}
// One short renderer-generated chime per alert. Never throws: the protected
// renderer test runs without any AudioContext, and autoplay policies may reject.
function playChime() {
  try {
    const Audio = typeof AudioContext !== 'undefined' ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!Audio) return;
    if (audioContext && audioContext.state === 'closed') audioContext = null;
    if (!audioContext) audioContext = new Audio();
    if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      try {
        const resumed = audioContext.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      } catch {}
    }
    const now = typeof audioContext.currentTime === 'number' ? audioContext.currentTime : 0;
    const gain = audioContext.createGain();
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  } catch { /* audio is a nicety, the alert must still be visible */ }
}
function render(event) {
  currentState = Object.prototype.hasOwnProperty.call(moods, event.state) ? event.state : 'sleeping';
  const mood = moods[currentState];
  petElement.dataset.state = currentState;
  const img = document.getElementById('character');
  img.src = `../assets/${mood.image}`; img.alt = mood.alt;
  for (const key of ['eyebrow', 'message', 'detail']) document.getElementById(key).textContent = mood[key];
  if (event.title && ['done', 'error', 'low-balance'].includes(currentState)) {
    document.getElementById('detail').textContent = event.title;
  }
  dismissed = false;
  updateBubble();
  if (isAlert() && event.sound !== false) playChime();
  window.pet?.rendered?.(currentState);
}
ocean.addEventListener('pointerenter', () => { interacting = true; dismissed = false; updateBubble(); });
petElement.addEventListener('pointerleave', () => { interacting = petElement.contains(document.activeElement); updateBubble(); });
petElement.addEventListener('focusin', () => { interacting = true; dismissed = false; updateBubble(); });
petElement.addEventListener('focusout', event => { interacting = petElement.contains(event.relatedTarget) || ocean.matches(':hover'); updateBubble(); });
document.getElementById('menu').onclick = () => window.pet?.menu();
document.getElementById('bubble').onclick = () => window.pet?.open();
document.getElementById('ack').onclick = () => { dismissed = true; updateBubble(); window.pet?.acknowledge(); };
document.addEventListener('contextmenu', event => { event.preventDefault(); window.pet?.menu(); });
window.pet?.onEvent(render);
