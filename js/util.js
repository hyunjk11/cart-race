/**
 * util.js — tiny shared helpers (DOM lookup, random pick, rounding, HTML escaping, simple materials).
 * Pure functions with no game state; safe to import from any module.
 */
import * as THREE from 'three';

/** document.getElementById shorthand. */
export const $ = id => document.getElementById(id);
/** Random element of an array. */
export const pick = a => a[(Math.random() * a.length) | 0];
/** Round to 2 decimals (network snapshots). */
export const r2 = v => Math.round(v * 100) / 100;
/** Drop <, > and & from user text (player names shown in announcer/flash lines). */
export const stripTags = t => String(t).replace(/[<>&]/g, '');
/** Escape &, <, >, " for innerHTML. */
export const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Flat Lambert material of one colour. */
export const lm = c => new THREE.MeshLambertMaterial({ color: c });
