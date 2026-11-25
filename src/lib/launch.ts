/**
 * Opening the installed app must land on Home. The manifest's `start_url` says so, but an app installed while it was
 * still "/" keeps starting there, on the Add page, and the phone may never pick up the new one. So when the installed
 * app STARTS on a bare "/", it goes to Home.
 *
 * "Starts" means the window's first page (a history of one). The + button, Back, and a reload after moving around all
 * have more history, so Add opens as it always did. An address with something after the "/" ("/?copy=12", "/#waiting",
 * the "Add entry" shortcut) asks for Add on purpose, and a browser tab (not the installed app) is left alone.
 */

/** The long-press "Add entry" shortcut. The "#add" only tells the script below that Add was asked for. */
export const ADD_SHORTCUT_URL = "/#add";

/**
 * Runs inline in <head>, before anything is drawn, so Add never flashes up first. The page is hidden while Home loads
 * (and shown again after a few seconds, in case Home never arrives). It must work in a saved page with no PC, so it
 * depends on nothing but the browser.
 */
export const LAUNCH_SCRIPT = `(function(){try{
if(location.pathname!=="/"||location.search||location.hash||history.length!==1)return;
if(!(navigator.standalone===true||matchMedia("(display-mode: standalone)").matches))return;
var page=document.documentElement;page.style.visibility="hidden";setTimeout(function(){page.style.visibility=""},8000);
location.replace("/dashboard");
}catch(e){}})()`;
