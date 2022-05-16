import { resolve } from 'path';
import Driver from './service/driver';
import Launcher from './service/launcher';
import Reporter from './service/reporter';

const mode = process.env.mode ? process.env.mode : 'dev';
const downloadsPath = resolve(__dirname, './resources/downloads');
const drivers = {
  chrome: 'latest', // support for firefox available. Pending implementation for edge and chromiumedge
};
const capabilities = [
  {
    browserName: 'chrome',
    acceptInsecureCerts: true,
    'goog:chromeOptions': {
      prefs: {
        directory_upgrade: true,
        prompt_for_download: false,
        'download.default_directory': downloadsPath,
      },
    },
    'wdio:devtoolsOptions': {
      headless: false,
    },
  },
  {
    browserName: 'firefox',
    acceptInsecureCerts: true,
  },
];

export const config: WebdriverIO.Config = {
  runner: 'local',
  baseUrl: 'https://www.google.com/',
  capabilities: capabilities.filter((capability) => Object.keys(drivers).includes(capability.browserName)),
  maxInstances: 4,
  logLevel: 'error',
  waitforTimeout: 5000,
  suites: {
    google: ['./specs/features/google/*.spec.ts'],
  },
  services: [
    ['shared-store', {}],
    [Driver, { selenium: 'latest', rejectUnauthorized: false, drivers: drivers, timeout: 120000 }],
    [Launcher, { mode: mode, retry: 3 }],
    [Reporter, { mode: mode, timeout: 10000 }],
  ],
  reporters: ['spec'],
  framework: 'jasmine',
  jasmineOpts: {
    defaultTimeoutInterval: 900000, // keeping 15 mins as some tests would need it. Revisit if delaying fast failure
    expectationResultHandler: (passed, assertion) => {},
  },
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      files: true,
      project: 'tsconfig.json',
    },
  },
};
