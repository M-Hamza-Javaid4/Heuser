/**
 * achievements.js — Rotary Dial Phone & Achievement Chat Logic (PlanP4)
 *
 * Implements:
 * 1. Geometric positioning of 9 finger holes & numerical labels via trigonometry.
 * 2. Satisfying rotary dial rotation: clockwise spin to finger stop -> elastic spring-back.
 * 3. Handset vibration state machine upon digit registration.
 * 4. Pointer Events drag-to-lift handset (desktop mouse + touch).
 * 5. Instant typewriter / reveal of dialed achievement inside the speech bubble.
 * 6. Smooth reset when handset returns to cradle.
 */

(function () {
    'use strict';

    // =========================================================================
    // Achievement Registry (PlanP4 §6.3)
    // =========================================================================
    const ACHIEVEMENTS = {
        1: "Performed the best academically in my final year in School (St. Patrick's High School) achieving highest percentage certificates for multiple subjects.",
        2: "Achieved the Best Performance award for a Graphic Designing and Video Editing Course at NED University.",
        3: "Participated in multiple Model United Nations (MUNs) achieving a Special Mention in one.",
        4: "Achieved 8A*s and 1A in my O levels.",
        5: "Participated many times in our school's inter-house cricket tournament and winning the trophy in my final year.",
        6: "Received a bronze medal at the International Kangaroo Linguistic Contest during middle school.",
        7: "Maintained my health and built a respectably fit physique.",
        8: "Achieved 3rd place in my school's annual chess competition during my final year.",
        9: "Learned HTML, CSS, Javascript, building multiple projects and programs."
    };

    // PlanP4 §3.2 Hole Angles (degrees from 12 o'clock clockwise)
    const HOLE_ANGLES = {
        1: 300, 2: 270, 3: 240, 4: 210, 5: 180,
        6: 150, 7: 120, 8: 90,  9: 60
    };

    const FINGER_STOP_ANGLE = 330;
    const MIN_LIFT_DISTANCE = 22; // px drag required to trigger pickup
    const TYPE_SPEED = 18;        // ms per character for speedy delivery

    // =========================================================================
    // State
    // =========================================================================
    const state = {
        currentDigit: null,
        isDialing: false,
        isHandsetVibrating: false,
        isHandsetLifted: false,
        isDraggingHandset: false,
        dragOffset: { x: 0, y: 0 },
        handsetRestPos: { x: 0, y: 0 }
    };

    // DOM Elements
    let dialPlate = null;
    let handset = null;
    let chatBubble = null;
    let chatText = null;
    let chatDigitTag = null;
    let dialHint = null;

    let typewriterTimer = null;

    // =========================================================================
    // Boot & Trigonometric Positioning
    // =========================================================================
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        dialPlate = document.getElementById('dial-plate');
        handset = document.getElementById('handset');
        chatBubble = document.getElementById('chatBubble');
        chatText = document.getElementById('chatText');
        chatDigitTag = document.getElementById('chatDigitTag');
        dialHint = document.getElementById('dialHint');

        if (!dialPlate || !handset || !chatBubble) return;

        // Position all 9 holes and labels around the circle
        positionHolesAndLabels();

        // Bind finger hole clicks
        const holes = document.querySelectorAll('.finger-hole');
        holes.forEach(hole => {
            hole.addEventListener('click', (e) => {
                e.stopPropagation();
                const digit = parseInt(hole.dataset.digit, 10);
                onHoleClick(digit, hole);
            });
        });

        // Handset pointer events (mouse + touch)
        handset.addEventListener('pointerdown', onHandsetPointerDown);
        window.addEventListener('pointermove', onHandsetPointerMove, { passive: false });
        window.addEventListener('pointerup', onHandsetPointerUp);
        window.addEventListener('pointercancel', onHandsetPointerUp);

        // Click / tap fallback for handset on touch devices
        handset.addEventListener('click', () => {
            if (state.isHandsetVibrating && !state.isHandsetLifted && !state.isDraggingHandset) {
                liftHandsetProgrammatically();
            } else if (state.isHandsetLifted && !state.isDraggingHandset) {
                returnHandsetToCradle();
            }
        });
    }

    // =========================================================================
    // Position Holes & Labels via Trigonometry (PlanP4 §9.6)
    // =========================================================================
    function positionHolesAndLabels() {
        const cx = 200, cy = 200;
        const holeRadius = 130;
        const labelRadius = 130; // Centered inside hole or right by it

        for (const [digitStr, angleDeg] of Object.entries(HOLE_ANGLES)) {
            const digit = parseInt(digitStr, 10);
            // In SVG trigonometry, 0 deg is positive X (3 o'clock).
            // Our angles are from 12 o'clock clockwise:
            // rad = (angleDeg - 90) * (PI / 180)
            const rad = (angleDeg - 90) * (Math.PI / 180);

            const hx = (cx + holeRadius * Math.cos(rad)).toFixed(2);
            const hy = (cy + holeRadius * Math.sin(rad)).toFixed(2);

            const hole = document.querySelector(`.finger-hole[data-digit="${digit}"]`);
            if (hole) {
                hole.setAttribute('cx', hx);
                hole.setAttribute('cy', hy);
            }

            const label = document.querySelector(`.digit-label[data-digit="${digit}"]`);
            if (label) {
                // Position labels right on the hole coordinates for high-contrast clarity
                label.setAttribute('x', hx);
                label.setAttribute('y', hy);
            }
        }
    }

    // =========================================================================
    // Rotary Dialing Mechanics (PlanP4 §4.4 - §4.5)
    // =========================================================================
    function getRotationForDigit(digit) {
        const holeAngle = HOLE_ANGLES[digit];
        let rotation = FINGER_STOP_ANGLE - holeAngle;
        if (rotation <= 0) rotation += 360;
        return rotation; // degrees to rotate clockwise to the stop
    }

    function onHoleClick(digit, holeEl) {
        // Block if dial is currently rotating or handset is picked up
        if (state.isDialing || state.isHandsetLifted || state.isDraggingHandset) return;

        // Reset previous state
        stopVibration();
        hideChatBubble();
        state.currentDigit = null;
        state.isDialing = true;

        if (holeEl) holeEl.classList.add('active');
        if (dialHint) dialHint.classList.add('hidden');

        animateDial(digit, holeEl);
    }

    function animateDial(digit, holeEl) {
        const rotation = getRotationForDigit(digit);

        // Phase 1: Rotate clockwise to finger stop (duration scaled with distance)
        const dialDuration = 0.28 + (rotation / 270) * 0.45; // 0.28s to ~0.73s
        dialPlate.style.transition = `transform ${dialDuration.toFixed(2)}s cubic-bezier(0.32, 0, 0.67, 0)`;
        dialPlate.style.transform = `rotate(${rotation}deg)`;

        // Phase 2: Elastic spring-back after reaching stop
        setTimeout(() => {
            if (holeEl) holeEl.classList.remove('active');

            const springDuration = 0.35 + (rotation / 270) * 0.45; // 0.35s to ~0.8s
            dialPlate.style.transition = `transform ${springDuration.toFixed(2)}s cubic-bezier(0.18, 0.89, 0.32, 1.15)`;
            dialPlate.style.transform = 'rotate(0deg)';

            // After spring-back completes, register digit
            setTimeout(() => {
                dialPlate.style.transition = 'none';
                state.isDialing = false;
                onDigitRegistered(digit);
            }, springDuration * 1000);
        }, dialDuration * 1000);
    }

    function onDigitRegistered(digit) {
        state.currentDigit = digit;
        startVibration();

        // Update hint text
        if (dialHint) {
            dialHint.textContent = `Dialed ${digit} — pick up the handset to hear achievement`;
            dialHint.classList.remove('hidden');
        }
    }

    // =========================================================================
    // Handset Vibration
    // =========================================================================
    function startVibration() {
        state.isHandsetVibrating = true;
        handset.classList.add('vibrating');
    }

    function stopVibration() {
        state.isHandsetVibrating = false;
        handset.classList.remove('vibrating');
    }

    // =========================================================================
    // Handset Drag & Pickup Interactions (PlanP4 §5.4 & §9.5)
    // =========================================================================
    function onHandsetPointerDown(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        // Allow pickup if handset is vibrating or already picked up
        if (!state.isHandsetVibrating && !state.isHandsetLifted && !state.currentDigit) {
            // Shake slightly to indicate it needs a dialed number first
            handset.classList.remove('vibrating');
            handset.style.transform = 'scale(0.97)';
            setTimeout(() => { handset.style.transform = ''; }, 150);
            return;
        }

        e.preventDefault();
        state.isDraggingHandset = true;

        const rect = handset.getBoundingClientRect();
        state.handsetRestPos = { x: rect.left, y: rect.top };

        const clientX = e.clientX;
        const clientY = e.clientY;
        state.dragOffset = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };

        handset.classList.add('grabbing');
        handset.style.transition = 'none';
    }

    function onHandsetPointerMove(e) {
        if (!state.isDraggingHandset) return;
        e.preventDefault();

        const clientX = e.clientX;
        const clientY = e.clientY;

        const left = clientX - state.dragOffset.x;
        const top = clientY - state.dragOffset.y;

        handset.style.position = 'fixed';
        handset.style.left = `${left}px`;
        handset.style.top = `${top}px`;
        handset.style.zIndex = '1000';

        // Check vertical lift distance
        const dy = state.handsetRestPos.y - top;
        if (dy > MIN_LIFT_DISTANCE && !state.isHandsetLifted) {
            state.isHandsetLifted = true;
            stopVibration();
            handset.classList.add('lifted');
            showChatBubble(state.currentDigit || 1);
        }
    }

    function onHandsetPointerUp() {
        if (!state.isDraggingHandset) return;

        state.isDraggingHandset = false;
        handset.classList.remove('grabbing');

        // Animate return to cradle
        returnHandsetToCradle();
    }

    function returnHandsetToCradle() {
        state.isHandsetLifted = false;
        handset.classList.remove('lifted');

        // Smooth spring return to resting position
        handset.style.transition = 'top 0.35s cubic-bezier(0.18, 0.89, 0.32, 1.2), left 0.35s ease-out, transform 0.35s ease-out';
        handset.style.left = `${state.handsetRestPos.x}px`;
        handset.style.top = `${state.handsetRestPos.y}px`;
        handset.style.transform = 'rotate(0deg)';

        setTimeout(() => {
            handset.style.position = '';
            handset.style.left = '';
            handset.style.top = '';
            handset.style.transform = '';
            handset.style.zIndex = '';
            handset.style.transition = '';

            hideChatBubble();
            stopVibration();
            state.currentDigit = null;

            if (dialHint) {
                dialHint.textContent = 'Dial a number to discover an achievement';
            }
        }, 360);
    }

    function liftHandsetProgrammatically() {
        state.isHandsetLifted = true;
        stopVibration();
        handset.classList.add('lifted');
        handset.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        handset.style.transform = 'translateY(-36px) rotate(-4deg)';

        showChatBubble(state.currentDigit || 1);
    }

    // =========================================================================
    // Chat Bubble Display & Typewriter (PlanP4 §6)
    // =========================================================================
    function showChatBubble(digit) {
        if (!chatBubble || !chatText) return;

        const achievement = ACHIEVEMENTS[digit] || ACHIEVEMENTS[1];

        if (chatDigitTag) {
            chatDigitTag.textContent = `ACHIEVEMENT // 0${digit}`;
        }

        chatBubble.classList.add('visible');
        startChatTypewriter(achievement);
    }

    function hideChatBubble() {
        if (!chatBubble) return;
        chatBubble.classList.remove('visible');
        if (typewriterTimer) {
            clearTimeout(typewriterTimer);
            typewriterTimer = null;
        }
    }

    function startChatTypewriter(text) {
        if (!chatText) return;
        if (typewriterTimer) clearTimeout(typewriterTimer);

        chatText.textContent = '';
        let idx = 0;

        function tick() {
            if (idx < text.length) {
                chatText.textContent += text[idx];
                idx++;
                typewriterTimer = setTimeout(tick, TYPE_SPEED);
            }
        }

        tick();
    }
})();
