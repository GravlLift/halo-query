import { useCurrentUserGamertag } from '../lib/hooks/current-user';

export default function Testing(props: { children: React.ReactNode }) {
  const currentUser = useCurrentUserGamertag();
  return currentUser === 'GravlLift' ? props.children : null;
}
