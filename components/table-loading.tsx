import { Skeleton, Table } from '@chakra-ui/react';

export default function TableLoading({
  rows,
  columns,
}: {
  rows: number;
  columns: number;
}) {
  return Array(Math.min(rows, 25))
    .fill(0)
    .map((_, i) => (
      <Table.Row key={i}>
        <Table.Cell colSpan={columns}>
          <Skeleton width={'full'} height={'20px'} />
        </Table.Cell>
      </Table.Row>
    ));
}
