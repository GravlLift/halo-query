import { MatchOutcome } from 'halo-infinite-api';

export default function OutcomeDisplay(props: {
  outcome: MatchOutcome;
}): string {
  switch (props.outcome) {
    case MatchOutcome.Tie:
      return 'Tie';
    case MatchOutcome.Win:
      return 'Win';
    case MatchOutcome.Loss:
      return 'Loss';
    case MatchOutcome.DidNotFinish:
      return 'Did Not Finish';
    default:
      return `Unknown (${props.outcome})`;
  }
}
