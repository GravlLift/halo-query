'use client';
import { Box } from '@chakra-ui/react';
import '@gravllift/utilities';
import type {
  BuilderProps,
  Config,
  ImmutableTree,
  JsonGroup,
  JsonLogicTree,
  QueryProps,
} from '@react-awesome-query-builder/ui';
import {
  Builder,
  Utils as QbUtils,
  Query,
} from '@react-awesome-query-builder/ui';
import '@react-awesome-query-builder/ui/css/styles.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReplaySubject, debounceTime } from 'rxjs';
import { useConfig } from './hooks/use-config';
import './index.css';

const queryValue: JsonGroup = {
  id: 'ba780cba-a177-4adc-9c50-ec02c3532613',
  type: 'group',
};

export interface QueryBuilderProps {
  queryState: { tree: ImmutableTree; config: Config };
  onQueryChange: QueryProps['onChange'];
  renderBuilder: QueryProps['renderBuilder'];
  getFilter: () => Promise<{ immutableTree: ImmutableTree; config: Config }>;
}

export function useQueryBuilder(
  initialLogic: JsonLogicTree | undefined
): QueryBuilderProps {
  const queryConfig = useConfig();
  const [queryState, setState] = useState({
    tree: QbUtils.sanitizeTree(
      QbUtils.loadFromJsonLogic(initialLogic, queryConfig) ??
        QbUtils.loadTree(queryValue),
      queryConfig
    ).fixedTree,
    config: queryConfig,
  });
  useEffect(() => {
    setState((prevState) => ({
      ...prevState,
      config: queryConfig,
    }));
  }, [queryConfig]);

  const onQueryChange = useCallback(
    (immutableTree: ImmutableTree, config: Config) => {
      setState((prevState) => ({
        ...prevState,
        tree: immutableTree,
        config: config,
      }));
    },
    []
  );

  const onChangeSubject$ = useRef(
    new ReplaySubject<{
      immutableTree: ImmutableTree;
      config: Config;
    }>(1)
  );
  useEffect(() => {
    const subscription = onChangeSubject$.current
      .pipe(debounceTime(500))
      .subscribe(({ immutableTree, config }) =>
        onQueryChange(immutableTree, config)
      );

    return () => subscription.unsubscribe();
  }, [onChangeSubject$, onQueryChange]);

  const renderBuilder = useCallback(
    (props: BuilderProps) => (
      <Box className="query-builder-container">
        {/* Add qb-dark and qb-lite so we can override minimalism but maintain dark variable set */}
        <Box className="query-builder qb-dark qb-lite">
          <Builder {...props} />
        </Box>
      </Box>
    ),
    []
  );

  // Latest value without debounce; falls back to state if the builder never emitted a change
  const latestRef = useRef<{ immutableTree: ImmutableTree; config: Config }>();
  const queryStateRef = useRef(queryState);
  queryStateRef.current = queryState;

  return {
    queryState,
    onQueryChange: (immutableTree, config) => {
      latestRef.current = { immutableTree, config };
      onChangeSubject$.current.next({ immutableTree, config });
    },
    renderBuilder,
    getFilter: async () =>
      latestRef.current ?? {
        immutableTree: queryStateRef.current.tree,
        config: queryStateRef.current.config,
      },
  };
}

export function QueryBuilder(props: QueryBuilderProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const jsonLogicTree = useMemo(
    () =>
      QbUtils.jsonLogicFormat(props.queryState.tree, props.queryState.config),
    [props.queryState.tree, props.queryState.config]
  );
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <>
      {isHydrated ? (
        <Query
          {...props.queryState.config}
          value={props.queryState.tree}
          onChange={props.onQueryChange}
          renderBuilder={props.renderBuilder}
        />
      ) : null}
      {jsonLogicTree.errors?.length ? (
        <Box backgroundColor={'red.500'}>
          {jsonLogicTree.errors.map((e, i) => (
            <Box key={i}>{e}</Box>
          ))}
        </Box>
      ) : null}
    </>
  );
}
