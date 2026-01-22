document.addEventListener('DOMContentLoaded', () => {
  const tocLinks = document.querySelectorAll('.toc-sticky a');
  
  // Find all headings within main-content
  // We query all headings first, then filter/map to find the actual anchor ID
  const rawHeadings = document.querySelectorAll('.main-content h1, .main-content h2, .main-content h3, .main-content h4, .main-content h5, .main-content h6');
  
  const headings = [];
  rawHeadings.forEach(h => {
    let id = h.getAttribute('id');
    // If the heading itself doesn't have an ID, check if it contains an element with an ID (e.g. <a id="...">)
    // or if the Zine renderer placed the ID on a wrapper.
    if (!id) {
        // Check if the parent element has an ID (SuperMD section wrapper)
        if (h.parentElement && h.parentElement.getAttribute('id')) {
            id = h.parentElement.getAttribute('id');
        } else {
            const childWithId = h.querySelector('[id]');
            if (childWithId) {
                id = childWithId.getAttribute('id');
            }
        }
    }
    
    if (id) {
        headings.push({ element: h, id: id });
    }
  });

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
        // Decode URI component to handle non-ASCII IDs if any
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
  });
  
  onScroll(); // Initial check
});
