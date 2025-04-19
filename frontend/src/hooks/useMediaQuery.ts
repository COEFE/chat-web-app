import { useState, useEffect } from 'react';

/**
 * Custom hook to track whether a CSS media query matches.
 * @param query The media query string (e.g., '(max-width: 768px)').
 * @returns True if the query matches, false otherwise.
 */
function useMediaQuery(query: string): boolean {
  // Initialize state safely for SSR, assuming non-match initially
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Check if window is defined (runs only on client-side)
    if (typeof window !== 'undefined') {
      const media = window.matchMedia(query);
      
      // Update state function
      const updateMatch = () => setMatches(media.matches);

      // Set the initial state correctly on client mount
      updateMatch(); 

      // Add listener for changes
      media.addEventListener('change', updateMatch);

      // Cleanup listener on component unmount
      return () => media.removeEventListener('change', updateMatch);
    }
  }, [query]); // Re-run effect if query changes

  return matches;
}

export default useMediaQuery;
