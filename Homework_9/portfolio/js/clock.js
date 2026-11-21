/**
 * clock.js — Interactive Analog Clock Portfolio Navigation
 *
 * Implements a dual-mode analog clock:
 * 1. Normal mode: Real-time clock updated via requestAnimationFrame
 * 2. Interactive mode: Minute hand tracks cursor smoothly, detects navigation zones,
 *    highlights labels (WORK, ABOUT ME, CONCEPT, CONTACT), and triggers navigation on click.
 */

(function () {
    'use strict';

    // =========================================================================
    // Constants & Configuration
    // =========================================================================
    const NAV_ITEMS = [
        { id: 'nav-work',    label: 'ACHIEVEMENTS', url: 'pages/achievements.html',                 centerAngle: 0   },
        { id: 'nav-about',   label: 'ABOUT ME',     url: 'pages/about.html',                        centerAngle: 90  },
        { id: 'nav-concept', label: 'CONCEPT',      url: 'pages/concept.html',                      centerAngle: 180 },
        { id: 'nav-contact', label: 'GAME',         url: 'https://m-hamza-javaid4.github.io/Heuser/CS_CRP/Homework_6/index.html', centerAngle: 270 }
    ];

    const NAV_ZONE_TOLERANCE = 15; // ±15 degrees around each cardinal point
    const CLOCK_CENTER_X = 200;
    const CLOCK_CENTER_Y = 200;

    // =========================================================================
    // DOM Elements Cache
    // =========================================================================
    let clockSvg = null;
    let ticksGroup = null;
    let hourGroup = null;
    let minuteGroup = null;
    let minuteLine = null;
    const navElements = new Map();

    // =========================================================================
    // Runtime State
    // =========================================================================
    let isHovering = false;
    let isTransitioning = false;
    let transitionTimer = null;

    let realHourAngle = 0;
    let realMinuteAngle = 0;
    let currentMinuteAngle = 0;
    let activeNavZone = null;

    // =========================================================================
    // Initialization
    // =========================================================================
    function init() {
        clockSvg = document.getElementById('clock');
        ticksGroup = document.getElementById('ticks');
        hourGroup = document.getElementById('hour-group');
        minuteGroup = document.getElementById('minute-group');
        minuteLine = minuteGroup ? minuteGroup.querySelector('.hand-minute') : null;

        if (!clockSvg || !hourGroup || !minuteGroup) return;

        // Cache navigation label elements
        NAV_ITEMS.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                navElements.set(item.id, el);
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    navigate(item.url);
                });
            }
        });

        // Generate the 60 tick marks dynamically
        renderTickMarks();

        // Calculate initial time
        computeRealTimeAngles();
        currentMinuteAngle = realMinuteAngle;
        setHourHandAngle(realHourAngle);
        setMinuteHandAngle(realMinuteAngle);

        // Bind interactive mouse & touch events
        bindEvents();

        // Start render loop using requestAnimationFrame
        requestAnimationFrame(renderLoop);
    }

    // =========================================================================
    // Render 60 Subdued Ticks on Clock Face
    // =========================================================================
    function renderTickMarks() {
        if (!ticksGroup) return;
        const tickFragment = document.createDocumentFragment();
        const outerRadius = 172;

        for (let i = 0; i < 60; i++) {
            const isHourTick = (i % 5 === 0);
            const isNavHour = (i % 15 === 0); // At 0, 15, 30, 45 (12, 3, 6, 9)
            
            // Skip ticks directly behind nav text labels for clean spaciousness
            if (isNavHour) continue;

            const tickLen = isHourTick ? 7 : 3.5;
            const innerRadius = outerRadius - tickLen;
            const angleRad = (i * 6) * (Math.PI / 180);

            const x1 = CLOCK_CENTER_X + Math.sin(angleRad) * innerRadius;
            const y1 = CLOCK_CENTER_Y - Math.cos(angleRad) * innerRadius;
            const x2 = CLOCK_CENTER_X + Math.sin(angleRad) * outerRadius;
            const y2 = CLOCK_CENTER_Y - Math.cos(angleRad) * outerRadius;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1.toFixed(2));
            line.setAttribute('y1', y1.toFixed(2));
            line.setAttribute('x2', x2.toFixed(2));
            line.setAttribute('y2', y2.toFixed(2));
            line.setAttribute('class', isHourTick ? 'tick-mark tick-mark--hour' : 'tick-mark');

            tickFragment.appendChild(line);
        }

        ticksGroup.appendChild(tickFragment);
    }

    // =========================================================================
    // Time & Angles Computation
    // =========================================================================
    function computeRealTimeAngles() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const ms = now.getMilliseconds();

        // Continuous smooth hour movement
        realHourAngle = ((hours % 12) + minutes / 60 + seconds / 3600) * 30;

        // Smooth minute angle
        realMinuteAngle = (minutes + (seconds + ms / 1000) / 60) * 6;
    }

    function setHourHandAngle(deg) {
        if (hourGroup) {
            hourGroup.style.transform = `rotate(${deg.toFixed(2)}deg)`;
        }
    }

    function setMinuteHandAngle(deg) {
        if (minuteGroup) {
            minuteGroup.style.transform = `rotate(${deg.toFixed(2)}deg)`;
        }
    }

    // =========================================================================
    // Navigation Zone Logic
    // =========================================================================
    function checkNavZone(angleDeg) {
        const normalized = ((angleDeg % 360) + 360) % 360;
        for (const item of NAV_ITEMS) {
            let diff = Math.abs(normalized - item.centerAngle);
            if (diff > 180) diff = 360 - diff;
            if (diff <= NAV_ZONE_TOLERANCE) {
                return item;
            }
        }
        return null;
    }

    function updateNavHighlights(matchingNav) {
        if (matchingNav === activeNavZone) return;

        // Clear previous highlight
        if (activeNavZone) {
            const prevEl = navElements.get(activeNavZone.id);
            if (prevEl) prevEl.classList.remove('active');
        }

        activeNavZone = matchingNav;

        if (activeNavZone) {
            const nextEl = navElements.get(activeNavZone.id);
            if (nextEl) nextEl.classList.add('active');
            clockSvg.classList.add('interactive-nav');
            if (minuteLine) minuteLine.classList.add('active-nav');
        } else {
            clockSvg.classList.remove('interactive-nav');
            if (minuteLine) minuteLine.classList.remove('active-nav');
        }
    }

    function clearHighlights() {
        updateNavHighlights(null);
    }

    function navigate(url) {
        if (!url) return;
        clockSvg.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out';
        clockSvg.style.transform = 'scale(0.96)';
        clockSvg.style.opacity = '0.7';

        setTimeout(() => {
            window.location.href = url;
        }, 160);
    }

    // =========================================================================
    // Mouse Interaction Handlers
    // =========================================================================
    function getAngleFromCursor(event) {
        const rect = clockSvg.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = event.clientX - centerX;
        const dy = event.clientY - centerY;

        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;
        return angle;
    }

    function getShortestAngleDelta(current, target) {
        let diff = (target - current) % 360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return diff;
    }

    function onMouseEnter(e) {
        isHovering = true;
        isTransitioning = true;
        if (transitionTimer) clearTimeout(transitionTimer);

        const targetAngle = getAngleFromCursor(e);
        const delta = getShortestAngleDelta(currentMinuteAngle, targetAngle);
        const smoothTarget = currentMinuteAngle + delta;

        minuteGroup.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
        currentMinuteAngle = smoothTarget;
        setMinuteHandAngle(smoothTarget);

        const nav = checkNavZone(((smoothTarget % 360) + 360) % 360);
        updateNavHighlights(nav);

        transitionTimer = setTimeout(() => {
            minuteGroup.style.transition = 'none';
            isTransitioning = false;
        }, 280);
    }

    function onMouseMove(e) {
        if (!isHovering) return;
        const cursorAngle = getAngleFromCursor(e);

        if (!isTransitioning) {
            currentMinuteAngle = cursorAngle;
            setMinuteHandAngle(cursorAngle);
            const nav = checkNavZone(cursorAngle);
            updateNavHighlights(nav);
        }
    }

    function onMouseLeave() {
        isHovering = false;
        isTransitioning = true;
        clearHighlights();

        if (transitionTimer) clearTimeout(transitionTimer);

        computeRealTimeAngles();
        const delta = getShortestAngleDelta(currentMinuteAngle, realMinuteAngle);
        const targetAngle = currentMinuteAngle + delta;

        minuteGroup.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
        setMinuteHandAngle(targetAngle);
        currentMinuteAngle = realMinuteAngle;

        transitionTimer = setTimeout(() => {
            minuteGroup.style.transition = 'none';
            isTransitioning = false;
        }, 450);
    }

    function onClick() {
        if (activeNavZone) {
            navigate(activeNavZone.url);
        }
    }

    function onTouchMove(e) {
        if (!e.touches || e.touches.length === 0) return;
        const touch = e.touches[0];
        const cursorAngle = getAngleFromCursor(touch);
        currentMinuteAngle = cursorAngle;
        setMinuteHandAngle(cursorAngle);
        const nav = checkNavZone(cursorAngle);
        updateNavHighlights(nav);
    }

    function bindEvents() {
        clockSvg.addEventListener('mouseenter', onMouseEnter);
        clockSvg.addEventListener('mousemove', onMouseMove);
        clockSvg.addEventListener('mouseleave', onMouseLeave);
        clockSvg.addEventListener('click', onClick);

        // Touch interaction
        clockSvg.addEventListener('touchstart', (e) => {
            isHovering = true;
            onTouchMove(e);
        }, { passive: true });
        clockSvg.addEventListener('touchmove', onTouchMove, { passive: true });
        clockSvg.addEventListener('touchend', () => {
            if (activeNavZone) {
                navigate(activeNavZone.url);
            }
            onMouseLeave();
        });
    }

    // =========================================================================
    // Master Animation Frame Loop
    // =========================================================================
    function renderLoop() {
        computeRealTimeAngles();

        setHourHandAngle(realHourAngle);

        if (!isHovering && !isTransitioning) {
            currentMinuteAngle = realMinuteAngle;
            setMinuteHandAngle(realMinuteAngle);
        }

        requestAnimationFrame(renderLoop);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
