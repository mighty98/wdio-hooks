import type { Capabilities, Services, Options } from '@wdio/types';
import { setValue, getValue } from '@wdio/shared-store-service';
import { Suite } from '@wdio/types/build/Frameworks';

type mode = 'dev' | 'preprod' | 'prod';

const url: any = {
  dev: 'https://www.google.com/',
};

const credentials = {
  dev: [
    { email: 'abc@xyz.com' },
  ],
  preprod: [
     { email: 'abc@xyz.com' },
  ],
  prod: [
     { email: 'abc@xyz.com' },
  ],
};

export default class Launcher implements Services.ServiceInstance {
  _mode: mode;
  _waitForSpinner: number;
  _waitforTimeout: number;
  _maxRetry: number;

  constructor(
    private _options: Services.ServiceOption,
    private _capabilities: Capabilities.Capabilities,
    private _config: Omit<Options.Testrunner, 'capabilities'>
  ) {
    this._mode = this._options?.mode ? this._options.mode : 'dev';
    this._waitForSpinner = this._mode === 'dev' ? 20000 : 30000;
    this._waitforTimeout = this._mode === 'dev' ? 20000 : 30000;
    this._maxRetry = this._options?.retry ? this._options.retry : 1;
  }

  loginToDev = async () => {
    const currentProcess = process.pid.toString();
    const credentials = (await getValue(currentProcess)) as any;
    const search = await $('//*[@name="q"]');
    await search.waitForDisplayed()
  };

  loginToPreprod = async () => {
    const currentProcess = process.pid.toString();
    const credentials = (await getValue(currentProcess)) as any;
    const search = await $('//*[@name="q"]');
    await search.waitForDisplayed()
  };

  loginToProd = async () => {
    const currentProcess = process.pid.toString();
    const credentials = (await getValue(currentProcess)) as any;
    const search = await $('//*[@name="q"]');
    await search.waitForDisplayed()
  };

  handleLoginFailure = async () => {
    console.error('Unable to launch application');
    let availableCredentials = (await getValue('credentials')) as any[];
    const currentProcess = process.pid.toString();
    const credentials = (await getValue(currentProcess)) as any;
    availableCredentials.push(credentials);
    await setValue('credentials', availableCredentials);
    await browser.closeWindow();
    process.exit(1);
  };

  launch = async (func: Function) => {
    await browser.maximizeWindow();
    await browser.url(url[this._mode]);
    try {
      await func.apply(this);
    } catch (err) {
      this._maxRetry--;
      if (this._maxRetry != 0) {
        await browser.reloadSession();
        await this.launch(func);
      } else await this.handleLoginFailure();
    }
  };

  onPrepare = async () => {
    this._config.maxInstances = Math.min(credentials[this._mode].length, this._config.maxInstances!);
    await setValue('credentials', credentials[this._mode]);
    await setValue('process', []);
  };

  before = async () => {
    let processes = (await getValue('process')) as any[];
    processes = [process.pid, ...processes];
    await setValue('process', processes);
    let availableCredentials = (await getValue('credentials')) as any[];
    const credentials = availableCredentials[0];
    const currentProcess = process.pid.toString();
    availableCredentials.shift();
    await setValue('credentials', availableCredentials);
    await setValue(currentProcess, credentials);
    switch (this._mode) {
      case 'dev':
        await this.launch(this.loginToDev);
        break;
      case 'preprod':
        await this.launch(this.loginToPreprod);
        break;
      case 'prod':
        await this.launch(this.loginToProd);
        break;
    }
  };

  beforeSuite = (suite: Suite) => {
    console.log(suite);
  };

  afterSuite = async () => {
    let availableCredentials = (await getValue('credentials')) as any[];
    const currentProcess = process.pid.toString();
    const credentials = (await getValue(currentProcess)) as any;
    availableCredentials.push(credentials);
    await setValue('credentials', availableCredentials);
  };
}
