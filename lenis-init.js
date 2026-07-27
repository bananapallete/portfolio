/* ==========================================================================
   Unlimit_Cho Portfolio — 부드러운 스크롤 (Lenis)
   ========================================================================== */

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const lenis = new Lenis();
  window.lenis = lenis;

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}
