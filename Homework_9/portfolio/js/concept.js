/**
 * concept.js — Interactive Function Explainer Logic (PlanP2)
 *
 * Implements:
 * 1. Robust drag-and-drop system using Pointer Events with reliable hit-testing
 *    (both cursor coordinate and element bounding-box intersection).
 * 2. Automatic replacement: when any block is placed into the slot, any currently
 *    placed block is cleanly ejected back down to the tray in its proper order.
 * 3. Typewriter animation engine powered by requestAnimationFrame with auto-scroll.
 * 4. Exit action execution when the Exit block is placed into the function slot.
 */

(function () {
    'use strict';

    // =========================================================================
    // Content Specifications
    // =========================================================================
    const OUTPUTS = {
        clockNav: `The navigation you just used to get here isn't a menu — it's a clock.\n\nA real, functioning clock that tells time. But when you hover, it transforms. The minute hand becomes your cursor's compass, pointing wherever you aim.\n\nThis is intentional friction. Not the frustrating kind — the kind that makes you pause and explore. Traditional navigation is invisible. Ours asks you to engage with it.\n\nThe clock sits at the center because time is central to everything we build. Every project has a timeline. Every interaction has a moment. We wanted the navigation itself to remind you of that.\n\nPoint. Click. Arrive. But enjoy the journey between.`,

        functionUI: `You're looking at it right now.\n\nThis page doesn't have paragraphs and headers like a typical "about" section. Instead, it borrows from something every developer knows — the function call.\n\nFunction Explain( parameter ) → output.\n\nYou chose what to learn about by dragging a concept into the function. The page responded. That interaction — choosing, placing, reading — mirrors how functions actually work. Input determines output.\n\nWhy? Because this portfolio belongs to someone who thinks in systems. Design isn't decoration. It's logic made visible.\n\nEven this explanation is a demonstration. You're learning about the concept by using the concept.`,

        bodyConcept: `Instead of presenting an 'About Me' page as an impersonal bio wall, the experience is mapped directly onto the human body.\n\nBy anchoring information to anatomical regions, the interface turns abstract traits into tangible focal points:\n\n• Forehead // Neural: Intellectual curiosities, multidisciplinary ideas, and lifelong interests.\n• Eyes // Optics: Vision, forward-thinking philosophy, and what I strive to build.\n• Heart // Core: Adorations, craftsmanship passions, rhythm, and what fuels the dedication.\n\nHovering activates a futuristic laser-scan sweep across the target zone before deploying the connected telemetry readout. It transforms a static portrait into an interactive living diagnostic.`,

        rotaryDial: `We don't scroll through achievements as a linear checklist — we dial into them.\n\nDrawing inspiration from classic mechanical rotary telephones, the Achievements page turns milestones into tactile discovery:\n\n1. Rotate: Dial any digit from 1 to 9. The disc glides clockwise toward the brass finger stop and snaps back with realistic spring tension.\n2. Ring: Registering the digit sets the handset into an impatient, rhythmic vibration.\n3. Answer: Lifting the handset from its cradle opens a dedicated audio-visual transcript in the speech bubble, relaying that specific achievement.\n\nIt celebrates tactile analog engineering within a digital landscape: each milestone feels earned with deliberate physical intention.`,

        exit: `Returning to clock...`
    };

    const TYPE_SPEED = 28;         // ms per character
    const PARAGRAPH_PAUSE = 380;   // ms pause at paragraph breaks
    const CURSOR_LINGER = 2000;    // ms cursor blinks after typing completes

    // =========================================================================
    // DOM Elements Cache
    // =========================================================================
    let paramSlot = null;
    let blocksTray = null;
    let outputBox = null;
    let blockElements = [];

    // =========================================================================
    // Drag & State Management
    // =========================================================================
    let draggedBlock = null;
    let placedBlock = null;
    let dragPointerId = null;
    let startPointerPos = { x: 0, y: 0 };
    let dragOffset = { x: 0, y: 0 };
    let isDragging = false;
    let originalTrayOrder = [];
    const DRAG_THRESHOLD = 5; // px threshold

    // Typewriter State
    let typewriterRAF = null;
    let typewriterIndex = 0;
    let currentText = '';
    let lastTimestamp = 0;
    let accumulatedTime = 0;
    let isParagraphPause = false;
    let pauseAccumulated = 0;
    let cursorLingerTimer = null;

    // =========================================================================
    // Initialization
    // =========================================================================
    function init() {
        paramSlot = document.getElementById('paramSlot');
        blocksTray = document.getElementById('blocksTray');
        outputBox = document.getElementById('outputBox');
        blockElements = Array.from(document.querySelectorAll('.param-block'));

        if (!paramSlot || !blocksTray || !outputBox) return;

        // Save original DOM order of blocks so they return to their original tray slot
        originalTrayOrder = blockElements.map(b => b.id);

        // Attach pointer events to each block
        blockElements.forEach(block => {
            block.addEventListener('pointerdown', (e) => onPointerDown(e, block));

            // Keyboard accessibility
            block.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (placedBlock === block) {
                        returnBlockToTray(block, true);
                    } else {
                        placeBlockInSlot(block);
                    }
                }
            });
        });

        // Window-level listeners to never lose drag when cursor moves fast
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);

        // Clicking the slot directly when filled ejects the block back
        paramSlot.addEventListener('click', (e) => {
            if (placedBlock && !isDragging) {
                returnBlockToTray(placedBlock, true);
            }
        });
    }

    // =========================================================================
    // Drag and Drop (Pointer Events API)
    // =========================================================================
    function onPointerDown(e, block) {
        if (e.button !== 0) return; // Only primary button

        draggedBlock = block;
        dragPointerId = e.pointerId;
        startPointerPos = { x: e.clientX, y: e.clientY };
        isDragging = false;

        const rect = block.getBoundingClientRect();
        dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function onPointerMove(e) {
        if (!draggedBlock || e.pointerId !== dragPointerId) return;

        const dx = e.clientX - startPointerPos.x;
        const dy = e.clientY - startPointerPos.y;

        if (!isDragging) {
            if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
                isDragging = true;
                draggedBlock.classList.add('dragging');
                draggedBlock.setAttribute('aria-grabbed', 'true');

                // If this block was currently inside the slot, detach it cleanly
                if (placedBlock === draggedBlock) {
                    placedBlock = null;
                    paramSlot.classList.remove('filled');
                    clearOutput();
                }

                // Move to document.body to ensure free-floating coordinates
                document.body.appendChild(draggedBlock);
            } else {
                return;
            }
        }

        e.preventDefault();

        // Position the dragged block
        draggedBlock.style.left = (e.clientX - dragOffset.x) + 'px';
        draggedBlock.style.top = (e.clientY - dragOffset.y) + 'px';

        // Check if cursor OR block overlaps with parameter slot
        if (checkSlotHit(e.clientX, e.clientY, draggedBlock)) {
            paramSlot.classList.add('drag-over');
        } else {
            paramSlot.classList.remove('drag-over');
        }
    }

    function onPointerUp(e) {
        if (!draggedBlock || (dragPointerId !== null && e.pointerId !== dragPointerId)) return;

        const block = draggedBlock;
        const wasActuallyDragging = isDragging;

        draggedBlock = null;
        dragPointerId = null;
        isDragging = false;
        paramSlot.classList.remove('drag-over');

        if (wasActuallyDragging) {
            block.classList.remove('dragging');
            block.setAttribute('aria-grabbed', 'false');

            // Hit test: cursor coordinate OR block bounding box
            if (checkSlotHit(e.clientX, e.clientY, block)) {
                placeBlockInSlot(block);
            } else {
                returnBlockToTray(block, true);
            }
        } else {
            // Click / tap activation
            if (placedBlock === block) {
                returnBlockToTray(block, true);
            } else {
                placeBlockInSlot(block);
            }
        }
    }

    /**
     * Hit test: returns true if cursor coordinates are within the slot,
     * or if the dragged block overlaps significantly with the slot.
     */
    function checkSlotHit(cursorX, cursorY, block) {
        if (!paramSlot) return false;
        const slotRect = paramSlot.getBoundingClientRect();

        // 1. Point hit test (with 15px generous margin for easy dropping)
        const margin = 15;
        if (cursorX >= slotRect.left - margin &&
            cursorX <= slotRect.right + margin &&
            cursorY >= slotRect.top - margin &&
            cursorY <= slotRect.bottom + margin) {
            return true;
        }

        // 2. Bounding rectangle overlap test
        if (block) {
            const blockRect = block.getBoundingClientRect();
            const overlap = !(
                blockRect.right < slotRect.left ||
                blockRect.left > slotRect.right ||
                blockRect.bottom < slotRect.top ||
                blockRect.top > slotRect.bottom
            );
            if (overlap) return true;
        }

        return false;
    }

    // =========================================================================
    // Slot Placement & Tray Return
    // =========================================================================
    function placeBlockInSlot(block) {
        // If another block is currently placed, eject it cleanly back to the tray
        if (placedBlock && placedBlock !== block) {
            const previousBlock = placedBlock;
            returnBlockToTray(previousBlock, false);
        }

        cleanInlineStyles(block);

        placedBlock = block;
        block.classList.remove('dragging');
        block.classList.add('placed');
        block.setAttribute('aria-grabbed', 'false');

        paramSlot.classList.remove('drag-over');
        paramSlot.classList.add('filled');
        paramSlot.appendChild(block);

        // Check if Exit action
        if (block.dataset.action === 'exit') {
            handleExitAction();
            return;
        }

        // Standard content block
        clearOutput();
        const outputKey = block.dataset.output;
        if (OUTPUTS[outputKey]) {
            setTimeout(() => {
                if (placedBlock === block) {
                    startTypewriter(OUTPUTS[outputKey]);
                }
            }, 200);
        }
    }

    function returnBlockToTray(block, shouldClearOutput = true) {
        if (placedBlock === block) {
            placedBlock = null;
            paramSlot.classList.remove('filled');
            if (shouldClearOutput) {
                clearOutput();
            }
        }

        block.classList.remove('placed');
        block.classList.remove('dragging');
        block.setAttribute('aria-grabbed', 'false');
        cleanInlineStyles(block);

        // Re-insert into tray at original order
        insertBlockAtOriginalIndex(block);
    }

    function insertBlockAtOriginalIndex(block) {
        if (!blocksTray) return;
        const targetIndex = originalTrayOrder.indexOf(block.id);
        const currentChildren = Array.from(blocksTray.children);

        let inserted = false;
        for (const child of currentChildren) {
            const childIndex = originalTrayOrder.indexOf(child.id);
            if (childIndex > targetIndex) {
                blocksTray.insertBefore(block, child);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            blocksTray.appendChild(block);
        }
    }

    function cleanInlineStyles(el) {
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.transform = '';
    }

    function handleExitAction() {
        clearOutput();
        startTypewriter(OUTPUTS.exit);

        // Smooth transition out
        setTimeout(() => {
            document.body.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            document.body.style.opacity = '0';
            document.body.style.transform = 'scale(0.98)';

            setTimeout(() => {
                if (document.referrer && document.referrer.includes(window.location.host)) {
                    window.history.back();
                } else {
                    window.location.href = '../index.html';
                }
            }, 300);
        }, 500);
    }

    // =========================================================================
    // Typewriter Engine (requestAnimationFrame)
    // =========================================================================
    function startTypewriter(text) {
        stopTypewriter();
        clearOutput();

        currentText = text;
        typewriterIndex = 0;
        accumulatedTime = 0;
        isParagraphPause = false;
        pauseAccumulated = 0;
        lastTimestamp = 0;

        outputBox.innerHTML = '<span class="typewriter-cursor">|</span>';

        function step(timestamp) {
            if (!lastTimestamp) lastTimestamp = timestamp;
            const delta = timestamp - lastTimestamp;
            lastTimestamp = timestamp;

            if (isParagraphPause) {
                pauseAccumulated += delta;
                if (pauseAccumulated >= PARAGRAPH_PAUSE) {
                    isParagraphPause = false;
                    pauseAccumulated = 0;
                }
                typewriterRAF = requestAnimationFrame(step);
                return;
            }

            accumulatedTime += delta;

            while (accumulatedTime >= TYPE_SPEED && typewriterIndex < currentText.length) {
                const char = currentText[typewriterIndex];
                typewriterIndex++;
                accumulatedTime -= TYPE_SPEED;

                const cursor = outputBox.querySelector('.typewriter-cursor');

                if (char === '\n' && currentText[typewriterIndex] === '\n') {
                    typewriterIndex++;
                    const br1 = document.createElement('br');
                    const br2 = document.createElement('br');
                    if (cursor) {
                        outputBox.insertBefore(br1, cursor);
                        outputBox.insertBefore(br2, cursor);
                    }
                    isParagraphPause = true;
                    autoScrollOutput();
                    break;
                } else if (char === '\n') {
                    const br = document.createElement('br');
                    if (cursor) outputBox.insertBefore(br, cursor);
                } else {
                    const textNode = document.createTextNode(char);
                    if (cursor) outputBox.insertBefore(textNode, cursor);
                }

                autoScrollOutput();
            }

            if (typewriterIndex < currentText.length) {
                typewriterRAF = requestAnimationFrame(step);
            } else {
                if (cursorLingerTimer) clearTimeout(cursorLingerTimer);
                cursorLingerTimer = setTimeout(() => {
                    const cursor = outputBox.querySelector('.typewriter-cursor');
                    if (cursor) cursor.style.opacity = '0';
                }, CURSOR_LINGER);
            }
        }

        typewriterRAF = requestAnimationFrame(step);
    }

    function autoScrollOutput() {
        if (outputBox) {
            outputBox.scrollTop = outputBox.scrollHeight;
        }
    }

    function stopTypewriter() {
        if (typewriterRAF) {
            cancelAnimationFrame(typewriterRAF);
            typewriterRAF = null;
        }
        if (cursorLingerTimer) {
            clearTimeout(cursorLingerTimer);
            cursorLingerTimer = null;
        }
    }

    function clearOutput() {
        stopTypewriter();
        if (outputBox) {
            outputBox.innerHTML = '<span class="output-hint">// output</span>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
