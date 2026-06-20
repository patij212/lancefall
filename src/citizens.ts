// src/citizens.ts — THE CITY REMEMBERS. The people of Lancefall, woken by decryption. PURE +
// derived: a citizen is "woken" iff the transmission (or master-% milestone) that names them is
// decrypted — no stored "woken" field. Read in calm contexts (codex/debrief); felt mid-run only
// as a skyline window lighting. Voice carried from stillpoint.ts ECHO_MEMORIES.
import type { SaveData } from './save';
import type { EnemyKind } from './types';
import { INTERCEPTS, isInterceptComplete, masterProgress } from './intercepts';

export interface Citizen {
  id: string;
  name: string;            // 'The Lamplighter'
  role: string;            // one line — what they were
  wakeBy: string;          // transmission id, or 'm50' | 'm75'
  figure?: EnemyKind;      // the Six figure they're tied to (dossier weave)
  memory: string;          // 2–3 sentences — what they remember
  deeper: string;          // fuller paragraph — revealed once figure dossier complete / 100%
  /** ≤12 words, first person — the small "I kept to my task and trusted the rest to someone else"
   *  that makes this citizen one of the diffuse Sixth. Distilled from `deeper`. */
  confession: string;
  /** ≤16 words — this citizen's fate if the player HOLDS the light (eternal, luminous, unfinished). */
  fateHold: string;
  /** ≤16 words — this citizen's fate if the player LETS GO (completion, rest). */
  fateRelease: string;
}

export const MILESTONE_WAKE: Record<string, number> = { m50: 0.5, m75: 0.75 };

