// Ćwiczenia z SPEC.md, sekcja 11 (L = K1, P = K2, > = akcent, . = pauza).

export interface Exercise {
  id: string;
  pattern: string;
  minBpm: number;
  maxBpm: number;
  /** 4 = 1/4 (jak streamy w osu!), 3 = triole */
  stepsPerBeat: number;
}

export const EXERCISES: Exercise[] = [
  { id: 'single', pattern: '>L P L P L P L P', minBpm: 150, maxBpm: 180, stepsPerBeat: 4 },
  { id: 'double', pattern: '>L L P P L L P P', minBpm: 110, maxBpm: 150, stepsPerBeat: 4 },
  { id: 'paradiddle', pattern: '>L P L L >P L P P', minBpm: 110, maxBpm: 150, stepsPerBeat: 4 },
  { id: 'burst5L', pattern: '>L P L P L . . .', minBpm: 160, maxBpm: 190, stepsPerBeat: 4 },
  { id: 'burst5P', pattern: '>P L P L P . . .', minBpm: 150, maxBpm: 180, stepsPerBeat: 4 },
  { id: 'gallop', pattern: '>L P L . >P L P .', minBpm: 160, maxBpm: 190, stepsPerBeat: 4 },
  { id: 'triplet', pattern: '>L P L >P L P', minBpm: 140, maxBpm: 170, stepsPerBeat: 3 },
  { id: 'shiftAccent', pattern: '>L P L >P L P >L P L >P L P', minBpm: 140, maxBpm: 170, stepsPerBeat: 4 },
  { id: 'onlyP', pattern: '>P . P . P . P .', minBpm: 150, maxBpm: 180, stepsPerBeat: 4 },
  { id: 'stream16', pattern: '>L P L P L P L P L P L P L P L P', minBpm: 160, maxBpm: 188, stepsPerBeat: 4 }
];
