/* FinAI – advisor.js */

// Local storage key for chat history
const CHAT_KEY  = 'chat_history';

// UI state flags
let isTyping    = false;
let hasMessages = false;

document.addEventListener('DOMContentLoaded', () => {

  // Keep chat content visible above the fixed footer
  const footer = document.getElementById('chatFooter');
  const win    = document.getElementById('chatWindow');

  if (footer && win) {
    const adjust = () =>
      win.style.paddingBottom = (footer.offsetHeight + 20) + 'px';

    adjust();
    // Recalculate spacing when footer size changes
    new ResizeObserver(adjust).observe(footer);
  }

  // Restore previous conversation
  loadChatHistory();
});

async function loadChatHistory() {

  // Load cached messages from local storage
  const cached = await aiCacheGet(CHAT_KEY);
  if (!cached) return;
  const history = JSON.parse(cached);
  if (!history.length) return;
  history.forEach(h => appendBubble(h.text, h.role));
  hideChips();
}

function hideChips() {

  // Hide quick suggestion buttons after chat starts
  const chips = document.getElementById('chipRow');
  if (chips) chips.style.display = 'none';
  hasMessages = true;
}

function sendChip(el) {

  // Send selected suggestion as a normal message
  document.getElementById('chatInput').value = el.textContent.trim();
  sendMessage();
}

async function sendMessage() {

  // Prevent multiple simultaneous requests
  if (isTyping) return;
  const input = document.getElementById('chatInput');
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  hideChips();

  // Show user message immediately
  appendBubble(msg, 'user');
  await saveBubble(msg, 'user');

  const chatWin  = document.getElementById('chatWindow');

  // Display typing animation while waiting for AI
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-bubble typing';
  typingEl.innerHTML = `<div class="dot-loader"><span></span><span></span><span></span></div>`;
  chatWin.appendChild(typingEl);
  window.scrollTo(0, document.body.scrollHeight);
  isTyping = true;

  try {

    // Send user prompt to backend AI service
    const res = await postJSON('/api/chat', { message: msg });
    typingEl.remove();
    appendBubble(res.reply, 'bot');
    await saveBubble(res.reply, 'bot');
  } catch {
    // Fallback message if request fails
    typingEl.remove();
    appendBubble('Sorry, something went wrong. Please try again! 🙏','bot');
  }
  isTyping = false;
}

function appendBubble(text, role) {
  // Create and render a chat bubble
  const chatWin = document.getElementById('chatWindow');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  chatWin.appendChild(bubble);
  // Auto-scroll to latest message
  window.scrollTo(0, document.body.scrollHeight);
}

async function saveBubble(text, role) {
  // Store latest 50 messages only
  const cached  = await aiCacheGet(CHAT_KEY);
  const history = cached ? JSON.parse(cached) : [];
  history.push({ text, role });
  await aiCacheSet(
    CHAT_KEY,
    JSON.stringify(history.slice(-50)));
}

async function clearChat() {

  // Ask user before deleting conversation
  if (!confirm('Reset the entire conversation?')) return;
  await postJSON('/api/chat/clear', {});
  await aiCacheDel(CHAT_KEY);

  // Restore initial welcome message
  document.getElementById('chatWindow').innerHTML = `
    <div class="chat-bubble bot">
      👋 Hello! I'm <strong>FinBot</strong>, your AI financial assistant.<br><br>
      Ask me anything about expenses, savings, investments, or your financial situation! 💰
    </div>`;

  // Show quick suggestion buttons again
  const chips = document.getElementById('chipRow');
  if (chips) chips.style.display = '';
  hasMessages = false;

  showToast('Chat reset', 'warn');
}