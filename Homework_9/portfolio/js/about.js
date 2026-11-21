/**
 * about.js — Interactive Body-Scan Scanner & Info Panel Logic (PlanP3)
 *
 * Implements:
 * 1. Initial 3-second discoverability pulse hint across zones with clean auto-removal.
 * 2. Sequential scanner sweep animation on zone enter/hover before fading in the panel.
 * 3. Mobile touch-friendly tap-to-toggle interaction with bottom-sheet presentation.
 * 4. Quick re-hover debouncing to prevent flickering and cancel in-flight hide timers.
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        const zones = Array.from(document.querySelectorAll('.hover-zone'));
        const panels = Array.from(document.querySelectorAll('.info-panel'));
        const hintCaption = document.getElementById('aboutHintCaption');
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        if (!zones.length) return;

        // Auto-remove discoverability pulse hint after 3 seconds
        setTimeout(() => {
            zones.forEach(zone => zone.classList.remove('hinting'));
            if (hintCaption) {
                hintCaption.classList.add('fade-out');
            }
        }, 3000);

        let activeMobilePanel = null;
        let activeMobileZone = null;

        zones.forEach(zone => {
            const panelId = zone.dataset.panel;
            const panel = document.getElementById(panelId);
            const scannerLine = zone.querySelector('.scanner-line');

            if (!panel || !scannerLine) return;

            if (isMobile) {
                // Mobile tap handler
                zone.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleMobileTap(zone, panel, scannerLine);
                });
            } else {
                // Desktop Hover
                zone.addEventListener('mouseenter', () => {
                    if (zone._hideTimeout) {
                        clearTimeout(zone._hideTimeout);
                        zone._hideTimeout = null;
                    }
                    startScanner(zone, scannerLine, panel);
                });

                zone.addEventListener('mouseleave', () => {
                    zone._hideTimeout = setTimeout(() => {
                        hidePanel(zone, panel, scannerLine);
                    }, 80);
                });
            }
        });

        // Tapping anywhere outside on mobile dismisses open panel
        if (isMobile) {
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.info-panel') && !e.target.closest('.hover-zone')) {
                    if (activeMobilePanel && activeMobileZone) {
                        const scannerLine = activeMobileZone.querySelector('.scanner-line');
                        hidePanel(activeMobileZone, activeMobilePanel, scannerLine);
                        activeMobilePanel = null;
                        activeMobileZone = null;
                    }
                }
            });
        }

        // =========================================================================
        // Animation & State Transitions
        // =========================================================================
        function startScanner(zone, scannerLine, panel) {
            zone.classList.add('active');

            // Reset scanner line animation
            scannerLine.style.animation = 'none';
            // Force browser reflow to restart CSS animation cleanly
            void scannerLine.offsetHeight;
            scannerLine.style.animation = 'scan-sweep 0.55s ease-out forwards';

            // Once scanner sweep completes, reveal adjacent info panel
            const onAnimationEnd = () => {
                scannerLine.removeEventListener('animationend', onAnimationEnd);
                if (zone.matches(':hover') || isMobile) {
                    showPanel(panel);
                }
            };

            scannerLine.addEventListener('animationend', onAnimationEnd, { once: true });
        }

        function showPanel(panel) {
            panel.classList.add('visible');
        }

        function hidePanel(zone, panel, scannerLine) {
            zone.classList.remove('active');
            panel.classList.remove('visible');

            // Reset scanner line
            scannerLine.style.animation = 'none';
            scannerLine.style.opacity = '0';
        }

        function handleMobileTap(zone, panel, scannerLine) {
            // If already open, close it
            if (activeMobilePanel === panel) {
                hidePanel(zone, panel, scannerLine);
                activeMobilePanel = null;
                activeMobileZone = null;
                return;
            }

            // Close previously active panel if exists
            if (activeMobilePanel && activeMobileZone) {
                const prevScanner = activeMobileZone.querySelector('.scanner-line');
                hidePanel(activeMobileZone, activeMobilePanel, prevScanner);
            }

            // Open new panel
            startScanner(zone, scannerLine, panel);
            activeMobilePanel = panel;
            activeMobileZone = zone;
        }
    }
})();
