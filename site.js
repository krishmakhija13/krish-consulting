/* krish.consulting — shared page behavior.
   Every feature detects its own elements, so one file serves all four pages. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Mobile menu -------------------------------------------------- */
  var menuLayer = document.getElementById('menu-layer');
  if (menuLayer) {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-menu]');
      if (!t) return;
      var open = t.getAttribute('data-menu') === 'open';
      menuLayer.hidden = !open;
      var btn = document.querySelector('[data-menu="open"]');
      if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var mq = window.matchMedia('(max-width: 860px)');
    var syncMenu = function () { if (!mq.matches) menuLayer.hidden = true; };
    if (mq.addEventListener) mq.addEventListener('change', syncMenu);
  }

  /* ---- Scroll reveals ------------------------------------------------ */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  // Standalone rules; those inside [data-case]/[data-block] are driven by their parent's data-in
  Array.prototype.forEach.call(document.querySelectorAll('[data-rule]'), function (el) {
    if (!el.closest('[data-case],[data-block]')) reveals.push(el);
  });

  function markIn(el) {
    var d = parseInt(el.getAttribute('data-delay') || '0', 10);
    if (d) setTimeout(function () { el.setAttribute('data-in', ''); }, d * 110);
    else el.setAttribute('data-in', '');
  }

  if (reduce) {
    reveals.forEach(function (el) { el.setAttribute('data-in', ''); });
  } else if (reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        markIn(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });

    // Backstop: anything already past the fold (anchor jump, fast scroll) reveals immediately
    var pending = reveals.slice();
    var sweep = function () {
      pending = pending.filter(function (el) {
        if (el.hasAttribute('data-in')) return false;
        if (el.getBoundingClientRect().top < window.innerHeight * 0.88) {
          markIn(el);
          io.unobserve(el);
          return false;
        }
        return true;
      });
      if (!pending.length && poll) { clearInterval(poll); poll = null; }
    };
    window.addEventListener('scroll', sweep, { passive: true });
    window.addEventListener('resize', sweep);
    window.addEventListener('hashchange', sweep);
    var poll = setInterval(sweep, 150);
    sweep();
  }

  /* ---- Stat count-up (Home) ------------------------------------------ */
  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  if (!reduce && counters.length) {
    var runCount = function (el) {
      var end = parseInt(el.getAttribute('data-count'), 10);
      var t0 = performance.now();
      var step = function (t) {
        var p = Math.min(1, (t - t0) / 900);
        el.textContent = Math.round(end * p) + '%';
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    var countSweep = function () {
      counters = counters.filter(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.9 && r.bottom > 0) { runCount(el); return false; }
        return true;
      });
      if (!counters.length) {
        clearInterval(countPoll);
        window.removeEventListener('scroll', countSweep);
      }
    };
    window.addEventListener('scroll', countSweep, { passive: true });
    var countPoll = setInterval(countSweep, 150);
    countSweep();
  }

  /* ---- Typed questions (Home hero card) ------------------------------ */
  var typedEl = document.querySelector('[data-typed]');
  if (typedEl && !reduce) {
    var QUESTIONS = [
      'Need a business that runs while you sleep?',
      'Still making decisions on last month’s numbers?',
      'Losing stock before you know it’s gone?',
      'Team spending hours on work software should do?',
      'Sitting on data you’ve never actually used?'
    ];
    var ticks = document.querySelectorAll('[data-tick]');
    var setTicks = function (qi) {
      Array.prototype.forEach.call(ticks, function (el, i) {
        el.style.background = i === qi ? 'var(--lavender)' : 'rgba(255,255,255,0.18)';
      });
    };
    var qi = 0, n = 0, dir = 1;
    var step = function () {
      var q = QUESTIONS[qi];
      if (dir === 1) {
        n++;
        if (n >= q.length) {
          dir = -1;
          typedEl.textContent = q;
          setTimeout(step, 2100);
          return;
        }
      } else {
        n--;
        if (n <= 0) {
          dir = 1;
          qi = (qi + 1) % QUESTIONS.length;
          setTicks(qi);
          typedEl.textContent = '';
          setTimeout(step, 380);
          return;
        }
      }
      typedEl.textContent = q.slice(0, n);
      setTimeout(step, dir === 1 ? 36 : 15);
    };
    typedEl.textContent = '';
    setTicks(0);
    setTimeout(step, 500);
  }

  /* ---- Diagram play/pause (Services) --------------------------------- */
  var vizzes = Array.prototype.slice.call(document.querySelectorAll('[data-viz]'));
  if (vizzes.length) {
    var vizSweep = function () {
      var margin = window.innerHeight * 0.1;
      vizzes.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var on = r.top < window.innerHeight + margin && r.bottom > -margin;
        if (on) el.setAttribute('data-play', '');
        else el.removeAttribute('data-play');
      });
    };
    window.addEventListener('scroll', vizSweep, { passive: true });
    window.addEventListener('resize', vizSweep);
    setInterval(vizSweep, 200);
    vizSweep();
  }

  /* ---- Case index tracking (Clients) --------------------------------- */
  var cases = Array.prototype.slice.call(document.querySelectorAll('[data-case]'));
  if (cases.length && !reduce) {
    var activeId = null;
    var setActive = function (id) {
      if (id === activeId) return;
      activeId = id;
      Array.prototype.forEach.call(document.querySelectorAll('[data-ix]'), function (a) {
        if (a.getAttribute('data-ix-for') === id) a.setAttribute('data-active', '');
        else a.removeAttribute('data-active');
      });
      var bar = document.querySelector('[data-progress]');
      if (bar) {
        var i = cases.findIndex(function (c) { return c.id === id; });
        bar.style.width = (((i + 1) / cases.length) * 100).toFixed(1) + '%';
      }
    };
    var track = function () {
      var mid = window.innerHeight / 2;
      var best = null, bestD = Infinity;
      cases.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < bestD) { bestD = d; best = el; }
      });
      if (best) setActive(best.id);
    };
    track();
    window.addEventListener('scroll', track, { passive: true });
    window.addEventListener('resize', track);
    setInterval(track, 200);
  }
})();
