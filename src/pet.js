const moods = {
  sleeping: { image: 'active/sleeping.png', eyebrow: 'OFF DUTY', message: '先睡一小会儿…', detail: "I'll wake up when your reply is ready.", status: 'Sleeping, but listening', alt: 'Blue whale girl sleeping' },
  thinking: { image: 'active/thinking.png', eyebrow: 'DEEP IN THOUGHT', message: '正在努力思考…', detail: 'You do your thing. I’ll keep watch.', status: 'Your chat is working', alt: 'Blue whale girl thinking' },
  done: { image: 'active/complete.png', eyebrow: 'A LITTLE SOMETHING FOR YOU', message: '回答好啦，快来看看！', detail: 'Your reply is ready. Click to open DSH.', status: 'Reply ready · click above to open', alt: 'Winking blue whale girl wearing a deer hat' },
  permission: { image: 'active/permission.png', eyebrow: 'YOUR PERMISSION, PLEASE', message: '这一步，要你点头…', detail: 'Permission needed. Click to review in DSH.', status: 'Waiting for your approval', alt: 'Blue whale girl pausing her thoughts to ask for permission' },
  hungry: { image: 'active/hungry.png', eyebrow: 'RICE, PLEASE', message: '饿饿，想吃白米饭…', detail: 'This turn reached its token limit.', status: 'Token limit reached', alt: 'Blue whale girl asking for rice' },
  error: { image: 'active/hungry.png', eyebrow: 'A LITTLE HICCUP', message: '这次没游到终点…', detail: 'Your chat stopped. Open DSH to check.', status: 'Chat needs attention', alt: 'Concerned blue whale girl' }
};
const petElement = document.getElementById('pet');
const ocean = document.querySelector('.ocean');
const notification = document.getElementById('notification');
const alertStates = new Set(['done', 'permission', 'hungry', 'error']);
let currentState = 'sleeping';
let interacting = false;
let dismissed = false;
function updateBubble() {
  notification.hidden = dismissed || (!alertStates.has(currentState) && !interacting);
}
function render(event) {
  currentState = Object.prototype.hasOwnProperty.call(moods, event.state) ? event.state : 'sleeping';
  const mood = moods[currentState];
  petElement.dataset.state = currentState;
  const img = document.getElementById('character');
  img.src = `../assets/${mood.image}`; img.alt = mood.alt;
  for (const key of ['eyebrow', 'message', 'detail']) document.getElementById(key).textContent = mood[key];
  if (event.title && (currentState === 'done' || currentState === 'error')) document.getElementById('detail').textContent = event.title;
  dismissed = false;
  updateBubble();
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
