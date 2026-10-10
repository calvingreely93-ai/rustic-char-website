// Rustic Char: header, phone menu, open/closed line and the reviews row.

// ---- motion: a critically damped spring (no bounce), the way Apple moves things
// that are under your hand. It starts from where the thing is and at the speed it
// was already going, so letting go of a drag never jolts. ----
var Spring = (function(){
  function run(from, to, v0, onUpdate, done, response){
    // The clock starts now, not on the first frame, so there's no still frame
    // between letting go and the motion carrying on.
    var w = 2 * Math.PI / (response || 0.42), x = from - to, v = v0 || 0, raf = null, last = performance.now(), stopped = false;
    function step(t){
      if(stopped) return;
      var dt = Math.max(0, Math.min(0.064, (t - last) / 1000)); last = t;
      var n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for(var i = 0; i < n; i++){ var a = -w * w * x - 2 * w * v; v += a * h; x += v * h; }
      if(Math.abs(x) < 0.5 && Math.abs(v) < 12){ onUpdate(to); raf = null; if(done) done(); return; }
      if(onUpdate(to + x, v) === false){ raf = null; if(done) done(); return; } // the caller can end it early
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return { stop: function(){ stopped = true; cancelAnimationFrame(raf); } };
  }
  // Where a flick would come to rest, by Apple's scroll deceleration (0.998).
  function project(v){ return (v / 1000) * 0.998 / (1 - 0.998); }
  // Taking over from a moving hand: a spring soft enough that it starts at the
  // hand's speed and only ever slows down from there, like a scroll coasting,
  // instead of surging ahead after you let go.
  function handoff(from, to, v0, onUpdate, done){
    var d = to - from, r = 0.45;
    if(d && v0 && (d > 0) === (v0 > 0)) r = Math.min(1.7, Math.max(0.35, Math.PI * Math.abs(d) / Math.abs(v0)));
    return run(from, to, v0, onUpdate, done, r);
  }
  // Speed of a drag over its last tenth of a second; 0 if the hand had stopped.
  function tracker(){
    var pts = [];
    return {
      add: function(x){ var t = performance.now(); pts.push([t, x]); while(pts.length > 2 && t - pts[0][0] > 100) pts.shift(); },
      velocity: function(){
        if(pts.length < 2) return 0;
        var a = pts[0], b = pts[pts.length - 1], dt = b[0] - a[0];
        if(dt <= 0 || performance.now() - b[0] > 80) return 0;
        return (b[1] - a[1]) / dt * 1000;
      },
      reset: function(){ pts = []; }
    };
  }
  return { run: run, project: project, tracker: tracker, handoff: handoff };
})();

(function(){
  var header = document.querySelector('header');
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  var scrim = document.getElementById('navScrim');
  var hero = document.querySelector('.hero');
  var phone = window.matchMedia('(max-width: 1180px)');
  if(!header) return;

  // ---- menu sheet: closes on a link tap, scrim tap or Escape ----
  function setOpen(open){
    if(!links || !toggle) return;
    links.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    if(scrim) scrim.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  if(toggle && links){
    toggle.addEventListener('click', function(){ setOpen(!links.classList.contains('is-open')); });
    links.addEventListener('click', function(e){ if(e.target.closest('a')) setOpen(false); });
    if(scrim) scrim.addEventListener('click', function(){ setOpen(false); });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && links.classList.contains('is-open')){ setOpen(false); toggle.focus(); }
    });
  }

  // ---- header: phones get the sheet; on the home page the logo is big until the hero scrolls away ----
  var atHero = false;
  function applyMode(){
    var menuMode = phone.matches;
    if(header.classList.contains('menu-mode') !== menuMode) setOpen(false);
    header.classList.toggle('at-hero', atHero);
    header.classList.toggle('menu-mode', menuMode);
  }
  if(hero && 'IntersectionObserver' in window){
    var barH = header.offsetHeight;
    atHero = hero.getBoundingClientRect().bottom > barH;
    new IntersectionObserver(function(entries){
      atHero = entries[0].isIntersecting;
      applyMode();
    }, {rootMargin: '-' + barH + 'px 0px 0px 0px'}).observe(hero);
  }
  if(phone.addEventListener) phone.addEventListener('change', applyMode);
  applyMode();
})();