export const CITIZENS: Citizen[] = [
  {
    id: 'lamplighter',
    name: 'The Lamplighter',
    role: 'kept the lattice-lights',
    wakeBy: 'int-first-light',
    memory: 'You remember the lattice-lights coming on one tower at a time, each one a small argument against the dark. The whole city held its breath until the last tower lit, and then someone always cheered — they always did. There was a sound the lamps made, a low warm hum, like the city breathing.',
    deeper: 'You were the one who climbed the towers at dusk with the lighting-rod, rung by rung, every evening of your working life. On the last night the rod felt different in your hands — heavier, or perhaps your hands were heavier. You lit every lamp you could reach. Some stayed lit longer than the others. You have always hoped someone saw them from wherever the ships went, and knew the city was still trying.',
    confession: 'I kept the lamps lit, and trusted the walls to someone else.',
    fateHold: 'He climbs the towers still, lighting lamps that never go out.',
    fateRelease: 'The last tower lights. He climbs down at last, and rests.',
  },
  {
    id: 'archivist',
    name: 'The Archivist',
    role: 'kept the records',
    wakeBy: 'int-long-evening',
    memory: 'You remember the smell of the record-halls — cool stone and dried ink and the faint cedar of the scroll-cases. Every name in the city was there, every deed and debt and promise, legible and safe. You remember believing that to write a thing down was to keep it.',
    deeper: 'The fall came so slowly you did not mark the day it started. A door left unguarded; you noted it. A record returned unsigned; you filed it. A key that no one claimed; you logged it and moved on. You kept every log faithfully. The logs recorded the fall line by line and you did not see it until the last line was written, and there was nothing left to file. The archive was perfect. It was a perfect record of a city dying in the margins.',
    confession: 'I filed the fall, line by line, and never looked up.',
    fateHold: 'She files on, in a hall where the last line is never written.',
    fateRelease: 'The final page is written. The archive can close.',
  },
  {
    id: 'gatewarden',
    name: 'The Gate-Warden',
    role: 'stood the wall',
    wakeBy: 'int-warden',
    figure: 'warden',
    memory: 'You remember the gates — the weight of them, the sound they made when the locks engaged at dusk, a deep iron certainty that nothing would pass tonight. Forty years on the wall. You knew every stone by its shadow. The city behind you was always warm and lit, and you never once needed to look at it because you knew it was there.',
    deeper: 'You loved the wall more than what it guarded, and you always knew it. The gates were beautiful and absolute and entirely yours to command — and on the last night someone came to them from the inside, and something in you decided the rule mattered more than the person. You turned the lock. You told yourself you were following protocol. You were. The protocol had been written by someone who never imagined the enemy would wear a citizen\'s face. You held the wall perfectly and the city fell from within, and the worst of it is that you cannot say you would choose differently — only that you wish someone had written a better rule.',
    confession: 'I followed the protocol. It never imagined a citizen\'s face.',
    fateHold: 'He stands the wall forever, the lock warm under his hand.',
    fateRelease: 'He sets the keys down. The gate is no one\'s to hold now.',
  },
  {
    id: 'chorister',
    name: 'The Chorister',
    role: 'sang the evening down',
    wakeBy: 'int-weaver',
    figure: 'weaver',
    memory: 'You remember the choir gathered at the long window above the river, the city spread below going amber with evening, and the sound you made together — not any single voice but the shape between them, the resonance that filled the old stone and made it sing back. The king came once and wept. You never forgot his face.',
    deeper: 'You sang what the Weaver wrote for you — always her words, her chosen intervals, her careful decisions about which histories to voice and which to leave in silence. You thought that was artistry; you learned it was architecture. She was encoding the city\'s memory in sound, and she was also encoding its silences — the parts she found too painful she simply never gave you to sing. On the night it fell you stood at the window and opened your mouth and nothing came. You had no words. She had not written an ending. You stood there until the light went and then you went down into the dark, humming something you had made yourself from all the pieces she had left out, and it was the truest thing you ever sang, and no one heard it.',
    confession: 'I sang what I was given, and never the silences.',
    fateHold: 'She holds the last note open, and will not let it fall.',
    fateRelease: 'She sings the ending the Weaver never wrote, and is heard.',
  },
  {
    id: 'ferryman',
    name: 'The Ferryman',
    role: 'waited at the dark water',
    wakeBy: 'int-beacon',
    figure: 'beacon',
    memory: 'You remember the river at night — perfectly still, perfectly black, carrying the lights of the city on its surface so that you seemed to pole between two skies. People crossed it every day and barely looked. You looked every time. It was different water each crossing, and the same river forever.',
    deeper: 'Your route ran to the Beacon\'s tower, and you watched it every night the way you watched the water — reflexively, as a fixed thing you could steer by. When it stayed dark on the last night you thought at first the lamp had failed, the simple way lamps do. You waited at the dock with your pole and your lantern for a long time before you understood. The ships beyond the inlet were waiting for a signal you knew was never coming. You could have rowed out and told them. You waited instead, because crossing beyond the dark water was not your route, and you were a ferryman, and you kept to your routes. You have had a great deal of time to think about that.',
    confession: 'I kept to my route. The ships waited for a signal I never carried.',
    fateHold: 'He waits at the dock still, lantern lit, for a crossing that never comes.',
    fateRelease: 'He poles out past the dark water at last, and is not afraid.',
  },
  {
    id: 'glassblower',
    name: 'The Glassblower',
    role: 'made the mirrors',
    wakeBy: 'int-mirror',
    figure: 'mirrorblade',
    memory: 'You remember the furnace-room above the river district, the heat so constant you stopped noticing it, and the moment when the glass took the breath and became a shape — something from nothing, hollowness made solid. You made a hundred mirrors a season. You knew which ones were true and which ones flattered and you never told anyone which was which.',
    deeper: 'The Mirrorblade is not something the city made. It is something the city had always carried — the doubt that lived in every face that looked into your finest glass and saw itself and flinched. You ground and polished and silvered and sold mirrors for thirty years, and you understood what a mirror does: it shows you what you already are and asks you to decide if that is enough. The city\'s mirrors always showed it something it could not live with. Not because the city was ugly. Because it had never learned to look without judgement. You made beautiful glass. You are sorry for none of it. You are sorry the city could not bear the truth of its own reflection long enough to ask what to change.',
    confession: 'I made the glass. The city could not bear its own reflection.',
    fateHold: 'She polishes mirrors still, each holding the unbearable light.',
    fateRelease: 'She sets the last mirror down, and lets the city look away.',
  },
  {
    id: 'stonemason',
    name: 'The Stonemason',
    role: 'built what outlived them',
    wakeBy: 'int-hollow',
    figure: 'hollow',
    memory: 'You remember the sound of the hammer on good stone — a clean ring that meant the chisel had found the grain, that the rock was cooperating, that the thing you were making would stand. You built the eastern bridge, the archive vaults, the lower Bloomgarden wall. You built them to last past any single reign, and they did.',
    deeper: 'The one who could not leave was not you but they were built of what you made. Stone holds its shape after grief the way a building holds its shape after fire — the structure intact, the meaning burned out. You saw them near the end, standing in the hall of the bridge you had raised together, touching the keystone the way a person touches something they expect to outlive themselves. Grief had made them hollow in the particular way it does when all the love has nowhere left to go. You wanted to say: the stone still sings when the light hits it at the right angle. You did not say it. You laid your tools down and you grieved alongside, which was all any honest mason could offer, and it was not enough, and you have always known it.',
    confession: 'I laid my tools down and grieved. It was not enough.',
    fateHold: 'He keeps the keystone touched and warm, outlasting even grief.',
    fateRelease: 'The stone sings as the light leaves it, the way he always knew.',
  },
  {
    id: 'courier',
    name: 'The Courier',
    role: 'carried the last order',
    wakeBy: 'int-crown',
    figure: 'sovereign',
    memory: 'You remember the weight of the satchel and the feel of the city passing under your feet — the market stones warm from the day, the bridge cobbles slick with river mist, the archive quarter cool and shadowed even at noon. You knew every route by feel. You ran them in your sleep.',
    deeper: 'The last order came sealed in gold wax with the full crown impression, which had not been used in a generation, and your hand shook breaking it because you knew the weight of what that seal meant. Inside was a cipher — not a message but a cipher, the kingdom\'s last master key, wrapped in instructions to deliver it to the Beacon\'s tower and no other place. You ran. You ran the route perfectly. The tower was dark when you arrived and the door was locked from the inside and no one answered. You held the sealed cipher in the street until dawn, and then until the next night, and then the fall came past you like a wind, and you were still holding it, and it was the last undeciphered thing in the city, and the Sovereign had known it would be, and had sent you anyway, and you have never decided whether that was cruelty or faith.',
    confession: 'I ran the route perfectly. The door was locked from the inside.',
    fateHold: 'He holds the sealed cipher still, at a tower that never opens.',
    fateRelease: 'The sealed cipher is delivered at last. The last word is read.',
  },
  {
    id: 'bellringer',
    name: 'The Bell-Ringer',
    role: 'rang the hours',
    wakeBy: 'int-the-fall',
    memory: 'You remember how the bells ordered the city — the whole place shaping its days around the sound, the market timing its trades, the gates changing their watch, the children measuring their play. The bells were not just sound; they were the pulse the city thought by. You rang them for twenty-two years and never missed an hour.',
    deeper: 'When it came, you were in the belfry for the evening ring, and you pulled the rope and nothing happened — not silence, something worse: the bell moved but the sound went sideways somehow, wrong, absorbed by what was already in the air. You tried again. The city below had gone to grey and noise and you could not see through the smoke to read it. You rang anyway. You rang every bell in sequence, the whole evening peal, as clearly and truly as you ever had, because you were the Bell-Ringer and the city needed its hours called even as it fell. Afterward you sat in the belfry until the smoke cleared and the silence settled, and then you climbed down, and there was no city left to call the hour to, and you had never once thought about what the bells were for when there was no one left to hear them.',
    confession: 'I rang the hours to a city that could no longer hear.',
    fateHold: 'He rings the evening peal forever, to a city awake to hear it.',
    fateRelease: 'The last peal lands true, and the city has its hour.',
  },
  {
    id: 'clockwright',
    name: 'The Clockwright',
    role: 'made the mechanism',
    wakeBy: 'int-last-key',
    memory: 'You remember the smell of clock-oil and the feeling of a mechanism aligned — every gear meshing, every escapement catching cleanly, the whole machine moving in the exact time the city needed. You built the great clock above the archive quarter. You built seventeen others. They all kept perfect time.',
    deeper: 'You spent your life understanding how a key turns a mechanism — the exact angle of teeth, the precision of the catch, the irreversible click when the lock engages. You understood it better than anyone. So when you heard the last key described — not a physical key but a pattern, a spear that reads the cipher and breaks it — you understood before anyone else what it would have to be. Not a soldier. Not a weapon. A mechanism, yes, but one sharpened to a single edge: the city\'s last memory of itself, compressed to a sequence of decisions so precise they could not be anything but the city choosing to be remembered. You left the designs for the great clock in the archive with a note that read: every mechanism has a last key. Find the one that fits the fall. You did not survive to know if anyone did.',
    confession: 'I built perfect time, and let the one moment pass.',
    fateHold: 'The mechanism runs on, holding the hour at its brightest.',
    fateRelease: 'The great clock strikes the longest day, and may finally stop.',
  },
  {
    id: 'cartographer',
    name: 'The Cartographer',
    role: 'mapped what is gone',
    wakeBy: 'int-echo',
    memory: 'You remember the city from above — the way you had to hold it in your head all at once to draw it true, every alley and courtyard and bridgehead in right relation to every other. You walked every street before you mapped it, because you believed a map was a kind of memory, and a memory had to be earned by the feet before the hand could set it down.',
    deeper: 'After, you mapped what was left. It was the only thing you knew to do with grief — give it coordinates, give it a scale, give it borders so you could see where it ended. But grief has no edges, and a city\'s absence is worse to map than its presence: the grid stays but the names dissolve, the routes persist but lead nowhere, every street you trace runs into a blank where the building used to be and your pen finds no purchase. You made the maps anyway. You mapped the echo-routes the citizens walk in memory, the daily-seed paths of the last living moments. You mapped the cipher as it was decrypted, one word at a time, the territory of a dead kingdom coming back in fragments. It is not enough to be a cartography. It is the only honest kind.',
    confession: 'I mapped the city\'s absence. The names dissolved as I drew.',
    fateHold: 'She maps the held city forever, the names refusing to fade.',
    fateRelease: 'The map is whole now — every street leads somewhere again.',
  },
  {
    id: 'stargazer',
    name: 'The Stargazer',
    role: 'watched for the dawn',
    wakeBy: 'int-what-remains',
    memory: 'You remember the observatory roof on cold nights, the whole city below you lights and breath-smoke, the sky above a darkness that felt different from the darkness of the fall — purposeful, patient, full of information if you could only read it. The city looked small from up there in the best way: comprehensible. Held.',
    deeper: 'What remains is the question you built your life around. You watched the sky for signals — patterns in the stars that might say something about what persists past any single collapse. You found that what persists is light: not the star but the light that left it, still travelling after the source is cold. A message sent before the end, arriving afterward. You understood Lancefall was like that. Every cipher in the intercepts is light from a dead star — sent before the fall, arriving now, and the question is only whether the receiver is still listening. You are still listening. You have always been still listening. You think that might be the only thing that can honestly be called a choice.',
    confession: 'I watched the sky, and called the watching a choice.',
    fateHold: 'She watches still, the dawn held forever at the sky\'s edge.',
    fateRelease: 'The light she waited for arrives; she stops listening, content.',
  },
  {
    id: 'gardener',
    name: 'The Gardener',
    role: 'tended the Bloomgardens',
    wakeBy: 'int-gardens',
    memory: 'You remember the Bloomgardens in their season — the spiraling beds, the way the patterns seemed to decide themselves, the whole garden somehow more ordered and more alive than any single hand could have made it. People came from the outer districts just to walk the paths and feel that something in the city was well. You tended it every morning before they arrived.',
    deeper: 'The patterns in the gardens were not decoration. They were mathematics — the same quiet rule iterated ten thousand times, producing spots and spirals from nothing but a seed and a sequence. You had learned this from the old manuals, the Turing morphogenesis texts in the back of the archive, and you had built the beds to demonstrate it because you believed the city needed to see that small rules make complex beauty. The city loved the gardens without knowing why, which was the kind of love that lasts. When the ash came the gardens did not burn cleanly; the root-systems held. Weeks after the fall there were still spirals pushing through the ash, still running the old rule, still iterating. You find that the most beautiful and the most heartbreaking thing in the entire history of Lancefall, and you cannot decide which feeling is larger.',
    confession: 'I grew beauty from a rule, and trusted it to keep itself.',
    fateHold: 'The gardens bloom on, the old rule iterating without end.',
    fateRelease: 'The spirals finish their pattern, seed the ash, and rest.',
  },
  {
    id: 'vintner',
    name: 'The Vintner',
    role: 'kept a wine for the longest day',
    wakeBy: 'int-last',
    memory: 'You remember the cellar — the long cool dark of it, the ranks of bottles each one a year\'s worth of patience, the smell of oak and stone and the particular sweetness of something that had been waiting a long time for the right moment to open. You kept a bottle for the longest day, the day the last cipher broke, the day the city remembered itself fully. You were waiting for that day.',
    deeper: 'The wine is still in the cellar. The cellar is still there — stone holds, as the stonemason always said. You never opened the bottle because the longest day had not come while you were alive to see it, and you made yourself a rule: this wine for that day and no other. You have been thinking about what it means that someone else will open it. That the longest day — the day the master cipher breaks, the day every name is read and every word decrypted and the city is written back from nothing — will come to someone who never walked those streets or smelled that cellar. That is all right. A wine kept faithfully enough carries the keeper with it. Let them drink it and know that someone believed this day would come long enough to lay something aside for it. That is what patience means. That is what you were for.',
    confession: 'I kept a wine for a day I would not live to see.',
    fateHold: 'The bottle waits, uncorked forever, for a day that never ends.',
    fateRelease: 'The wine is opened at last. Someone believed the day would come.',
  },
  {
    id: 'candlemaker',
    name: 'The Candle-Maker',
    role: 'against the dark',
    wakeBy: 'm50',
    memory: 'You remember the smell of beeswax melting — warm and faintly sweet, a comfortable smell, a smell that meant something was being made against the dark. Every candle you poured was a small argument: that light is worth the effort, that it matters to push back, even a little, even briefly. You sold them from a stall in the market quarter for thirty-seven years.',
    deeper: 'Half the city is remembered now. That is what half means: half the dark is lit, half the names are read, half the ciphers broken. You used to think about the city in halves — the days when the market was full and the days when it was thin, the good harvests and the lean ones, the seasons of hope and the seasons of waiting. You came to believe that the candle\'s meaning was not in its brightness but in its persistence: that it kept burning through the thin half of the year, that it did not wait for perfect conditions. The city is half-remembered. You are not done. Keep going.',
    confession: 'I poured light against the dark, and left the dark the rest.',
    fateHold: 'He pours candles still, each burning against a night held at bay.',
    fateRelease: 'The last candle gutters out, its long argument finally won.',
  },
  {
    id: 'weaver-cloth',
    name: 'The Weaver',
    role: 'wove the city its colours',
    wakeBy: 'm75',
    memory: 'You remember the loom — the particular sound of the shuttle passing through the warp, the rhythm of it, the way a pattern emerged from simple crossings that would have been impossible to see in any single thread. The city wore what you made. The banners at the gates, the robes at the festivals, the cloth that wrapped the dead and the cloth that dressed the newborn. Everything you made was someone\'s ordinary.',
    deeper: 'Three quarters of the city is remembered now. The colours are coming back — not the grey of ciphered words but the actual hues: the market banners deep blue and gold, the Bloomgarden beds in their spiral season, the lattice-lights amber at dusk. A weave comes back the same way a cipher breaks: thread by thread, the pattern illegible until suddenly it is not, until the thing you have been making holds itself up and it is a city, it is a recognizable city, it was there the whole time in the crossing of the threads. You are almost there. The last quarter is the hardest because you can see the shape of what you are finishing and your hands start to hurry. Do not hurry. The last threads are the ones that hold the whole.',
    confession: 'I wove the city\'s colours, and left the last threads to others.',
    fateHold: 'She works the loom forever, the pattern bright and never finished.',
    fateRelease: 'The final thread is set. The weave holds — it is a city.',
  },
];

/** A citizen is woken once the transmission (or master-% milestone) that names them is decrypted,
 *  OR once an in-run deed has woken them through play (cityVoice deed-wake; see save.citizenDeeds). */
export function isCitizenWoken(save: SaveData, c: Citizen): boolean {
  if (save.citizenDeeds.includes(c.id)) return true; // woken through play (cityVoice deed-wake)
  if (c.wakeBy in MILESTONE_WAKE) return masterProgress(save).frac >= MILESTONE_WAKE[c.wakeBy];
  const ic = INTERCEPTS.find((i) => i.id === c.wakeBy);
  return !!ic && isInterceptComplete(save, ic);
}

export function wokenCitizens(save: SaveData): Citizen[] {
  return CITIZENS.filter((c) => isCitizenWoken(save, c));
}

export function cityRememberedCount(save: SaveData): { woken: number; total: number } {
  return { woken: wokenCitizens(save).length, total: CITIZENS.length };
}
