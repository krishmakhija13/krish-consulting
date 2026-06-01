/* ============================================================
   krish.consulting — AI chat widget
   Self-contained: injects its own CSS + HTML, streams responses,
   captures leads, respects reduced-motion, fully keyboard-accessible.

   CONFIGURATION: set window.CHATBOT_BACKEND_URL before this script loads,
   or edit the BACKEND_URL constant below.
   ============================================================ */

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var BACKEND_URL   = (window.CHATBOT_BACKEND_URL || '').replace(/\/$/, '');
  var CONTACT_EMAIL = 'krish13ts@gmail.com';
  var WELCOME_MSG   = "Hi! I'm Krish's assistant. I can tell you about his data and AI consulting services, past projects, and how to get started. What brings you here today?";
  var STARTERS      = [
    'What services do you offer?',
    'Tell me about past projects',
    'How do we start working together?',
    'What makes Krish different?',
  ];

  var MSG_RATE_LIMITED = "I'm getting a lot of questions right now — please try again in a moment, or email " + CONTACT_EMAIL;
  var MSG_ERROR        = "I'm having trouble connecting right now — please email " + CONTACT_EMAIL;
  var MSG_NO_BACKEND   = "Chat isn't configured yet. Please email " + CONTACT_EMAIL + " directly.";

  // ── State ─────────────────────────────────────────────────────────────────
  var isOpen      = false;
  var isStreaming = false;
  var history     = [];   // [{role:'user'|'assistant', content:'...'}]

  // ── Reduced-motion ────────────────────────────────────────────────────────
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Inject CSS ────────────────────────────────────────────────────────────
  var css = [
    /* Widget container */
    '#kc-widget{position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:var(--font-body,"IBM Plex Sans",sans-serif)}',

    /* Bubble */
    '#kc-bubble{width:52px;height:52px;background:var(--accent,#c8392b);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(200,57,43,.35);border:none;color:#fff;font-size:22px;position:relative;transition:transform .2s}',
    '#kc-bubble:hover{transform:scale(1.08)}',
    '#kc-bubble:focus-visible{outline:3px solid var(--accent,#c8392b);outline-offset:3px}',
    '#kc-notif{position:absolute;top:-2px;right:-2px;width:13px;height:13px;background:var(--teal,#0a7166);border-radius:50%;border:2px solid var(--paper,#faf9f7);display:none}',

    /* Panel */
    '#kc-panel{display:none;width:340px;background:var(--paper,#faf9f7);border:2px solid var(--ink,#0d0d0d);flex-direction:column;max-height:500px;box-shadow:0 16px 48px rgba(0,0,0,.15);overflow:hidden}',
    '[data-theme=dark] #kc-panel{border-color:var(--border2,#ccc9c2)}',
    '#kc-panel.open{display:flex}',
    prefersReduced ? '' : '#kc-panel{animation:kcSlideIn .18s ease-out}',
    '@keyframes kcSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',

    /* Header */
    '#kc-hd{background:var(--ink,#0d0d0d);padding:.85rem 1rem;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}',
    '[data-theme=dark] #kc-hd{background:var(--paper4,#dedad4)}',
    '#kc-hd-left{display:flex;align-items:center;gap:9px}',
    '#kc-av{width:28px;height:28px;background:var(--accent,#c8392b);border-radius:0;display:flex;align-items:center;justify-content:center;font-family:var(--font-head,"Playfair Display",serif);font-weight:900;font-size:12px;color:#fff;flex-shrink:0}',
    '#kc-hd-name{font-size:13px;font-weight:600;color:var(--paper,#faf9f7);font-family:var(--font-head,"Playfair Display",serif);line-height:1.2}',
    '[data-theme=dark] #kc-hd-name{color:var(--ink,#0d0d0d)}',
    '#kc-hd-sub{font-size:10px;color:rgba(250,249,247,.6);font-family:var(--font-mono,"IBM Plex Mono",monospace)}',
    '[data-theme=dark] #kc-hd-sub{color:var(--ink3,#555)}',
    '#kc-hd-btns{display:flex;gap:6px;align-items:center}',
    '#kc-hd-btns button{background:transparent;border:none;color:var(--paper,#faf9f7);cursor:pointer;font-size:15px;opacity:.7;padding:2px 5px;line-height:1;border-radius:2px;transition:opacity .15s}',
    '[data-theme=dark] #kc-hd-btns button{color:var(--ink,#0d0d0d)}',
    '#kc-hd-btns button:hover{opacity:1}',
    '#kc-hd-btns button:focus-visible{outline:2px solid var(--accent,#c8392b);outline-offset:2px}',

    /* Messages */
    '#kc-msgs{flex:1;overflow-y:auto;padding:.85rem;display:flex;flex-direction:column;gap:8px;min-height:180px;scroll-behavior:smooth}',
    '.kc-msg{padding:9px 12px;font-size:13px;line-height:1.6;max-width:90%;word-break:break-word}',
    '.kc-msg.bot{background:var(--paper2,#f3f1ee);border:1px solid var(--border,#e0ddd8);color:var(--ink,#0d0d0d);align-self:flex-start}',
    '.kc-msg.usr{background:var(--accent,#c8392b);color:#fff;align-self:flex-end}',
    '.kc-msg.err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;align-self:flex-start}',

    /* Typing indicator */
    '.kc-typing{display:flex;gap:4px;align-items:center;padding:11px 14px}',
    '.kc-typing span{width:5px;height:5px;background:var(--ink4,#888);border-radius:50%;',
    prefersReduced ? 'opacity:.5}' : 'animation:kcBounce 1.2s ease-in-out infinite}',
    '.kc-typing span:nth-child(2){animation-delay:.2s}',
    '.kc-typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes kcBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}',

    /* Starter chips */
    '#kc-sugg{padding:0 .85rem .6rem;display:flex;gap:5px;flex-wrap:wrap;flex-shrink:0}',
    '.kc-chip{font-size:11px;padding:4px 9px;background:var(--paper2,#f3f1ee);border:1px solid var(--border2,#ccc9c2);color:var(--ink3,#555);cursor:pointer;font-family:var(--font-mono,"IBM Plex Mono",monospace);transition:border-color .15s,color .15s;border-radius:0}',
    '.kc-chip:hover{border-color:var(--accent,#c8392b);color:var(--accent,#c8392b)}',
    '.kc-chip:focus-visible{outline:2px solid var(--accent,#c8392b);outline-offset:2px}',

    /* Input row */
    '#kc-inp-row{display:flex;padding:.65rem .85rem;border-top:1px solid var(--border,#e0ddd8);gap:0;flex-shrink:0}',
    '#kc-inp{flex:1;background:var(--paper2,#f3f1ee);border:1px solid var(--border,#e0ddd8);border-right:none;color:var(--ink,#0d0d0d);font-family:var(--font-body,"IBM Plex Sans",sans-serif);font-size:13px;padding:8px 11px;outline:none;min-width:0}',
    '#kc-inp:focus{border-color:var(--accent,#c8392b)}',
    '#kc-inp:disabled{opacity:.6;cursor:not-allowed}',
    '#kc-send{width:36px;background:var(--accent,#c8392b);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;transition:opacity .15s}',
    '#kc-send:hover{opacity:.85}',
    '#kc-send:disabled{opacity:.5;cursor:not-allowed}',
    '#kc-send:focus-visible{outline:2px solid var(--accent,#c8392b);outline-offset:2px}',

    /* Footer */
    '#kc-pw{text-align:center;font-size:10px;color:var(--ink4,#888);padding:5px;border-top:1px solid var(--border,#e0ddd8);font-family:var(--font-mono,"IBM Plex Mono",monospace);flex-shrink:0}',

    /* Mobile */
    '@media(max-width:400px){#kc-panel{width:calc(100vw - 24px);right:0}#kc-widget{right:12px;bottom:12px}}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Inject HTML ───────────────────────────────────────────────────────────
  var widget = document.createElement('div');
  widget.id = 'kc-widget';
  widget.innerHTML = [
    '<div id="kc-panel" role="dialog" aria-label="Chat with Krish\'s assistant" aria-modal="true" aria-hidden="true">',
      '<div id="kc-hd">',
        '<div id="kc-hd-left">',
          '<div id="kc-av" aria-hidden="true">K</div>',
          '<div>',
            '<div id="kc-hd-name">Krish\'s Assistant</div>',
            '<div id="kc-hd-sub">krish.consulting</div>',
          '</div>',
        '</div>',
        '<div id="kc-hd-btns">',
          '<button id="kc-new" title="New conversation" aria-label="Start new conversation">&#8635;</button>',
          '<button id="kc-close" aria-label="Close chat">&#10005;</button>',
        '</div>',
      '</div>',
      '<div id="kc-msgs" role="log" aria-live="polite" aria-label="Conversation"></div>',
      '<div id="kc-sugg" aria-label="Suggested questions"></div>',
      '<div id="kc-inp-row">',
        '<input type="text" id="kc-inp" placeholder="Ask anything…" aria-label="Your message" maxlength="2000" autocomplete="off">',
        '<button id="kc-send" aria-label="Send message">&#8594;</button>',
      '</div>',
      '<div id="kc-pw">Powered by Gemini AI &middot; krish.consulting</div>',
    '</div>',
    '<button id="kc-bubble" aria-label="Open chat with Krish\'s assistant" aria-expanded="false">',
      '<span aria-hidden="true">&#128172;</span>',
      '<span id="kc-notif" aria-hidden="true"></span>',
    '</button>',
  ].join('');
  document.body.appendChild(widget);

  // ── Element refs ──────────────────────────────────────────────────────────
  var panel   = document.getElementById('kc-panel');
  var msgs    = document.getElementById('kc-msgs');
  var sugg    = document.getElementById('kc-sugg');
  var inp     = document.getElementById('kc-inp');
  var send    = document.getElementById('kc-send');
  var bubble  = document.getElementById('kc-bubble');
  var notif   = document.getElementById('kc-notif');
  var btnNew  = document.getElementById('kc-new');
  var btnClose= document.getElementById('kc-close');

  // ── Open/close ────────────────────────────────────────────────────────────
  function openChat() {
    isOpen = true;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    bubble.setAttribute('aria-expanded', 'true');
    notif.style.display = 'none';
    inp.focus();
  }

  function closeChat() {
    isOpen = false;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    bubble.setAttribute('aria-expanded', 'false');
    bubble.focus();
  }

  bubble.addEventListener('click', function () { isOpen ? closeChat() : openChat(); });
  btnClose.addEventListener('click', closeChat);

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeChat();
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function addMsg(text, role) {
    var d = document.createElement('div');
    d.className = 'kc-msg ' + (role || 'bot');
    d.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function addTyping() {
    var d = document.createElement('div');
    d.className = 'kc-msg bot kc-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  function setInput(disabled) {
    inp.disabled  = disabled;
    send.disabled = disabled;
    isStreaming   = disabled;
  }

  // ── Starter chips ─────────────────────────────────────────────────────────
  function renderChips() {
    sugg.innerHTML = '';
    STARTERS.forEach(function (q) {
      var btn = document.createElement('button');
      btn.className   = 'kc-chip';
      btn.textContent = q;
      btn.setAttribute('aria-label', 'Ask: ' + q);
      btn.addEventListener('click', function () {
        sugg.innerHTML = '';
        sendMessage(q);
      });
      sugg.appendChild(btn);
    });
  }

  // ── Lead extraction ───────────────────────────────────────────────────────
  var LEAD_RE = /\[SAVE_LEAD\]([\s\S]*?)\[\/SAVE_LEAD\]/;

  function extractLead(text) {
    var m = text.match(LEAD_RE);
    if (!m) return null;
    try { return JSON.parse(m[1].trim()); } catch { return null; }
  }

  function stripLeadBlock(text) {
    return text.replace(LEAD_RE, '').trim();
  }

  function saveLead(lead) {
    if (!BACKEND_URL) return;
    fetch(BACKEND_URL + '/api/lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(lead),
    }).catch(function (err) {
      console.warn('[chatbot] Lead save failed:', err);
    });
  }

  // ── Send message ──────────────────────────────────────────────────────────
  function sendMessage(text) {
    text = (text || '').trim();
    if (!text || isStreaming) return;

    if (!BACKEND_URL) {
      addMsg(MSG_NO_BACKEND, 'err');
      return;
    }

    sugg.innerHTML = '';
    addMsg(text, 'usr');
    history.push({ role: 'user', content: text });

    var typing = addTyping();
    setInput(true);

    // Build request body — send a copy of history without the message we just pushed
    var bodyHistory = history.slice(0, -1);

    fetch(BACKEND_URL + '/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: text, history: bodyHistory }),
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          throw { status: res.status, message: data.message || MSG_ERROR };
        }).catch(function () {
          throw { status: res.status, message: res.status === 429 ? MSG_RATE_LIMITED : MSG_ERROR };
        });
      }
      return streamResponse(res, typing);
    })
    .catch(function (err) {
      typing.remove();
      var msg = (err && err.message) ? err.message : MSG_ERROR;
      addMsg(msg, 'err');
      setInput(false);
    });
  }

  function streamResponse(res, typingEl) {
    var reader  = res.body.getReader();
    var decoder = new TextDecoder();
    var buf     = '';
    var full    = '';
    var msgEl   = null; // created on first text chunk

    function processChunk(value) {
      buf += decoder.decode(value, { stream: true });

      var lines = buf.split('\n');
      buf = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith('data: ')) continue;
        var data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        var parsed;
        try { parsed = JSON.parse(data); } catch { continue; }

        if (parsed.error) {
          typingEl.remove();
          addMsg(parsed.error, 'err');
          setInput(false);
          return;
        }

        if (parsed.text) {
          full += parsed.text;

          if (!msgEl) {
            typingEl.remove();
            typingEl = null;
            msgEl = document.createElement('div');
            msgEl.className = 'kc-msg bot';
            msgs.appendChild(msgEl);
          }

          // Render incrementally — strip lead block from display
          var displayText = stripLeadBlock(full);
          msgEl.innerHTML = escapeHtml(displayText).replace(/\n/g, '<br>');
          msgs.scrollTop  = msgs.scrollHeight;
        }
      }
    }

    function pump() {
      return reader.read().then(function (result) {
        if (!result.done) {
          processChunk(result.value);
          return pump();
        }

        // Stream finished — finalise
        if (typingEl) typingEl.remove(); // safety: remove if no text arrived

        var lead = extractLead(full);
        var displayText = stripLeadBlock(full);

        if (msgEl) {
          msgEl.innerHTML = escapeHtml(displayText).replace(/\n/g, '<br>');
        } else if (displayText) {
          addMsg(displayText, 'bot');
        }

        history.push({ role: 'assistant', content: displayText });

        if (lead && lead.name && lead.email && lead.message) {
          saveLead(lead);
        }

        setInput(false);
        inp.focus();
      });
    }

    return pump().catch(function (err) {
      console.error('[chatbot] Stream error:', err);
      if (typingEl) typingEl.remove();
      addMsg(MSG_ERROR, 'err');
      setInput(false);
    });
  }

  // ── New conversation ──────────────────────────────────────────────────────
  function newConversation() {
    history   = [];
    msgs.innerHTML = '';
    addMsg(WELCOME_MSG, 'bot');
    renderChips();
    inp.value = '';
    setInput(false);
  }

  btnNew.addEventListener('click', function () {
    if (isStreaming) return;
    newConversation();
  });

  // ── Input events ──────────────────────────────────────────────────────────
  send.addEventListener('click', function () {
    sendMessage(inp.value);
    inp.value = '';
  });

  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inp.value);
      inp.value = '';
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  addMsg(WELCOME_MSG, 'bot');
  renderChips();

  // Show notification dot after 5 s if chat hasn't been opened
  setTimeout(function () {
    if (!isOpen) notif.style.display = 'block';
  }, 5000);

})();