(function(){
  // ---- "We're open / closed" line, worked out in Lennox Head time ----
  // Keep in sync with the hours card and the JSON-LD.
  var els = document.querySelectorAll('[data-open-status]');
  if(!els.length) return;
  var OPEN_DAYS = [2, 3, 4, 5, 6];            // Tue-Sat (0 = Sunday)
  var OPENS = 11 * 60 + 30, CLOSES = 19 * 60; // 11:30am - 7pm, in minutes
  var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var DOW = {Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6};
  function now(){
    try{
      var p = {};
      new Intl.DateTimeFormat('en-US', {timeZone:'Australia/Sydney', weekday:'short', hour:'numeric', minute:'numeric', hourCycle:'h23'})
        .formatToParts(new Date()).forEach(function(x){ p[x.type] = x.value; });
      return {day: DOW[p.weekday], mins: (+p.hour % 24) * 60 + (+p.minute)};
    }catch(e){
      var d = new Date(); return {day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes()};
    }
  }
  function status(n){
    var openToday = OPEN_DAYS.indexOf(n.day) !== -1;
    // two halves, so the hero can stack them on phones ("We're open" / "until 7pm")
    if(openToday && n.mins >= OPENS && n.mins < CLOSES) return {open:true, a:"We're open", b:'until 7pm'};
    if(openToday && n.mins < OPENS) return {open:false, a:"We're closed", b:'opens 11:30am'};
    for(var i = 1; i <= 7; i++){
      var d = (n.day + i) % 7;
      if(OPEN_DAYS.indexOf(d) !== -1) return {open:false, a:"We're closed", b:'opens ' + DAY_NAMES[d] + ' 11:30am'};
    }
  }
  function render(){
    var s = status(now());
    Array.prototype.forEach.call(els, function(el){
      el.innerHTML = '<span class="os-text"><span>' + s.a + '</span><span class="os-sep"> · </span><span class="os-b">' + s.b + '</span></span>';
      el.classList.toggle('is-open', s.open);
      el.classList.toggle('is-closed', !s.open);
    });
  }
  render();
  setInterval(render, 60000);
})();

