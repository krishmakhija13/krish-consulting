(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = [].slice.call(document.querySelectorAll('.reveal'));

  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var target = parseFloat(el.dataset.target);
    if (reduce || !window.requestAnimationFrame) { el.textContent = el.dataset.target; return; }
    var dur = 700;
    var t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = el.dataset.target;
    }
    requestAnimationFrame(step);
  }

  function show(el) {
    el.classList.add('in');
    [].forEach.call(el.querySelectorAll('.count'), countUp);
  }

  if (reduce) { els.forEach(show); return; }

  function check() {
    var vh = window.innerHeight;
    els = els.filter(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) { show(el); return false; }
      return true;
    });
    if (!els.length) {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    }
  }

  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  check();
})();
