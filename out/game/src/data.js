// Hayate Bay data: missions, jets, refits, radio lines. All original content.
export const JETS = {
  'K-21': { id: 'K-21', name: 'K-21 "SHINKAI"', short: 'K-21 SHINKAI', role: 'Hero multirole jet', spd: 92, trn: 88, arm: 80, maxSpeed: 320, turn: 1.9, accel: 42, color: 0xf2e8d5, wing: 0x0e5f5a, accent: 0xffd76a },
  'S-50': { id: 'S-50', name: 'S-50 "PELICAN"', short: 'S-50 PELICAN', role: 'Twin-hull rescue amphibian', spd: 62, trn: 70, arm: 95, maxSpeed: 230, turn: 1.3, accel: 30, color: 0xff8c42, wing: 0x2a6f9e, accent: 0xffffff },
  'Z-9': { id: 'Z-9', name: 'Z-9 "TEMPEST"', short: 'Z-9 TEMPEST', role: 'Forward-swept interceptor', spd: 99, trn: 96, arm: 60, maxSpeed: 360, turn: 2.4, accel: 52, color: 0x2b2f3a, wing: 0x8a1f2d, accent: 0x35e0d0 },
};
export const REFITS = [
  { id: 'ab2', name: 'Afterburner Mk II', price: 1200, desc: '+25% boost thrust' },
  { id: 'feather', name: 'Feathered Contrails', price: 800, desc: 'Feathery wingtip trails' },
  { id: 'radar', name: 'Radar Pulse+', price: 950, desc: 'Radar Pulse cooldown -40%' },
  { id: 'flare', name: 'Flare Salvo x6', price: 1100, desc: 'Flare Salvo fires 6 flares' },
  { id: 'titan', name: 'Titanium Airframe', price: 1500, desc: '+25 max HULL' },
  { id: 'chill', name: 'Turbo Chill', price: 900, desc: 'Heat decays 50% faster' },
  { id: 'goldhud', name: 'Golden HUD', price: 600, desc: 'Gold HUD accents' },
  { id: 'tanks', name: 'Wing Tanks', price: 1000, desc: '+40% fuel' },
  { id: 'vector', name: 'Vector Nozzles', price: 1400, desc: '+20% turn rate' },
  { id: 'storm', name: 'Storm Radar', price: 850, desc: 'Gust warnings 2x earlier' },
  { id: 'camo', name: 'Karst Camo', price: 700, desc: 'Enemies spot you later' },
  { id: 'fever', name: 'Fever Capacitor', price: 1300, desc: 'Fever decays 40% slower' },
];
// Stages: {type, text, target} types: rings, bridge, arch, crate, carrier, escort, intercept, duel, rescue
export const SORTIES = [
  { n: 1, name: 'First Light Patrol', xp: 40, weather: 'clear', stages: [
    { type: 'rings', text: 'Fly the dawn patrol route — pass rings 1-2-3', count: 3 },
    { type: 'rings', text: 'Low pass over the harbour — stay under 200 FT', count: 2 },
    { type: 'carrier', text: 'Land on the carrier deck — trap a wire', count: 1 } ] },
  { n: 2, name: 'Dragon Bridge Overdrive', xp: 60, weather: 'clear', stages: [
    { type: 'bridge', text: 'Fly UNDER the Dragon Bridge span — do not climb over it', count: 1 },
    { type: 'rings', text: 'Thread the bridge arches — pass rings 1-2-3', count: 3 },
    { type: 'rings', text: 'Sprint the canyon exit at 260 KT or faster', count: 2 } ] },
  { n: 3, name: 'Skyline Canyon Skim', xp: 70, weather: 'clear', stages: [
    { type: 'rings', text: 'Skim the canyon floor — pass rings 1-2-3 below 150 FT', count: 3 },
    { type: 'arch', text: 'Thread the Karst Arch without touching stone', count: 1 },
    { type: 'rings', text: 'Climb out through the skyline gap', count: 2 } ] },
  { n: 4, name: 'Carrier Quals', xp: 80, weather: 'clear', stages: [
    { type: 'rings', text: 'Join the carrier pattern — pass rings 1-2', count: 2 },
    { type: 'carrier', text: 'Fly the glide slope — meatball centred, gear down', count: 1 },
    { type: 'carrier', text: 'Trap the 3-wire — sink rate under 400 FPM', count: 1 } ] },
  { n: 5, name: 'CANYON GOLDEN HOUR', xp: 150, weather: 'golden', flagship: true, stages: [
    { type: 'rings', text: 'Ride the golden light — pass rings 1-2-3 through the canyon', count: 3 },
    { type: 'arch', text: 'Thread the Sun Arch at golden hour', count: 1 },
    { type: 'bridge', text: 'Fly under the Dragon Bridge span into the sunset', count: 1 },
    { type: 'rings', text: 'Finish the golden run — final rings 1-2 at full Fever', count: 2 } ] },
  { n: 6, name: 'Storm Front', xp: 90, weather: 'storm', stages: [
    { type: 'rings', text: 'Punch into the storm — pass rings 1-2-3 in the squall', count: 3 },
    { type: 'rings', text: 'Ride the gusts — fly WITH the wind, do not fight it', count: 2 },
    { type: 'carrier', text: 'Land on the carrier in the storm — hook down', count: 1 } ] },
  { n: 7, name: 'Dragon Bridge Overdrive II', xp: 110, weather: 'clear', stages: [
    { type: 'bridge', text: 'Under the span again — faster, lower, cleaner', count: 1 },
    { type: 'arch', text: 'Thread both karst arches back to back', count: 2 },
    { type: 'intercept', text: 'Intercept the intruder SQUALL-E before it reaches the bay', count: 1 } ] },
  { n: 8, name: 'Typhoon Bay Rescue', xp: 130, weather: 'storm', stages: [
    { type: 'escort', text: 'Escort JADE-2 through the typhoon — stay within 300 FT', count: 1 },
    { type: 'crate', text: 'Drop the medical crate on Pier 4 — press X over the pier', count: 1 },
    { type: 'carrier', text: 'Bring MEDEVAC-5 home — trap on the carrier', count: 1 } ] },
  { n: 9, name: 'Night Interceptors', xp: 120, weather: 'night', stages: [
    { type: 'intercept', text: 'Intercept the night bandit over the skyline', count: 1 },
    { type: 'rings', text: 'Dark canyon run — pass rings 1-2-3 on instruments', count: 3 },
    { type: 'intercept', text: 'Second bandit — flare it off, then splash it', count: 1 } ] },
  { n: 10, name: 'Karst Gauntlet', xp: 130, weather: 'clear', stages: [
    { type: 'arch', text: 'Thread arch 1 — the Needle', count: 1 },
    { type: 'arch', text: 'Thread arch 2 — the Gate', count: 1 },
    { type: 'rings', text: 'Gauntlet sprint — rings 1-2-3, no ring missed', count: 3 } ] },
  { n: 11, name: 'Ace Duel: TEMPEST', xp: 150, weather: 'clear', stages: [
    { type: 'duel', text: 'Duel TEMPEST — phase 1: break his lock', count: 1 },
    { type: 'duel', text: 'Phase 2: stay on his six through the canyon', count: 1 },
    { type: 'duel', text: 'Phase 3: splash TEMPEST — guns hot', count: 1 } ] },
  { n: 12, name: 'VOID ACE: Final', xp: 300, weather: 'storm', stages: [
    { type: 'duel', text: 'VOID ACE phase 1 — dodge the missile telegraphs', count: 1 },
    { type: 'duel', text: 'VOID ACE phase 2 — break the shield ring', count: 1 },
    { type: 'duel', text: 'VOID ACE phase 3 — splash the VOID ACE', count: 1 },
    { type: 'carrier', text: 'Land on the carrier as the storm breaks', count: 1 } ] },
];
export const BONUS = [
  { n: 'B1', name: 'Night Patrol', xp: 60, weather: 'night', stages: [
    { type: 'rings', text: 'Night patrol route — rings 1-2-3', count: 3 },
    { type: 'rings', text: 'Harbour sweep — stay under 300 FT', count: 2 } ] },
  { n: 'B2', name: 'Harbour Airshow', xp: 80, weather: 'clear', stages: [
    { type: 'rings', text: 'Airshow loop — rings 1-2-3 in formation with JADE-2', count: 3 },
    { type: 'arch', text: 'Finale: thread the arch for the crowd', count: 1 } ] },
  { n: 'B3', name: 'Medevac Escort', xp: 110, weather: 'clear', stages: [
    { type: 'escort', text: 'Escort MEDEVAC-5 to the hospital pier', count: 1 },
    { type: 'crate', text: 'Drop the medical crate on Pier 4', count: 1 } ] },
  { n: 'B4', name: 'Ace Rematch', xp: 400, weather: 'storm', stages: [
    { type: 'duel', text: 'Rematch TEMPEST + VOID ACE — splash both', count: 2 },
    { type: 'carrier', text: 'Trap on the carrier to end it', count: 1 } ] },
];
export const RADIO = {
  kenji: ['Canyon Golden Hour… look at that light. Fly it like you mean it.', 'Kaze Tower — cleared for Carrier Quals. AETHER-01 is on your nose, meatball is lit.', 'Nice line. The bay is watching — make it clean.', 'Gusting 26 knots off the port bow. Ride it, don\'t fight it.'],
  maya: ['Turbo Chill online — heat is dropping, you are clear to push.', 'Storm cell ahead, Maya here. Keep your speed up and your nose level.', 'Fever is climbing. The jetstream loves you today.'],
  tariq: ['Flare Salvo away — missiles are chasing ghosts now.', 'Tariq on your wing. I have your six, you take the shot.', 'Radar Pulse out — I can see every contact in the bay.'],
  boss: ['VOID ACE: You fly pretty for a tourist. Come and take the sky.', 'TEMPEST: I was the fastest in this bay before you were born.', 'VOID ACE: Phase two. Let us see how you handle real fire.'],
};
export const CONTACTS = [
  { name: 'JADE-2', tag: 'ESCORT' }, { name: 'MEDEVAC-5', tag: 'SPOTLIGHT' }, { name: 'GATE-6', tag: 'FEVER ×8' }, { name: 'AETHER-01', tag: 'GLIDEPATH' }, { name: 'SQUALL-E', tag: '22 KT' },
];
export function rankFor(xp) {
  if (xp >= 900) return 1; if (xp >= 600) return 2; if (xp >= 400) return 3; if (xp >= 250) return 4; return 5;
}
export const RANK_NAMES = { 1: 'SKYLINE LEGEND', 2: 'STORM ACE', 3: 'GOLDEN ACE', 4: 'CANYON ACE', 5: 'BAY ACE' };