(function(){
  // ---- reviews: a real sideways scroller, so fingers, trackpads and mouse drags all move it.
  // It glides to the next review on its own until the visitor touches it, then it's theirs. ----
  var stage = document.getElementById('revStage');
  var track = document.getElementById('revTrack');
  if(!stage || !track) return;
  var originals = Array.prototype.slice.call(track.children);
  if(originals.length < 2) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HOLD_MS = 2600, GLIDE_MS = 1100;

  originals.forEach(function(a){ a.setAttribute('draggable', 'false'); });
  function cloneSet(){
    var frag = document.createDocumentFragment();
    originals.forEach(function(a){ var k = a.cloneNode(true); k.setAttribute('aria-hidden', 'true'); k.setAttribute('tabindex', '-1'); frag.appendChild(k); });
    return frag;
  }
  // [copy][real][copy] so it never runs out either way
  track.insertBefore(cloneSet(), track.firstChild);
  track.appendChild(cloneSet());
  var cards = Array.prototype.slice.call(track.children);

  function centreOf(card){ return card.offsetLeft + card.offsetWidth / 2 - stage.clientWidth / 2; }
  var setW = 0, base = 0;
  function measure(){ setW = originals[0].offsetLeft - cards[0].offsetLeft; base = centreOf(originals[0]); }
  function nearest(){
    var mid = stage.scrollLeft + stage.clientWidth / 2, best = 0, bestD = Infinity;
    cards.forEach(function(c, k){ var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if(d < bestD){ bestD = d; best = k; } });
    return best;
  }
  function recentre(){
    if(!setW) return;
    if(stage.scrollLeft < base - setW / 2) stage.scrollLeft += setW;
    else if(stage.scrollLeft > base + setW / 2) stage.scrollLeft -= setW;
  }

  // a slow, eased glide (the browser's own smooth scroll is too quick)
  var raf = null;
  function glideTo(x, ms){
    cancelAnimationFrame(raf);
    var from = stage.scrollLeft, t0 = null;
    stage.classList.add('is-gliding');
    function step(t){
      if(t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / ms);
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      stage.scrollLeft = from + (x - from) * e;
      if(p < 1) raf = requestAnimationFrame(step);
      else { raf = null; stage.classList.remove('is-gliding'); recentre(); }
    }
    raf = requestAnimationFrame(step);
  }

  // automatic glide, until the visitor takes over
  var auto = !reduce, timer = null, hovering = false;
  function stopAuto(){ auto = false; clearInterval(timer); timer = null; }
  function startAuto(){
    if(!auto || timer) return;
    timer = setInterval(function(){
      if(hovering || document.hidden || raf) return;
      var k = nearest() + 1;
      if(cards[k]) glideTo(centreOf(cards[k]), GLIDE_MS);
    }, HOLD_MS + GLIDE_MS);
  }
  stage.addEventListener('mouseenter', function(){ hovering = true; });
  stage.addEventListener('mouseleave', function(){ hovering = false; });
  ['touchstart', 'wheel', 'keydown'].forEach(function(ev){
    stage.addEventListener(ev, function(){ stopAuto(); cancelAnimationFrame(raf); raf = null; if(settling){ settling.stop(); settling = null; } stage.classList.remove('is-gliding'); }, {passive:true});
  });

  // mouse drag (fingers and trackpads scroll it natively)
  var down = false, moved = false, startX = 0, startLeft = 0, lastDx = 0, speed = Spring.tracker(), settling = null;
  function stopSettling(){ if(settling){ settling.stop(); settling = null; stage.classList.remove('is-gliding'); } }
  stage.addEventListener('pointerdown', function(e){
    stopAuto();
    if(e.pointerType !== 'mouse' || e.button !== 0) return;
    cancelAnimationFrame(raf); raf = null; stopSettling();
    down = true; moved = false; startX = e.clientX; startLeft = stage.scrollLeft; lastDx = 0;
    speed.reset(); speed.add(stage.scrollLeft);
  });
  window.addEventListener('pointermove', function(e){
    if(!down) return;
    lastDx = e.clientX - startX;
    if(!moved && Math.abs(lastDx) > 5){ moved = true; stage.classList.add('is-dragging'); }
    if(moved){ stage.scrollLeft = startLeft - lastDx; speed.add(stage.scrollLeft); }
  });
  window.addEventListener('pointerup', function(){
    if(!down) return;
    down = false;
    if(!moved) return;
    // Snapping stays off from the drag right through the glide: switching it back
    // on for even a moment makes the browser jump to the nearest card.
    stage.classList.add('is-gliding');
    stage.classList.remove('is-dragging');
    // Land on the card nearest to where the flick was heading; a flick of 60px or
    // more always moves at least one card. The drag's speed carries into the glide.
    var v = speed.velocity();
    var here = stage.scrollLeft;
    var aim = here + Spring.project(v);
    var k = cards.reduce(function(best, c, idx){ return Math.abs(centreOf(c) - aim) < Math.abs(centreOf(cards[best]) - aim) ? idx : best; }, 0);
    var startK = cards.reduce(function(best, c, idx){ return Math.abs(centreOf(c) - startLeft) < Math.abs(centreOf(cards[best]) - startLeft) ? idx : best; }, 0);
    if(k === startK && Math.abs(lastDx) > 60) k += lastDx < 0 ? 1 : -1;
    if(!cards[k]){ stage.classList.remove('is-gliding'); return; }
    settling = Spring.handoff(here, centreOf(cards[k]), v, function(x){ stage.scrollLeft = x; },
      function(){ settling = null; stage.classList.remove('is-gliding'); recentre(); });
  });
  // a drag isn't a click on the review's Google link
  stage.addEventListener('click', function(e){ if(moved){ e.preventDefault(); moved = false; } }, true);
  stage.addEventListener('dragstart', function(e){ e.preventDefault(); });

  var settle = null;
  stage.addEventListener('scroll', function(){ if(raf || down || settling) return; clearTimeout(settle); settle = setTimeout(recentre, 150); }, {passive:true});
  function init(){ measure(); stage.scrollLeft = base; }
  init();
  window.addEventListener('load', init);
  window.addEventListener('resize', function(){ var k = nearest(); measure(); if(cards[k]) stage.scrollLeft = centreOf(cards[k]); });
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(entries){ if(entries[0].isIntersecting) startAuto(); }, {threshold:0.3}).observe(stage);
  } else startAuto();
})();

