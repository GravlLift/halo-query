import { useColors } from '../../lib/hooks/colors';
import { teamNames } from '../../lib/team-names';

export function useTeamPresets() {
  const colors = useColors();
  return colors.map((color, i) => ({
    name: teamNames[i],
    color,
  }));
}
