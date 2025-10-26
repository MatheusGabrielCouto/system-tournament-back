


export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateRoundRobin(players: any[]) {
  const rounds: any[][] = [];

  const hasBye = players.length % 2 !== 0;
  if (hasBye) players.push('BYE');

  const n = players.length;
  const totalRounds = n - 1;
  const half = n / 2;

  const list = [...players];

  for (let round = 0; round < totalRounds; round++) {
    const matches: any[] = [];

    for (let i = 0; i < half; i++) {
      const playerA = list[i];
      const playerB = list[n - 1 - i];

      if (playerA === 'BYE') matches.push({ bye: true, player: playerB });
      else if (playerB === 'BYE') matches.push({ bye: true, player: playerA });
      else matches.push({ playerA, playerB });
    }

    rounds.push(matches);

    const fixed = list.shift();
    const moved = list.pop();
    if (moved) list.splice(1, 0, moved);
    if (fixed) list.unshift(fixed);
  }

  return rounds;
}

export function generatePartialPairings(players: any[], roundsPerPlayer = 3) {
  const matches: any[][] = [];
  const seenPairs = new Set<string>();

  for (let round = 0; round < roundsPerPlayer; round++) {
    const roundMatches: any[] = [];
    const shuffled = shuffleArray([...players]);

    while (shuffled.length >= 2) {
      const a = shuffled.pop()!;
      const b = shuffled.pop()!;
      const key = [a, b].sort().join('-');

      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        roundMatches.push({ playerA: a, playerB: b });
      }
    }
    matches.push(roundMatches);
  }
  return matches;
}

export function generateSwissPairingsNoRepeat(
  standings: { id: string; points: number }[],
  pastMatches: { aId: string; bId: string }[],
  totalRounds: number
) {
  const rounds: any[][] = [];

  // Cria um set de pares anteriores para checagem rápida
  const played = new Set<string>();
  for (const m of pastMatches) {
    const key = [m.aId, m.bId].sort().join('-');
    played.add(key);
  }

  for (let round = 0; round < totalRounds; round++) {
    const sorted = [...standings].sort((a, b) => b.points - a.points);
    const matches: any[] = [];
    const paired = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      const playerA = sorted[i];
      if (paired.has(playerA.id)) continue;

      const opponent = sorted
        .slice(i + 1)
        .find(
          p => !paired.has(p.id) && !played.has([playerA.id, p.id].sort().join('-'))
        );

      if (opponent) {
        matches.push({ playerA: playerA.id, playerB: opponent.id });
        paired.add(playerA.id);
        paired.add(opponent.id);
        played.add([playerA.id, opponent.id].sort().join('-'));
      } else {
        matches.push({ bye: true, player: playerA.id });
        paired.add(playerA.id);
      }
    }

    rounds.push(matches);
  }

  return rounds;
}

// Swiss pairing generator: pairs players with similar points, assigns BYE if odd number.
export function generateSwissPairings(
  standings: { id: string; points: number; userId: string }[],
  totalRounds: number
) {
  const rounds: any[][] = [];

  for (let round = 0; round < totalRounds; round++) {
    // 1️⃣ Sort by points descending to match similar-ranked players
    const sorted = [...standings].sort((a, b) => b.points - a.points);

    const matches: any[] = [];
    const paired = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      const playerA = sorted[i];
      if (paired.has(playerA.userId)) continue;

      // Find the next available player with closest score
      const opponent = sorted.slice(i + 1).find(p => !paired.has(p.userId));

      if (opponent) {
        matches.push({ playerA: playerA.userId, playerB: opponent.userId });
        paired.add(playerA.userId);
        paired.add(opponent.userId);
      } else {
        // Odd number of players → assign BYE
        matches.push({ bye: true, player: playerA.userId });
        paired.add(playerA.userId);
      }
    }

    rounds.push(matches);
  }

  return rounds;
}