(function(){
  // ---- photo reel: sits still, loops forever both ways. Swipe, scroll sideways,
  // or drag with a mouse. ----
  var track = document.getElementById('reelTrack');
  if(!track) return;
  var originals = Array.prototype.slice.call(track.children);
  function cloneSet(){
    var frag = document.createDocumentFragment();
    originals.forEach(function(a){ var k = a.cloneNode(true); k.setAttribute('aria-hidden', 'true'); k.setAttribute('tabindex', '-1'); frag.appendChild(k); });
    return frag;
  }
  // [copy][real][copy]: start in the middle, hop back by one set whenever you near an end
  track.insertBefore(cloneSet(), track.firstChild);
  track.appendChild(cloneSet());
  var setW = 0;
  function measure(){
    setW = originals[0].offsetLeft - track.children[0].offsetLeft;
  }
  function recentre(){
    if(!setW) return;
    if(track.scrollLeft < setW * 0.5) track.scrollLeft += setW;
    else if(track.scrollLeft > setW * 1.5) track.scrollLeft -= setW;
  }
  function init(){ measure(); track.scrollLeft = setW; }
  init();
  window.addEventListener('load', init);
  window.addEventListener('resize', function(){ var r = setW ? (track.scrollLeft / setW) : 1; measure(); track.scrollLeft = r * setW; });
  var t = null;
  track.addEventListener('scroll', function(){ clearTimeout(t); t = setTimeout(recentre, 120); }, {passive:true});

  var down = false, moved = false, startX = 0, startLeft = 0, speed = Spring.tracker(), coast = null;
  function stopCoast(){ if(coast){ coast.stop(); coast = null; track.classList.remove('is-dragging'); } }
  // The scroll position at which a photo lines up with the start of the row.
  var padLeft = function(){ return parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0; };
  function snapFor(aim){
    var tr = track.getBoundingClientRect().left, pad = padLeft(), best = aim, bestD = Infinity;
    for(var i = 0; i < track.children.length; i++){
      var x = track.scrollLeft + (track.children[i].getBoundingClientRect().left - tr) - pad;
      var d = Math.abs(x - aim);
      if(d < bestD){ bestD = d; best = x; }
    }
    return best;
  }
  track.addEventListener('pointerdown', function(e){
    stopCoast();
    if(e.pointerType !== 'mouse') return; // touch already swipes natively
    down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
    speed.reset(); speed.add(track.scrollLeft);
  });
  ['wheel', 'touchstart'].forEach(function(ev){ track.addEventListener(ev, stopCoast, {passive:true}); });
  window.addEventListener('pointermove', function(e){
    if(!down) return;
    var dx = e.clientX - startX;
    if(!moved && Math.abs(dx) > 5){ moved = true; track.classList.add('is-dragging'); }
    if(moved){ track.scrollLeft = startLeft - dx; speed.add(track.scrollLeft); }
  });
  window.addEventListener('pointerup', function(){
    if(!down) return;
    down = false;
    if(!moved){ track.classList.remove('is-dragging'); return; }
    // Let go with a flick and the row keeps going, slows like a real scroll, and
    // settles on a photo; snapping stays off until it has landed exactly there.
    var v = speed.velocity(), here = track.scrollLeft;
    coast = Spring.handoff(here, snapFor(here + Spring.project(v)), v,
      function(x){ track.scrollLeft = x; },
      function(){ coast = null; track.classList.remove('is-dragging'); recentre(); });
  });
  track.addEventListener('click', function(e){ if(moved){ e.preventDefault(); moved = false; } }, true);
  track.addEventListener('dragstart', function(e){ e.preventDefault(); });
})();

