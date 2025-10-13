import { Link, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
export default function Cu29PatchRolledOut() {
  return (
    <>
      <Text>
        As of 4:54 PM EST today,{' '}
        <Link
          href="https://twitter.com/HaloSupport/status/1757161274721616010"
          target="_blank"
        >
          @HaloSupport tweeted out that a fix has been applied to ranked CSR
          rewards
          <ExternalLink />
        </Link>
        . Correspondingly, as of about 3:15PM EST, I see matches appearing with
        counterfactual values more in line with pre-update values. I&apos;ve
        restored the original PSR computations accordingly.
      </Text>
      <Text>
        I wouldn&apos;t expect Halo to retroactively update ranks or game data
        from the period when this issue was present, so any matches from the
        launch of CU29 to this point are just going to have some bizarre looking
        data forever. Best thing we can do is generate new data (aka, play the
        game) and put this fiasco behind us.
      </Text>
    </>
  );
}
