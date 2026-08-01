/* krish.consulting — chat widget.
   Talks to the Cloudflare Worker proxy; no key ever reaches the browser.
   Styling borrows the page's own tokens (--ink, --cream, --panel, --line,
   --lavender-deep, --sans) with fallbacks, so it re-skins with the site. */
(function () {
  'use strict';

  // Deployed Worker. Override per-page with data-endpoint="…" on the script tag.
  var script = document.currentScript;
  var ENDPOINT = (script && script.getAttribute('data-endpoint')) ||
    'https://krish-consulting-chat.krish13ts.workers.dev/api/chat';

  var STORE_KEY = 'kc-chat-v1';
  var MAX_MESSAGES = 20;   // must match the Worker
  var MAX_CHARS = 2000;    // must match the Worker

  var PROMPTS = [
    'What kind of work do you take on?',
    'What have you built for retailers?',
    'How do I start a project?'
  ];

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- State --------------------------------------------------------- */

  var state = {
    open: false,
    thread: load(),   // committed [{role, content}], user-first and alternating
    pending: null,    // a user message awaiting a successful reply
    busy: false,
    error: null
  };

  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Drop anything malformed rather than sending a thread the Worker will reject.
      var clean = parsed.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' && m.content.length <= MAX_CHARS;
      });
      for (var i = 0; i < clean.length; i++) {
        if (clean[i].role !== (i % 2 === 0 ? 'user' : 'assistant')) return [];
      }
      return clean;
    } catch (e) {
      return [];
    }
  }

  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state.thread)); } catch (e) {}
  }

  /* ---- Styles -------------------------------------------------------- */

  var css = [
    '.kc-chat{--kc-ink:var(--ink,#221E20);--kc-cream:var(--cream,#fff);--kc-panel:var(--panel,#F0EEE9);',
    '--kc-line:var(--line,#DBD7D0);--kc-accent:var(--lavender-deep,#8447EC);--kc-muted:var(--muted,#332E30);',
    'position:fixed;right:clamp(14px,2vw,26px);bottom:clamp(14px,2vw,26px);z-index:140;',
    'font-family:var(--sans,"Manrope",system-ui,sans-serif);font-weight:500}',

    /* launcher — same pill idiom as the site's buttons */
    '.kc-launch{display:inline-flex;align-items:center;gap:9px;padding:13px 20px;border:none;border-radius:999px;',
    'background:var(--kc-ink);color:var(--kc-cream);font:inherit;font-size:15px;font-weight:600;letter-spacing:-0.01em;',
    'cursor:pointer;box-shadow:0 8px 24px rgba(34,30,32,.18);transition:background .2s ease,transform .2s ease}',
    '.kc-launch:hover,.kc-launch:focus-visible{background:var(--kc-accent);transform:translateY(-2px)}',
    '.kc-launch svg{flex:none}',
    '.kc-chat[data-open] .kc-launch{display:none}',

    /* panel */
    '.kc-panel{display:flex;flex-direction:column;width:min(384px,calc(100vw - 28px));',
    'height:min(560px,calc(100vh - 110px));background:var(--kc-cream);border:1px solid var(--kc-line);',
    'border-radius:20px;box-shadow:0 20px 56px rgba(34,30,32,.16);overflow:hidden}',
    /* don't depend on the page's own [hidden] rule for the closed state */
    '.kc-panel[hidden]{display:none}',
    '@media (prefers-reduced-motion:no-preference){.kc-panel{animation:kc-in .22s ease-out both}}',
    '@keyframes kc-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',

    /* header */
    '.kc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;',
    'padding:15px 14px 15px 18px;border-bottom:1px solid var(--kc-line)}',
    '.kc-title{margin:0;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:var(--kc-ink)}',
    '.kc-sub{margin:3px 0 0;font-size:12.5px;font-weight:500;color:var(--kc-muted);opacity:.72}',
    '.kc-icon{display:flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;',
    'padding:0;background:none;border:none;border-radius:10px;color:var(--kc-ink);font:inherit;cursor:pointer;',
    'transition:background .15s ease}',
    '.kc-icon:hover{background:var(--kc-panel)}',

    /* log */
    '.kc-log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:18px;display:flex;flex-direction:column;gap:15px}',
    '.kc-msg{font-size:15px;line-height:1.62;white-space:pre-line;overflow-wrap:anywhere}',
    '.kc-bot{color:var(--kc-ink);max-width:100%}',
    '.kc-you{align-self:flex-end;max-width:86%;padding:10px 14px;border-radius:15px 15px 4px 15px;',
    'background:var(--kc-panel);color:var(--kc-ink)}',
    '.kc-msg a{color:var(--kc-accent);text-decoration:underline;text-underline-offset:2px}',

    /* empty state */
    '.kc-empty{font-size:15px;line-height:1.62;color:var(--kc-ink)}',
    '.kc-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
    '.kc-chip{padding:8px 13px;border:1px solid var(--kc-line);border-radius:999px;background:none;',
    'color:var(--kc-muted);font:inherit;font-size:13.5px;font-weight:500;text-align:left;cursor:pointer;',
    'transition:border-color .15s ease,color .15s ease}',
    '.kc-chip:hover,.kc-chip:focus-visible{border-color:var(--kc-accent);color:var(--kc-ink)}',

    /* typing + error */
    '.kc-dots{display:flex;gap:5px;align-items:center;height:22px}',
    '.kc-dots i{width:5px;height:5px;border-radius:50%;background:var(--kc-ink);opacity:.3}',
    '@media (prefers-reduced-motion:no-preference){',
    '.kc-dots i{animation:kc-pulse 1.1s ease-in-out infinite}',
    '.kc-dots i:nth-child(2){animation-delay:.16s}.kc-dots i:nth-child(3){animation-delay:.32s}}',
    '@keyframes kc-pulse{0%,100%{opacity:.22}50%{opacity:.85}}',
    '.kc-err{font-size:13.5px;line-height:1.55;color:var(--kc-muted)}',
    '.kc-retry{margin-left:6px;padding:0;background:none;border:none;font:inherit;font-size:13.5px;',
    'color:var(--kc-accent);text-decoration:underline;cursor:pointer}',

    /* composer */
    '.kc-form{flex:none;display:flex;align-items:flex-end;gap:8px;padding:11px 11px 11px 16px;',
    'border-top:1px solid var(--kc-line)}',
    '.kc-input{flex:1;max-height:104px;padding:8px 0;border:none;background:none;resize:none;',
    'font:inherit;font-size:15px;line-height:1.5;color:var(--kc-ink)}',
    '.kc-input:focus{outline:none}',
    '.kc-input::placeholder{color:var(--kc-muted);opacity:.55}',
    '.kc-send{display:flex;align-items:center;justify-content:center;flex:none;width:38px;height:38px;',
    'border:none;border-radius:50%;background:var(--kc-ink);color:var(--kc-cream);cursor:pointer;',
    'transition:background .2s ease,opacity .2s ease}',
    '.kc-send:hover:not(:disabled),.kc-send:focus-visible:not(:disabled){background:var(--kc-accent)}',
    '.kc-send:disabled{opacity:.32;cursor:default}',
    '.kc-foot{flex:none;padding:0 16px 11px;font-size:11.5px;line-height:1.4;color:var(--kc-muted);opacity:.6}',

    /* small screens: fill the viewport edge-to-edge but keep the corners */
    '@media (max-width:420px){',
    '.kc-chat[data-open]{left:10px;right:10px;bottom:10px}',
    '.kc-panel{width:100%;height:min(78vh,calc(100vh - 76px))}}'
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---- DOM ----------------------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var root = el('div', 'kc-chat');
  root.setAttribute('data-kc-chat', '');

  var launcher = el('button', 'kc-launch');
  launcher.type = 'button';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">' +
    '<path d="M2 4.2A2.2 2.2 0 0 1 4.2 2h8.6A2.2 2.2 0 0 1 15 4.2v5.4a2.2 2.2 0 0 1-2.2 2.2H6.6L3 15V4.2Z" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  launcher.appendChild(document.createTextNode('Ask a question'));

  var panel = el('div', 'kc-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ask about our work');
  panel.hidden = true;

  var head = el('div', 'kc-head');
  var headText = el('div');
  headText.appendChild(el('p', 'kc-title', 'Ask about our work'));
  headText.appendChild(el('p', 'kc-sub', 'Answers stick to projects we’ve actually shipped.'));
  var closeBtn = el('button', 'kc-icon');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close chat');
  closeBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">' +
    '<path d="M2.5 2.5l10 10M12.5 2.5l-10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  head.appendChild(headText);
  head.appendChild(closeBtn);

  var log = el('div', 'kc-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions text');

  var form = el('form', 'kc-form');
  var input = el('textarea', 'kc-input');
  input.rows = 1;
  input.maxLength = MAX_CHARS;
  input.placeholder = 'Ask about our work…';
  input.setAttribute('aria-label', 'Your question');
  var send = el('button', 'kc-send');
  send.type = 'submit';
  send.disabled = true;
  send.setAttribute('aria-label', 'Send');
  send.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  form.appendChild(input);
  form.appendChild(send);

  var foot = el('p', 'kc-foot', 'AI assistant. For anything it can’t answer, email krish@krish.consulting.');

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(form);
  panel.appendChild(foot);
  root.appendChild(launcher);
  root.appendChild(panel);
  document.body.appendChild(root);

  /* ---- Rendering ----------------------------------------------------- */

  var EMAIL = 'krish@krish.consulting';

  // Plain text only — never innerHTML — with the one email address made clickable.
  function fillText(node, text) {
    var parts = text.split(EMAIL);
    parts.forEach(function (part, i) {
      if (i > 0) {
        var a = el('a', null, EMAIL);
        a.href = 'mailto:' + EMAIL;
        node.appendChild(a);
      }
      if (part) node.appendChild(document.createTextNode(part));
    });
  }

  function bubble(role, text) {
    var n = el('div', 'kc-msg ' + (role === 'user' ? 'kc-you' : 'kc-bot'));
    fillText(n, text);
    return n;
  }

  function render() {
    log.textContent = '';

    if (state.thread.length === 0 && !state.pending && !state.busy) {
      var empty = el('div', 'kc-empty');
      fillText(empty, 'Ask what we build, who we’ve built it for, or how to start. ' +
        'Anything we can’t answer here goes to ' + EMAIL + '.');
      var chips = el('div', 'kc-chips');
      PROMPTS.forEach(function (q) {
        var c = el('button', 'kc-chip', q);
        c.type = 'button';
        c.addEventListener('click', function () { submit(q); });
        chips.appendChild(c);
      });
      empty.appendChild(chips);
      log.appendChild(empty);
    }

    state.thread.forEach(function (m) { log.appendChild(bubble(m.role, m.content)); });
    if (state.pending) log.appendChild(bubble('user', state.pending));

    if (state.busy) {
      var dots = el('div', 'kc-dots');
      dots.setAttribute('aria-label', 'Thinking');
      dots.appendChild(el('i'));
      dots.appendChild(el('i'));
      dots.appendChild(el('i'));
      log.appendChild(dots);
    }

    if (state.error) {
      var err = el('p', 'kc-err', state.error + ' ');
      var retry = el('button', 'kc-retry', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', function () {
        if (state.pending) sendPending();
      });
      err.appendChild(retry);
      log.appendChild(err);
    }

    log.scrollTop = log.scrollHeight;
    syncSend();
  }

  /* ---- Sending ------------------------------------------------------- */

  // Keep the thread user-first and alternating while capping its length:
  // drop whole oldest pairs so index parity never shifts.
  function payloadFor(pending) {
    var msgs = state.thread.concat([{ role: 'user', content: pending }]);
    while (msgs.length > MAX_MESSAGES) msgs = msgs.slice(2);
    return msgs;
  }

  function sendPending() {
    var pending = state.pending;
    if (!pending || state.busy) return;

    var msgs = payloadFor(pending);
    state.busy = true;
    state.error = null;
    render();

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data.reply) {
          throw new Error(typeof data.error === 'string' && res.status === 429
            ? data.error
            : 'Couldn’t reach the assistant.');
        }
        return data.reply;
      });
    }).then(function (reply) {
      state.thread = msgs.concat([{ role: 'assistant', content: reply }]);
      state.pending = null;
      state.busy = false;
      save();
      render();
    }).catch(function (e) {
      state.busy = false;
      state.error = e.message || 'Couldn’t reach the assistant.';
      render();
    });
  }

  function submit(text) {
    text = (text || '').trim();
    if (!text || state.busy) return;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
    state.pending = text;   // replaces any earlier failed attempt
    state.error = null;
    input.value = '';
    autosize();
    syncSend();
    sendPending();
  }

  /* ---- Open / close -------------------------------------------------- */

  function open() {
    state.open = true;
    root.setAttribute('data-open', '');
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    render();
    input.focus();
  }

  function close() {
    state.open = false;
    root.removeAttribute('data-open');
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }

  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) {
      e.stopPropagation();
      close();
    }
  });

  /* ---- Composer behaviour -------------------------------------------- */

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(104, input.scrollHeight) + 'px';
  }

  function syncSend() {
    send.disabled = state.busy || input.value.trim().length === 0;
  }

  input.addEventListener('input', function () { autosize(); syncSend(); });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input.value);
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submit(input.value);
  });

  render();
})();
