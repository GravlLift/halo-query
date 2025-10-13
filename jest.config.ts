/* eslint-disable */
import type { Config } from 'jest';

const config: Config = {
  displayName: 'halo-query',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'babel-jest',
      {
        presets: ['next/babel'],
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/packages/halo-query',
  moduleNameMapper: {
    '^@gravllift/halo-helpers$':
      '<rootDir>/../../libs/halo-helpers/src/index.ts',
    '^@gravllift/utilities$': '<rootDir>/../../libs/utilities/src/index.ts',
    '^.+\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: [],
};

export default config;
