// WebRTC ICE servers for multiplayer (the ONE place to configure STUN/TURN).
// STUN finds a direct P2P path; it fails behind symmetric NAT / strict firewalls (some mobile carriers, school/office wifi).
// A TURN relay fixes that, but every free public TURN checked (2026-10) needs an account:
//   - Metered "Open Relay" (openrelay.metered.ca): the old static openrelayproject/openrelayproject login is reported dead;
//     the free 20 GB/month tier needs signup + an API key to fetch temporary credentials.
// To enable TURN, add entries to TURN below, e.g. after signing up at metered.ca:
//   { urls: ['turn:<you>.metered.live:80', 'turn:<you>.metered.live:443', 'turns:<you>.metered.live:443?transport=tcp'], username: '…', credential: '…' }
// (or fetch them at runtime from the provider's REST API and push into TURN before creating a room).
export const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
export const TURN = [];
// testing hook: ?turn=<url>,<user>,<cred> (e.g. a self-hosted coturn) adds one TURN server for this session
const q = new URLSearchParams(location.search).get('turn');
if (q) {
  const [urls, username, credential] = q.split(',');
  if (urls) TURN.push({ urls, username, credential });
}
export const iceServers = () => [...STUN, ...TURN];
