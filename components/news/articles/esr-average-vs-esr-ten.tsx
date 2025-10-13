import { Text } from '@chakra-ui/react';
export default function EsrAverageVsEsr10() {
  return (
    <>
      <Text>
        I&apos;m testing out showing ESR as an average of your most recent ESRs
        by game type (rather than whatever your last 10 were), since I think
        it&apos;ll help in cases where you get served a large group of, say,
        strongholds matches that artificially deflate your ESR.
      </Text>
      <Text>
        For now, ESR-10 will remain in the header of the profile page and as the
        primary display in the &quot;Skill History&quot; chart, but I&apos;ve
        replaced it with the new metric in the &quot;Expected Skill Rank by
        Mode&quot; chart.
      </Text>
      <Text>
        I&apos;ll probably leave it like this for a few weeks and then axe one
        or other. If anyone has any strong feelings on either one of those
        metrics, let me know in the Discord.
      </Text>
      <Text>
        UPDATE: I know I said weeks, but yeah, I like this way better. I&apos;ve
        replaced ESR-10 with ESR-A everywhere on the profile page. Additionally,
        I&apos;ve adjusted the colors on the player profile charts to be a bit
        more readable.
      </Text>
    </>
  );
}
