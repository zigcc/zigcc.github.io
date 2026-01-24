document.addEventListener('DOMContentLoaded', () => {
  const tocLinks = document.querySelectorAll('.toc-sticky a');
  
  // Find all headings within main-content
  // We query all headings first, then filter/map to find the actual anchor ID
  const rawHeadings = document.querySelectorAll('.main-content h1, .main-content h2, .main-content h3, .main-content h4, .main-content h5, .main-content h6');
  
  const headings = Array.from(rawHeadings)
    .map(h => ({
      element: h,
      id: h.id || h.parentElement?.id || h.querySelector('[id]')?.id,
    }))
    .filter(h => h.id);

  if (tocLinks.length === 0 || headings.length === 0) return;

  const onScroll = () => {
    let currentId = null;
    const scrollPosition = window.scrollY + 120; // Offset for header + padding

    // Find the last heading that is above the current scroll position
    for (const h of headings) {
      if (h.element.offsetTop <= scrollPosition) {
        currentId = h.id;
      } else {
        break; // Since headings are in order, we can stop
      }
    }

    if (currentId) {
      tocLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === `#${currentId}`) {
          link.classList.add('active');
        }
      });
    } else {
       // If no header is "current" (e.g. at very top), highlight the first one
       if (window.scrollY < 100 && tocLinks.length > 0) {
           tocLinks.forEach(link => link.classList.remove('active'));
           tocLinks[0].classList.add('active');
       }
    }
  };

  // Throttle scroll event slightly for performance
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
  
  onScroll(); // Initial check
});
