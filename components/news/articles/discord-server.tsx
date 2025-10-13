import { Link, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
export default function DiscordServer() {
  return (
    <>
      <Text>
        I&apos;ve created a Discord server for Halo Query. At the moment,
        it&apos;s just me in here, which is kinda depressing. So stop by to
        discuss the site, suggest features, and troubleshoot any bugs you may be
        encountering, I&apos;ll be happy to help.
      </Text>
      <Text>
        <Link href="https://discord.gg/XuZsWZ2h5p" target="_blank">
          Invite Link
          <ExternalLink />
        </Link>
      </Text>
    </>
  );
}
