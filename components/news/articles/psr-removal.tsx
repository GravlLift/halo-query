import { Table, Text } from '@chakra-ui/react';
export default function PsrRemoval() {
  return (
    <>
      <Text>
        As of today, I&apos;m removing the stat &quot;PSR&quot; from the site.
        In short, it&apos;s not showing us anything that couldn&apos;t be better
        represented by reviewing its component parts individually. Everything I
        show on this site is supposed to be computed directly from Halo&apos;s
        API data and PSR was the one glaring exception.
      </Text>
      <Text>
        PSR was calculated by combining PSR-K and PSR-D to try to give you an
        &quot;overall match performance&quot; metric. PSR-K and PSR-D are
        computed directly from the API data, no assumptions on my part, and I
        have every confidence in their usefulness as statistics.
      </Text>
      <Text>
        In order to calculate PSR, however, I need to make an assumption about
        the relative importance of kills and deaths. While initially I figured
        that a simple 50/50 split would be sufficient, it has become abundantly
        clear that is not the case - the actual mixture is not even. Given that
        there is no data on what the correct ratio should be (and that it may
        fluctuate from one game type to the next), I think the responsible thing
        to do is to stop guessing.
      </Text>
      <Text>
        You might ask &quot;Does ESR have this same problem?&quot;. The answer
        is actually yes, but if you look at some ESR-K and ESR-D values,
        you&apos;ll see why it doesn&apos;t matter. Here&apos;s a few of mine
        for instance:
      </Text>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>ESR-K</Table.ColumnHeader>
            <Table.ColumnHeader>ESR-D</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell>1260.86</Table.Cell>
            <Table.Cell>1260.87</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>1334.25</Table.Cell>
            <Table.Cell>1334.31</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell>1247.28</Table.Cell>
            <Table.Cell>1247.29</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
      <Text>
        The difference between the two is so small that it doesn&apos;t matter
        how you weight them, the result is going to be effectively the same.
      </Text>
      <Text>
        That just leaves the question of what metric to use in PSR&apos;s place.
        I mentioned that I cannot accurately deduce the mixture of PSR-K and
        PSR-D. That&apos;s true, but I can definitely give you an semi-accurate
        anecdotal-based guess: Kills are way more important. I&apos;ve had
        plenty of users in the discord ask me why their ESR isn&apos;t rising,
        and never once has it been that they were dying too much. If you want to
        gauge your performance over time, follow your PSR-K value.
      </Text>
    </>
  );
}
