/* ============================================================
   PROMPTING LAB — SCRIPT.JS
   SPA sencilla sin frameworks. Organizado en módulos por
   responsabilidad: estado, robot, navegación, gamificación,
   evaluación, persistencia y sonido.
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     1. ESTADO GLOBAL DE LA APLICACIÓN
     ========================================================== */
  const STORAGE_KEY = 'promptingLabProgress_v1';

  const SLIDE_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'eval'];
  const CHALLENGE_ORDER = ['1', '2', '3', '4', '5', 'result'];

  const state = {
    currentSlide: '1',
    currentChallenge: '1',
    xp: 0,
    evalXp: 0,
    badges: {
      explorer: false,
      zero: false,
      few: false,
      analyst: false,
      architect: false
    },
    completedExercises: {
      slide4: false,
      slide6: false,
      slide7: false
    },
    completedChallenges: {
      1: false,
      2: false,
      3: false,
      4: false,
      5: false
    },
    soundOn: false,
    studentName: ''
  };

  /* ==========================================================
     2. UTILIDADES
     ========================================================== */
  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }
  function $all(selector, scope) {
    return Array.from((scope || document).querySelectorAll(selector));
  }
  function announce(message) {
    const el = $('#srAnnouncer');
    if (el) el.textContent = message;
  }
  function normalize(text) {
    return (text || '')
      .toString()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .trim();
  }

  /* ==========================================================
     3. SISTEMA DE SONIDO (Web Audio API, sin archivos externos)
     ========================================================== */
  const Sound = (function () {
    let ctx = null;
    function ensureCtx() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) ctx = new AudioCtx();
      }
      return ctx;
    }
    function tone(freq, duration, type, delay) {
      if (!state.soundOn) return;
      const audioCtx = ensureCtx();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + (delay || 0));
      gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + (delay || 0) + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (delay || 0) + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + (delay || 0));
      osc.stop(audioCtx.currentTime + (delay || 0) + duration + 0.05);
    }
    return {
      click: () => tone(420, 0.08, 'square'),
      success: () => { tone(523, 0.12, 'sine'); tone(659, 0.12, 'sine', 0.1); tone(784, 0.18, 'sine', 0.2); },
      error: () => { tone(220, 0.18, 'sawtooth'); tone(160, 0.22, 'sawtooth', 0.12); },
      badge: () => { tone(660, 0.1, 'triangle'); tone(880, 0.16, 'triangle', 0.1); },
      victory: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'sine', i * 0.14)); },
      unlockCtx: () => ensureCtx()
    };
  })();

  /* ==========================================================
     4. ROBOT — MÁQUINA DE ESTADOS
     ==========================================================
     setRobotState(state) centraliza el control del robot.
     Estados válidos: idle | explaining | exercise | walk | error | success | victory

     NOTA SOBRE SPLINE:
     Si se sustituye el SVG por un <spline-viewer>, esta función es
     el único punto que hay que adaptar: en vez de cambiar el atributo
     data-state del SVG, se debe llamar al evento/estado de Spline
     correspondiente, por ejemplo:
       document.getElementById('robotSpline').emitEvent('mouseDown', 'idle_to_success')
     (el nombre exacto del evento depende de cómo se hayan nombrado
     los estados dentro de la escena de Spline; ver PASO 5 de la guía).
     ========================================================== */
  let robotStateTimeout = null;

  function setRobotState(newState) {
    const svg = $('#robotSvg');
    const glow = $('.robot-glow');
    const caption = $('#robotCaption');
    if (!svg) return;

    svg.setAttribute('data-state', newState);

    // Limpia clases de glow anteriores
    glow.classList.remove('glow--error', 'glow--success', 'glow--victory');

    const captions = {
      idle: 'Tu compañero de misión',
      explaining: 'Te lo explico paso a paso',
      exercise: '¡Te toca a ti!',
      walk: 'Avanzando a la siguiente lección…',
      error: 'Casi lo tienes, inténtalo de nuevo',
      success: '¡Correcto! Buen trabajo',
      victory: '¡Misión completada!'
    };
    caption.textContent = captions[newState] || captions.idle;

    if (newState === 'error') glow.classList.add('glow--error');
    if (newState === 'success') { glow.classList.add('glow--success'); spawnParticles('#39FF88'); }
    if (newState === 'victory') { glow.classList.add('glow--victory'); spawnParticles('#FFD84D'); }

    // Los estados transitorios (error/success/walk) vuelven a idle solos
    clearTimeout(robotStateTimeout);
    if (['error', 'success', 'walk'].includes(newState)) {
      robotStateTimeout = setTimeout(() => {
        // Solo vuelve a idle si nadie más cambió el estado mientras tanto
        if (svg.getAttribute('data-state') === newState) setRobotState('idle');
      }, newState === 'walk' ? 900 : 1600);
    }
  }

  function spawnParticles(color) {
    const layer = $('#particles');
    if (!layer) return;
    layer.innerHTML = '';
    const count = 10;
    for (let i = 0; i < count; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const x = 60 + Math.random() * 120;
      const y = 60 + Math.random() * 40;
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      c.setAttribute('r', 2 + Math.random() * 2.5);
      c.setAttribute('fill', color);
      c.style.animation = `particleUp ${0.8 + Math.random() * 0.6}s ease-out forwards`;
      c.style.animationDelay = `${Math.random() * 0.15}s`;
      layer.appendChild(c);
    }
    setTimeout(() => { layer.innerHTML = ''; }, 1600);
  }

  /* ==========================================================
     5. NAVEGACIÓN DE DIAPOSITIVAS
     ========================================================== */
  function showSlide(id, opts) {
    opts = opts || {};
    SLIDE_ORDER.forEach((s) => {
      const el = document.getElementById('slide-' + s);
      if (el) el.hidden = (s !== id);
    });
    state.currentSlide = id;
    updateHud();
    saveProgress();

    if (!opts.silent) {
      setRobotState('walk');
    }

    // El robot "explica" en slides de contenido puro y "espera" en las de ejercicio
    const exerciseSlides = ['4', '6', '7'];
    setTimeout(() => {
      setRobotState(exerciseSlides.includes(id) ? 'exercise' : (id === 'eval' ? 'exercise' : 'explaining'));
    }, id && !opts.silent ? 950 : 0);

    updateNavButtons();
    // Mueve el foco al título de la slide para usuarios de teclado/lector de pantalla
    const activeSlide = document.getElementById('slide-' + id);
    if (activeSlide) {
      const heading = activeSlide.querySelector('h1, h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextSlide() {
    const idx = SLIDE_ORDER.indexOf(state.currentSlide);
    if (idx < SLIDE_ORDER.length - 1) {
      showSlide(SLIDE_ORDER[idx + 1]);
    }
  }
  function previousSlide() {
    const idx = SLIDE_ORDER.indexOf(state.currentSlide);
    if (idx > 0) {
      showSlide(SLIDE_ORDER[idx - 1]);
    }
  }

  function updateNavButtons() {
    const nav = $('#slideNav');
    const prevBtn = $('#prevBtn');
    const nextBtn = $('#nextBtn');
    if (state.currentSlide === 'eval') { nav.style.display = 'none'; return; }
    nav.style.display = 'flex';
    prevBtn.disabled = state.currentSlide === '1';
    nextBtn.textContent = state.currentSlide === '9' ? 'Ir a evaluación →' : 'Siguiente →';
  }

  function updateHud() {
    const idx = SLIDE_ORDER.indexOf(state.currentSlide);
    const totalContentSlides = 9;
    const lessonNum = Math.min(idx + 1, totalContentSlides);
    $('#hudLessonLabel').textContent = state.currentSlide === 'eval'
      ? 'Evaluación final'
      : `Lección ${lessonNum} / 9`;

    const pct = state.currentSlide === 'eval' ? 100 : Math.round((lessonNum / totalContentSlides) * 100);
    $('#hudProgressFill').style.width = pct + '%';
    $('#hudProgressBar').setAttribute('aria-valuenow', String(pct));
    $('#hudXp').textContent = String(state.xp);
  }

  /* ==========================================================
     6. GAMIFICACIÓN: XP E INSIGNIAS
     ========================================================== */
  function addXP(amount) {
    state.xp += amount;
    $('#hudXp').textContent = String(state.xp);
    showFloatingToast(`+${amount} XP`);
    announce(`Sumaste ${amount} puntos de experiencia. Total: ${state.xp}.`);
    saveProgress();
  }

  function showFloatingToast(text) {
    const toast = document.createElement('div');
    toast.className = 'floating-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1600);
  }

  function unlockBadge(key) {
    if (state.badges[key]) return; // ya desbloqueada, evita duplicados
    state.badges[key] = true;
    saveProgress();
    renderBadges(true);
    Sound.badge();
    const names = {
      explorer: 'Explorador de Prompts',
      zero: 'Maestro Zero-shot',
      few: 'Maestro Few-shot',
      analyst: 'Analista de Prompts',
      architect: 'Arquitecto de Prompts'
    };
    showFloatingToast(`🏅 Insignia desbloqueada: ${names[key]}`);
    announce(`Insignia desbloqueada: ${names[key]}.`);
  }

  function renderBadges(animateNew) {
    $all('.badge-item').forEach((item) => {
      const key = item.getAttribute('data-badge');
      const unlocked = !!state.badges[key];
      item.classList.toggle('is-unlocked', unlocked);
      if (unlocked && animateNew) {
        item.classList.remove('badge-pop');
        void item.offsetWidth; // reinicia animación
        item.classList.add('badge-pop');
      }
    });
  }

  /* ==========================================================
     7. PERSISTENCIA (localStorage)
     ========================================================== */
  function saveProgress() {
    try {
      const data = {
        currentSlide: state.currentSlide,
        currentChallenge: state.currentChallenge,
        xp: state.xp,
        evalXp: state.evalXp,
        badges: state.badges,
        completedExercises: state.completedExercises,
        completedChallenges: state.completedChallenges,
        soundOn: state.soundOn,
        studentName: state.studentName
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('No se pudo guardar el progreso:', e);
    }
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(state.badges, data.badges || {});
      Object.assign(state.completedExercises, data.completedExercises || {});
      Object.assign(state.completedChallenges, data.completedChallenges || {});
      state.xp = typeof data.xp === 'number' ? data.xp : 0;
      state.evalXp = typeof data.evalXp === 'number' ? data.evalXp : 0;
      state.soundOn = !!data.soundOn;
      state.studentName = data.studentName || '';
      state.currentSlide = data.currentSlide || '1';
      state.currentChallenge = data.currentChallenge || '1';
    } catch (e) {
      console.warn('No se pudo cargar el progreso guardado:', e);
    }
  }

  function resetProgress() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  /* ==========================================================
     8. VALIDACIÓN DE EJERCICIOS DE CONTENIDO (slides 4, 6, 7)
     ========================================================== */
  function initOptionGroup(container, onSelect) {
    $all('.option-btn', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        $all('.option-btn', container).forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        Sound.click();
        if (onSelect) onSelect(btn.getAttribute('data-value'));
      });
    });
  }

  function markOptionResult(container, correctValue, chosenValue) {
    $all('.option-btn', container).forEach((btn) => {
      const val = btn.getAttribute('data-value');
      btn.classList.remove('is-selected');
      if (val === correctValue) btn.classList.add('is-correct');
      else if (val === chosenValue) btn.classList.add('is-incorrect');
    });
  }

  function setFeedback(key, message, ok) {
    const el = $(`[data-feedback="${key}"]`);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-success', ok === true);
    el.classList.toggle('is-error', ok === false);
  }

  // ---- Slide 4: clasificación de sentimiento (Zero-shot) ----
  let slide4Selection = null;
  function initSlide4() {
    const container = $('#ex-slide4');
    initOptionGroup(container, (val) => { slide4Selection = val; });
    $('[data-action="check-slide4"]').addEventListener('click', checkSlide4);
  }
  function checkSlide4() {
    if (!slide4Selection) { setFeedback('slide4', 'Selecciona una opción antes de comprobar.', false); return; }
    const correct = slide4Selection === 'Neutro';
    markOptionResult($('#ex-slide4'), 'Neutro', slide4Selection);
    if (correct) {
      setFeedback('slide4', '¡Correcto! No se proporcionó ningún ejemplo previo.', true);
      setRobotState('success');
      Sound.success();
      if (!state.completedExercises.slide4) { addXP(10); state.completedExercises.slide4 = true; unlockBadge('zero'); }
    } else {
      setFeedback('slide4', 'No es del todo así: el comentario mezcla algo negativo (retraso) con algo positivo (funciona excelente), por eso el sentimiento predominante es Neutro.', false);
      setRobotState('error');
      Sound.error();
      shakeElement($('#ex-slide4'));
    }
    saveProgress();
  }

  // ---- Slide 6: JSON few-shot ----
  function initSlide6() {
    $('[data-action="check-slide6"]').addEventListener('click', checkSlide6);
  }
  function checkSlide6() {
    const raw = $('#jsonInput').value;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setFeedback('slide6', 'Eso todavía no es un JSON válido. Revisa comillas, comas y llaves.', false);
      setRobotState('error'); Sound.error(); shakeElement($('#ex-slide6'));
      return;
    }
    const nombreOk = normalize(parsed.nombre) === normalize('Carlos Ruiz');
    const ciudadOk = normalize(parsed.ciudad) === normalize('Valencia');
    const edadOk = Number(parsed.edad) === 42;

    if (nombreOk && ciudadOk && edadOk) {
      setFeedback('slide6', '¡Correcto! Replicaste el patrón de los dos ejemplos anteriores.', true);
      setRobotState('success'); Sound.success();
      if (!state.completedExercises.slide6) {
        addXP(15); state.completedExercises.slide6 = true;
        unlockBadge('few');
      }
    } else {
      const missing = [];
      if (!nombreOk) missing.push('nombre');
      if (!ciudadOk) missing.push('ciudad');
      if (!edadOk) missing.push('edad');
      setFeedback('slide6', `El JSON es válido, pero revisa: ${missing.join(', ')}.`, false);
      setRobotState('error'); Sound.error(); shakeElement($('#ex-slide6'));
    }
    saveProgress();
  }

  // ---- Slide 7: Zero-shot vs Few-shot ----
  let slide7Selection = null;
  function initSlide7() {
    const container = $('#ex-slide7');
    initOptionGroup(container, (val) => { slide7Selection = val; });
    $('[data-action="check-slide7"]').addEventListener('click', checkSlide7);
  }
  function checkSlide7() {
    if (!slide7Selection) { setFeedback('slide7', 'Elige una opción antes de comprobar.', false); return; }
    const correct = slide7Selection === 'B';
    markOptionResult($('#ex-slide7'), 'B', slide7Selection);
    if (correct) {
      setFeedback('slide7', '¡Exacto! Few-shot da mucha más consistencia de formato.', true);
      setRobotState('success'); Sound.success();
      if (!state.completedExercises.slide7) { addXP(5); state.completedExercises.slide7 = true; }
    } else {
      setFeedback('slide7', 'Zero-shot es más simple, pero no garantiza un formato JSON estable. Few-shot es la mejor opción aquí.', false);
      setRobotState('error'); Sound.error(); shakeElement($('#ex-slide7'));
    }
    saveProgress();
  }

  function shakeElement(el) {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  /* ==========================================================
     9. MÓDULO DE EVALUACIÓN FINAL (5 desafíos)
     ========================================================== */
  function showChallenge(id) {
    CHALLENGE_ORDER.forEach((c) => {
      const el = document.getElementById('challenge-' + c);
      if (el) el.hidden = (c !== id);
    });
    state.currentChallenge = id;
    saveProgress();

    const idx = CHALLENGE_ORDER.indexOf(id);
    const totalChallenges = 5;
    if (id !== 'result') {
      $('#evalChallengeLabel').textContent = `Desafío ${idx + 1} / 5`;
    }
    const pct = id === 'result' ? 100 : Math.round((idx / totalChallenges) * 100);
    $('#evalProgressFill').style.width = pct + '%';
    $('#evalProgressBar').setAttribute('aria-valuenow', String(pct));
    $('#evalScoreLabel').textContent = `XP: ${state.evalXp}/100`;

    setRobotState(id === 'result' ? 'victory' : 'exercise');

    if (id === 'result') renderResult();

    const heading = document.getElementById('challenge-' + id)?.querySelector('h3');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }

  function markChallengeSolved(numKey, xpAmount) {
    if (state.completedChallenges[numKey]) return false; // evita sumar XP repetido
    state.completedChallenges[numKey] = true;
    state.evalXp += xpAmount;
    $('#evalScoreLabel').textContent = `XP: ${state.evalXp}/100`;
    showFloatingToast(`+${xpAmount} XP`);
    saveProgress();
    return true;
  }

  function showChallengeNext(numKey) {
    const challengeEl = document.getElementById('challenge-' + numKey);
    const nextBtn = $('.challenge__next', challengeEl);
    if (nextBtn) nextBtn.hidden = false;
  }

  // ---- Desafío 1: identificación de técnica ----
  let c1Selection = null;
  function initChallenge1() {
    const container = $('#challenge-1');
    initOptionGroup(container, (v) => { c1Selection = v; });
    $('[data-action="check-1"]', container).addEventListener('click', () => {
      if (!c1Selection) { setFeedback('1', 'Elige una opción.', false); return; }
      const correct = c1Selection === 'B';
      markOptionResult(container, 'B', c1Selection);
      if (correct) {
        setFeedback('1', 'Correcto: no se dio ningún ejemplo previo, solo una instrucción directa. Eso es Zero-shot Prompting.', true);
        setRobotState('success'); Sound.success();
        if (markChallengeSolved(1, 20)) unlockBadge('zero');
        showChallengeNext('1');
      } else {
        setFeedback('1', 'No es correcta. Recuerda: no hay ejemplos de entrada/salida, solo una instrucción directa — eso descarta Few-shot, Chain-of-Thought y Fine-tuning.', false);
        setRobotState('error'); Sound.error(); shakeElement(container);
      }
    });
  }

  // ---- Desafío 2: rellenar espacio ----
  let c2Selection = null;
  function initChallenge2() {
    const container = $('#challenge-2');
    initOptionGroup(container, (v) => { c2Selection = v; });
    $('[data-action="check-2"]', container).addEventListener('click', () => {
      if (!c2Selection) { setFeedback('2', 'Elige una opción.', false); return; }
      const correct = c2Selection === 'few-shot';
      markOptionResult(container, 'few-shot', c2Selection);
      if (correct) {
        setFeedback('2', 'Correcto: incluir ejemplos previos ayuda al modelo a replicar el formato JSON deseado.', true);
        setRobotState('success'); Sound.success();
        markChallengeSolved(2, 20);
        showChallengeNext('2');
      } else {
        setFeedback('2', 'Zero-shot no da ejemplos de formato, así que es más propenso a errores de sintaxis en JSON. La respuesta correcta es Few-shot.', false);
        setRobotState('error'); Sound.error(); shakeElement(container);
      }
    });
  }

  // ---- Desafío 3: análisis de caso ----
  let c3Sentiment = null;
  let c3Technique = null;
  function initChallenge3() {
    const container = $('#challenge-3');
    const sentimentGroup = $('[data-group="c3-sentiment"]', container);
    const techniqueGroup = $('[data-group="c3-technique"]', container);
    initOptionGroup(sentimentGroup, (v) => { c3Sentiment = v; });
    initOptionGroup(techniqueGroup, (v) => { c3Technique = v; });
    $('[data-action="check-3"]', container).addEventListener('click', () => {
      if (!c3Sentiment || !c3Technique) { setFeedback('3', 'Selecciona sentimiento y técnica antes de comprobar.', false); return; }
      const correct = c3Sentiment === 'Neutro' && c3Technique === 'few-shot';
      markOptionResult(sentimentGroup, 'Neutro', c3Sentiment);
      markOptionResult(techniqueGroup, 'few-shot', c3Technique);
      if (correct) {
        setFeedback('3', 'Correcto: el tweet no es claramente positivo ni negativo (Neutro), y la técnica es Few-shot porque los dos ejemplos anteriores guían al modelo.', true);
        setRobotState('success'); Sound.success();
        if (markChallengeSolved(3, 20)) unlockBadge('analyst');
        showChallengeNext('3');
      } else {
        setFeedback('3', 'Revisa de nuevo: el tweet describe un hecho sin carga positiva ni negativa clara (Neutro), y hay dos ejemplos previos de entrada→salida guiando la respuesta (Few-shot).', false);
        setRobotState('error'); Sound.error(); shakeElement(container);
      }
    });
  }

  // ---- Desafío 4: transformar prompt (validación flexible) ----
  function initChallenge4() {
    const container = $('#challenge-4');
    $('[data-action="check-4"]', container).addEventListener('click', () => {
      const text = normalize($('#fewShotBuilder').value);

      // Validación conceptual, no literal: buscamos evidencia de cada
      // elemento estructural de un prompt Few-shot bien construido.
      const hasTwoExamples = (text.match(/ejemplo/g) || []).length >= 2;
      const hasArrow = (text.match(/->|→/g) || []).length >= 2; // al menos 2 relaciones entrada->salida
      const hasNewTask = /tarea|carlos mendoza/.test(text);
      const hasPattern = /mendoza,\s*c\.?/.test(text); // patrón "Apellido, Inicial" aplicado al caso nuevo
      const hasCarlos = /carlos mendoza/.test(text);

      const score = [hasTwoExamples, hasArrow, hasNewTask, hasCarlos].filter(Boolean).length;
      const correct = score >= 3 && hasPattern; // exige que además resuelva bien el patrón

      if (correct) {
        setFeedback('4', 'Correcto: incluiste ejemplos de entrada→salida y aplicaste el mismo patrón a "Carlos Mendoza" → "Mendoza, C.".', true);
        setRobotState('success'); Sound.success();
        if (markChallengeSolved(4, 20)) unlockBadge('few');
        showChallengeNext('4');
      } else if (score >= 3 && !hasPattern) {
        setFeedback('4', 'Casi. Tienes la estructura Few-shot, pero falta aplicar el patrón "Apellido, Inicial" al caso de Carlos Mendoza (debería quedar "Mendoza, C.").', false);
        setRobotState('error'); Sound.error(); shakeElement(container);
      } else {
        setFeedback('4', 'Te falta estructura Few-shot: incluye al menos 2 ejemplos con el formato "entrada -> salida" y luego la nueva tarea con Carlos Mendoza.', false);
        setRobotState('error'); Sound.error(); shakeElement(container);
      }
    });
  }

  // ---- Desafío 5: verdadero / falso ----
  let c5Selection = null;
  function initChallenge5() {
    const container = $('#challenge-5');
    initOptionGroup(container, (v) => { c5Selection = v; });
    $('[data-action="check-5"]', container).addEventListener('click', () => {
      if (!c5Selection) { setFeedback('5', 'Elige Verdadero o Falso.', false); return; }
      const correct = c5Selection === 'F';
      markOptionResult(container, 'F', c5Selection);
      if (correct) {
        setFeedback('5', 'Correcto: Few-shot usa MÁS tokens de entrada por incluir ejemplos, no menos.', true);
        setRobotState('success'); Sound.success();
        if (markChallengeSolved(5, 20)) unlockBadge('architect');
        showChallengeNext('5');
      } else {
        setFeedback('5', 'Es falso: al añadir ejemplos, Few-shot consume MÁS tokens de entrada que Zero-shot, no menos.', false);
        setRobotState('error'); Sound.error(); shakeElement(container);
      }
    });
  }

  function renderResult() {
    const hits = Object.values(state.completedChallenges).filter(Boolean).length;
    const pct = Math.round((state.evalXp / 100) * 100);
    $('#resultScore').textContent = `${state.evalXp} / 100 XP`;
    $('#resultHits').textContent = `${hits} / 5 aciertos`;
    $('#resultPct').textContent = `${pct}%`;

    let message;
    if (pct >= 90) message = '¡Experto en Prompting!';
    else if (pct >= 70) message = '¡Muy buen dominio!';
    else if (pct >= 50) message = 'Buen comienzo, pero puedes mejorar.';
    else message = 'Te recomendamos repasar la misión.';
    $('#resultMessage').textContent = message;

    Sound.victory();
  }

  /* ==========================================================
     10. MODALES
     ========================================================== */
  function openModal(id) {
    const modal = document.getElementById(id);
    modal.hidden = false;
    const focusable = modal.querySelector('button, input, textarea');
    if (focusable) focusable.focus();
  }
  function closeModal(id) {
    document.getElementById(id).hidden = true;
  }

  /* ==========================================================
     11. INICIALIZACIÓN
     ========================================================== */
  function initNavigation() {
    $('#nextBtn').addEventListener('click', () => { Sound.click(); nextSlide(); });
    $('#prevBtn').addEventListener('click', () => { Sound.click(); previousSlide(); });

    document.addEventListener('keydown', (e) => {
      // No interferir si el usuario está escribiendo en un campo
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (state.currentSlide === 'eval') return;
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'ArrowLeft') previousSlide();
    });

    $('#startMissionBtn').addEventListener('click', () => {
      Sound.click();
      unlockBadge('explorer');
      setRobotState('explaining');
      nextSlide();
    });

    $('#startEvalBtn').addEventListener('click', () => {
      Sound.click();
      showSlide('eval');
      showChallenge(state.currentChallenge || '1');
    });

    $all('.challenge__next').forEach((btn) => {
      btn.addEventListener('click', () => {
        Sound.click();
        showChallenge(btn.getAttribute('data-next'));
      });
    });

    $('#restartFromResultBtn').addEventListener('click', () => {
      Sound.click();
      showSlide('1', { silent: true });
      setRobotState('idle');
    });
  }

  function initHudControls() {
    $('#soundBtn').addEventListener('click', () => {
      state.soundOn = !state.soundOn;
      Sound.unlockCtx();
      $('#soundBtn').textContent = state.soundOn ? '🔊' : '🔇';
      $('#soundBtn').setAttribute('aria-pressed', String(state.soundOn));
      $('#soundBtn').setAttribute('aria-label', state.soundOn ? 'Desactivar sonido' : 'Activar sonido');
      if (state.soundOn) Sound.click();
      saveProgress();
    });

    $('#badgesBtn').addEventListener('click', () => openModal('badgesModal'));
    $('#resetBtn').addEventListener('click', () => openModal('resetModal'));
    $all('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
    });
    $('#confirmResetBtn').addEventListener('click', resetProgress);

    // Cerrar modal con click fuera o Escape
    $all('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $all('.modal-overlay').forEach((o) => { if (!o.hidden) o.hidden = true; });
    });
  }

  function restoreUIFromState() {
    renderBadges(false);
    $('#soundBtn').textContent = state.soundOn ? '🔊' : '🔇';
    $('#soundBtn').setAttribute('aria-pressed', String(state.soundOn));
    $('#coverDate').textContent = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    // Restaura marcas visuales de ejercicios ya completados en las slides de contenido
    if (state.completedExercises.slide4) setFeedback('slide4', '¡Correcto! No se proporcionó ningún ejemplo previo.', true);
    if (state.completedExercises.slide7) setFeedback('slide7', '¡Exacto! Few-shot da mucha más consistencia de formato.', true);

    $('#evalScoreLabel').textContent = `XP: ${state.evalXp}/100`;

    showSlide(state.currentSlide, { silent: true });
    if (state.currentSlide === 'eval') showChallenge(state.currentChallenge);
    setRobotState('idle');
  }

  function init() {
    loadProgress();

    initNavigation();
    initHudControls();
    initSlide4();
    initSlide6();
    initSlide7();
    initChallenge1();
    initChallenge2();
    initChallenge3();
    initChallenge4();
    initChallenge5();

    restoreUIFromState();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