(function(){
  // ---- gallery page: tap a photo and it grows out of its place in the grid, and
  // shrinks back into it when closed, like Photos on an iPhone. Swipe sideways (or
  // the arrows, or the arrow keys) for the next one; swipe down, Esc or tap
  // outside to close. Pinch-zoom still works. ----
  var grid = document.getElementById('gGrid');
  var box = document.getElementById('gBox');
  if(!grid || !box) return;
  var items = Array.prototype.slice.call(grid.querySelectorAll('.g-item'));
  var img = document.getElementById('gBoxImg'), cap = document.getElementById('gBoxCap');
  var buttons = Array.prototype.slice.call(box.querySelectorAll('.round-btn'));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var index = 0, lastFocus = null, closing = false, motion = null, swallowClick = false;
  var EASE = 'cubic-bezier(.2,.85,.25,1)';   // close to a spring with no bounce
  var DIM = 0.92;                             // the backdrop's darkness when open
  img.style.transformOrigin = '0 0';

  function thumb(i){ return items[i].querySelector('img'); }
  function show(i){
    index = (i + items.length) % items.length;
    var t = thumb(index), mine = index;
    // The grid's copy is already loaded, so the photo is there at once at its
    // full size; the large, sharp copy takes over the moment it arrives.
    img.src = t.currentSrc || t.src;
    img.alt = t.alt;
    cap.textContent = items[index].getAttribute('data-caption') || ''; // only meals have a caption
    var full = items[index].getAttribute('data-full');
    if(full && full !== img.src){ var hd = new Image(); hd.onload = function(){ if(index === mine && !box.hidden) img.src = full; }; hd.src = full; }
    // Keep the photo's own spot in the grid in view behind the viewer, so
    // closing always has somewhere to shrink back to.
    var root = document.documentElement, was = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    var r = items[index].getBoundingClientRect();
    if(r.top < 0 || r.bottom > innerHeight) items[index].scrollIntoView({block:'center'});
    root.style.scrollBehavior = was;
  }
  function rect(el){ var r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; }
  // The transform that puts the viewer's photo exactly over another box.
  function over(target, base){ return 'translate(' + (target.x - base.x) + 'px,' + (target.y - base.y) + 'px) scale(' + (target.w / base.w) + ')'; }
  function baseRect(){ var cur = img.style.transform; img.style.transform = 'none'; var r = rect(img); img.style.transform = cur; return r; }
  function setDim(a){ box.style.backgroundColor = 'rgba(28,20,14,' + a.toFixed(3) + ')'; }
  function setControls(o){ buttons.concat(cap).forEach(function(b){ b.style.opacity = o; }); }
  function whenSized(fn){ if(img.complete && img.naturalWidth) fn(); else img.addEventListener('load', fn, {once:true}); }
  function stopMotion(){ if(motion){ motion.stop(); motion = null; } }

  function open(i){
    lastFocus = document.activeElement;
    show(i);
    box.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    box.querySelector('.g-close').focus({preventScroll:true});
    closing = false; stopMotion();
    if(reduce || !img.animate){ setDim(DIM); setControls(1); img.style.transform = ''; return; }
    var t = thumb(index);
    setDim(0); setControls(0);
    img.style.transform = 'translate(-200vw,0)'; // out of sight until it can be placed exactly
    whenSized(function(){
      var base = baseRect(), from = rect(t);
      t.style.visibility = 'hidden';          // the photo has lifted out of the grid
      var k = 0;
      motion = Spring.run(0, 1, 0, function(p){
        k = p;
        var s = from.w / base.w + (1 - from.w / base.w) * p;
        img.style.transform = 'translate(' + ((from.x - base.x) * (1 - p)) + 'px,' + ((from.y - base.y) * (1 - p)) + 'px) scale(' + s + ')';
        setDim(DIM * Math.min(1, p * 1.4)); setControls(Math.max(0, (p - 0.35) / 0.65));
      }, function(){ motion = null; img.style.transform = ''; setDim(DIM); setControls(1); t.style.visibility = ''; }, 0.42);
    });
  }

  function close(){
    if(box.hidden || closing) return;
    closing = true; stopMotion();
    var t = thumb(index), root = document.documentElement;
    function done(){
      box.hidden = true; closing = false; motion = null;
      img.style.transform = ''; setDim(DIM); setControls(1); t.style.visibility = '';
      root.style.overflow = '';
      if(lastFocus) lastFocus.focus({preventScroll:true});
    }
    if(reduce || !img.animate){ done(); return; }
    var tr = t.getBoundingClientRect();
    var base = baseRect(), cur = rect(img), to = rect(t);
    var startDim = parseFloat((box.style.backgroundColor.match(/[\d.]+\)$/) || ['0.92'])[0]) || DIM;
    if(!tr.width || tr.bottom < 0 || tr.top > innerHeight){
      // Its spot isn't on screen: fade away instead.
      motion = Spring.run(1, 0, 0, function(p){ setDim(startDim * p); setControls(p); img.style.opacity = p; }, function(){ img.style.opacity = ''; done(); }, 0.3);
      return;
    }
    t.style.visibility = 'hidden';
    // From wherever the photo is now (mid-swipe or at rest) back into its spot.
    var from = cur, s0 = from.w / base.w, s1 = to.w / base.w;
    motion = Spring.run(0, 1, 0, function(p){
      var x = from.x + (to.x - from.x) * p - base.x, y = from.y + (to.y - from.y) * p - base.y, s = s0 + (s1 - s0) * p;
      img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
      setDim(startDim * (1 - p)); setControls(Math.max(0, 1 - p * 2));
    }, done, 0.38);
  }

  // Next or previous: the photo slides away the way you swiped, the next slides in.
  function page(dir, fromX, v){
    stopMotion();
    if(reduce || !img.animate){ show(index + dir); img.style.transform = ''; return; }
    var w = innerWidth, gone = w * 0.55, back = w * 0.28;
    motion = Spring.run(fromX || 0, -dir * w, v || 0, function(x){
      img.style.transform = 'translateX(' + x + 'px)';
      img.style.opacity = Math.max(0.2, 1 - Math.abs(x) / w);
      return Math.abs(x) < gone;                 // far enough: hand over to the next photo
    }, function(){
      show(index + dir);
      motion = Spring.run(dir * back, 0, 0, function(x){ img.style.transform = 'translateX(' + x + 'px)'; img.style.opacity = 1 - Math.abs(x) / back * 0.6; },
        function(){ motion = null; img.style.transform = ''; img.style.opacity = ''; }, 0.3);
    }, 0.26);
  }

  items.forEach(function(it, i){ it.querySelector('.g-open').addEventListener('click', function(){ open(i); }); });
  box.querySelector('.g-close').addEventListener('click', close);
  box.querySelector('.g-prev').addEventListener('click', function(){ page(-1); });
  box.querySelector('.g-next').addEventListener('click', function(){ page(1); });
  box.addEventListener('click', function(e){ if(swallowClick){ swallowClick = false; return; } if(e.target === box) close(); });
  document.addEventListener('keydown', function(e){
    if(box.hidden) return;
    if(e.key === 'Escape') close();
    else if(e.key === 'ArrowLeft') page(-1);
    else if(e.key === 'ArrowRight') page(1);
  });

  // Swipes (fingers and pens; a mouse uses the arrows). The photo follows the
  // finger exactly, and decides what to do from where you were heading.
  var drag = null;
  box.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'mouse' || box.hidden || closing || e.target.closest('.round-btn')) return;
    stopMotion(); img.style.opacity = '';
    drag = {id:e.pointerId, x0:e.clientX, y0:e.clientY, axis:null, dx:0, dy:0, speed:Spring.tracker()};
  });
  box.addEventListener('pointermove', function(e){
    if(!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if(!drag.axis){
      if(Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : (dy > 0 ? 'y' : null);
      if(!drag.axis){ drag = null; return; }
      try{ box.setPointerCapture(e.pointerId); }catch(err){}
    }
    if(drag.axis === 'x'){
      drag.dx = dx; drag.speed.add(dx);
      img.style.transform = 'translateX(' + dx + 'px)';
    } else {
      drag.dx = dx; drag.dy = Math.max(0, dy); drag.speed.add(drag.dy);
      var k = Math.min(1, drag.dy / 420);
      img.style.transform = 'translate(' + (dx * 0.35) + 'px,' + drag.dy + 'px) scale(' + (1 - 0.22 * k) + ')';
      setDim(DIM * (1 - k)); setControls(1 - k);
    }
  });
  function endDrag(e){
    if(!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if(!d.axis) return;
    swallowClick = true; setTimeout(function(){ swallowClick = false; }, 300);
    var v = d.speed.velocity();
    if(d.axis === 'x'){
      var aim = d.dx + Spring.project(v) * 0.35;
      if(Math.abs(aim) > innerWidth * 0.25) page(aim < 0 ? 1 : -1, d.dx, v);
      else motion = Spring.run(d.dx, 0, v, function(x){ img.style.transform = 'translateX(' + x + 'px)'; }, function(){ motion = null; img.style.transform = ''; }, 0.36);
    } else {
      if(d.dy > 110 || v > 650) close();
      else {
        var fromDy = d.dy, fromDx = d.dx;
        motion = Spring.run(1, 0, 0, function(p){
          var dy = fromDy * p, k = Math.min(1, dy / 420);
          img.style.transform = 'translate(' + (fromDx * 0.35 * p) + 'px,' + dy + 'px) scale(' + (1 - 0.22 * k) + ')';
          setDim(DIM * (1 - k)); setControls(1 - k);
        }, function(){ motion = null; img.style.transform = ''; setDim(DIM); setControls(1); }, 0.36);
      }
    }
  }
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
})();

// ---- visit counter for the 79th client portal. No cookies, nothing personal sent ----
// Opening the site with #nocount stops this device being counted (#count undoes it),
// so the owner's own visits don't inflate the numbers.
(function(){
  try{
    if(location.hash === '#nocount'){ localStorage.setItem('rc-stats-ignore', '1'); history.replaceState(null, '', location.pathname + location.search); }
    else if(location.hash === '#count'){ localStorage.removeItem('rc-stats-ignore'); history.replaceState(null, '', location.pathname + location.search); }
    if(localStorage.getItem('rc-stats-ignore') === '1') return;
  }catch(e){}
  if(navigator.webdriver || !navigator.sendBeacon) return;
  var path = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  // iPads say they're Macs; a "Mac" with a touch screen is an iPad.
  var tablet = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  function send(type){
    try{ navigator.sendBeacon('/api/hit', JSON.stringify({t: type, p: path, r: type === 'view' ? document.referrer : '', d: tablet ? 'Tablet' : ''})); }catch(e){}
  }
  send('view');
  document.addEventListener('click', function(e){
    if(e.defaultPrevented) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if(!a) return;
    var h = a.getAttribute('href');
    var t = /^tel:/.test(h) ? 'call'
      : /ubereats\.com/.test(h) ? 'ubereats'
      : /maps\/dir/.test(h) ? 'directions'
      : /writereview/.test(h) ? 'review'
      : /^mailto:.*subject=Catering/i.test(h) ? 'catering'
      : /^mailto:/.test(h) ? 'email'
      : /instagram\.com/.test(h) ? 'instagram'
      : /google\.com\/maps\/search/.test(h) ? 'reviews'
      : null;
    if(t) send(t);
  });
})();
