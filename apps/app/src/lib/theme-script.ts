export const THEME_KEY = "openseo_theme";

/**
 * Runs in <head> before the first paint, so a page never flashes the wrong theme. Self-contained:
 * reads the choice from localStorage, then the cookie, and sets <html data-theme>. No choice
 * means the system setting (see globals.css).
 */
export const themeScript = `(function(){try{var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}if(!t){var m=document.cookie.match(/(?:^|; )${THEME_KEY}=(light|dark)/);t=m&&m[1]}if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
