/**
 * Deterministic gradient pair for a team avatar. Hashes the team id into
 * the cool/indigo neighborhood (HSL hues 200-280) so avatars always feel
 * tonally consistent with the brand without colliding with the indigo
 * accent on active states.
 *
 * @param teamId - Stable identifier for the team (UUID).
 * @returns From/to HSL color strings for a 135deg linear gradient.
 */
export function teamAvatarGradient(teamId: string): { from: string; to: string } {
  let h = 0;
  for (let i = 0; i < teamId.length; i++) {
    h = (h * 31 + teamId.charCodeAt(i)) | 0;
  }
  const biased = 200 + (Math.abs(h) % 80);
  return {
    from: `hsl(${biased} 65% 60%)`,
    to: `hsl(${(biased + 30) % 360} 60% 45%)`,
  };
}
