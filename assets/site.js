// Rustic Char: header, phone menu, open/closed line and the reviews row.
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
    stage.addEventListener(ev, function(){ stopAuto(); cancelAnimationFrame(raf); raf = null; stage.classList.remove('is-gliding'); }, {passive:true});
  });

  // mouse drag (fingers and trackpads scroll it natively)
  var down = false, moved = false, startX = 0, startLeft = 0, lastDx = 0;
  stage.addEventListener('pointerdown', function(e){
    stopAuto();
    if(e.pointerType !== 'mouse' || e.button !== 0) return;
    cancelAnimationFrame(raf); raf = null;
    down = true; moved = false; startX = e.clientX; startLeft = stage.scrollLeft; lastDx = 0;
  });
  window.addEventListener('pointermove', function(e){
    if(!down) return;
    lastDx = e.clientX - startX;
    if(!moved && Math.abs(lastDx) > 5){ moved = true; stage.classList.add('is-dragging'); }
    if(moved) stage.scrollLeft = startLeft - lastDx;
  });
  window.addEventListener('pointerup', function(){
    if(!down) return;
    down = false;
    if(!moved) return;
    stage.classList.remove('is-dragging');
    // land on a whole card: a flick of 60px or more moves at least one card in that direction
    var k = nearest();
    var startK = cards.reduce(function(best, c, idx){ return Math.abs(centreOf(c) - startLeft) < Math.abs(centreOf(cards[best]) - startLeft) ? idx : best; }, 0);
    if(k === startK && Math.abs(lastDx) > 60) k += lastDx < 0 ? 1 : -1;
    if(cards[k]) glideTo(centreOf(cards[k]), 450);
  });
  // a drag isn't a click on the review's Google link
  stage.addEventListener('click', function(e){ if(moved){ e.preventDefault(); moved = false; } }, true);
  stage.addEventListener('dragstart', function(e){ e.preventDefault(); });

  var settle = null;
  stage.addEventListener('scroll', function(){ if(raf || down) return; clearTimeout(settle); settle = setTimeout(recentre, 150); }, {passive:true});
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

  var down = false, moved = false, startX = 0, startLeft = 0;
  track.addEventListener('pointerdown', function(e){
    if(e.pointerType !== 'mouse') return; // touch already swipes natively
    down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
  });
  window.addEventListener('pointermove', function(e){
    if(!down) return;
    var dx = e.clientX - startX;
    if(!moved && Math.abs(dx) > 5){ moved = true; track.classList.add('is-dragging'); }
    if(moved) track.scrollLeft = startLeft - dx;
  });
  window.addEventListener('pointerup', function(){
    if(!down) return;
    down = false;
    track.classList.remove('is-dragging');
    recentre();
  });
  track.addEventListener('click', function(e){ if(moved){ e.preventDefault(); moved = false; } }, true);
  track.addEventListener('dragstart', function(e){ e.preventDefault(); });
})();

(function(){
  // ---- gallery page: tap a photo to see it larger; arrows / keys to move, Esc to close ----
  var grid = document.getElementById('gGrid');
  var box = document.getElementById('gBox');
  if(!grid || !box) return;
  var items = Array.prototype.slice.call(grid.querySelectorAll('.g-item'));
  var img = document.getElementById('gBoxImg'), cap = document.getElementById('gBoxCap');
  var index = 0, lastFocus = null;
  function show(i){
    index = (i + items.length) % items.length;
    var src = items[index].querySelector('img');
    img.src = items[index].getAttribute('data-full') || src.currentSrc || src.src; // the large, sharp copy
    img.alt = src.alt;
    cap.textContent = items[index].getAttribute('data-caption') || ''; // only meals have a caption
  }
  function open(i){ lastFocus = document.activeElement; show(i); box.hidden = false; document.documentElement.style.overflow = 'hidden'; box.querySelector('.g-close').focus(); }
  function close(){ box.hidden = true; document.documentElement.style.overflow = ''; if(lastFocus) lastFocus.focus(); }
  items.forEach(function(it, i){ it.querySelector('.g-open').addEventListener('click', function(){ open(i); }); });
  box.querySelector('.g-close').addEventListener('click', close);
  box.querySelector('.g-prev').addEventListener('click', function(){ show(index - 1); });
  box.querySelector('.g-next').addEventListener('click', function(){ show(index + 1); });
  box.addEventListener('click', function(e){ if(e.target === box) close(); });
  document.addEventListener('keydown', function(e){
    if(box.hidden) return;
    if(e.key === 'Escape') close();
    else if(e.key === 'ArrowLeft') show(index - 1);
    else if(e.key === 'ArrowRight') show(index + 1);
  });
})();
