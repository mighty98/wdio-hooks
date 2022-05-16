import { getValue, setValue } from '@wdio/shared-store-service';
import type { Capabilities, Services, Options } from '@wdio/types';
import { Test, TestResult } from '@wdio/types/build/Frameworks';
import { ensureFile, readJson, remove, writeJson } from 'fs-extra';
import got from 'got';

export default class Reporter implements Services.ServiceInstance {
  _timeout: number;
  _mode: string;
  _body: any;

  constructor(
    private _options: Services.ServiceOption,
    private _capabilities: Capabilities.Capabilities,
    private _config: Omit<Options.Testrunner, 'capabilities'>
  ) {
    this._mode = this._options?.mode ?? 'dev';
    this._timeout = this._options?.timeout ?? 10000;
  }

  onPrepare = async () => {
    await setValue('result', { total: 0, pass: 0, fail: 0, duration: 0 });
  };

  afterTest = async (test: Test, context: any, result: TestResult) => {
    const current: any = await getValue('result');
    current.total += 1;
    result.passed ? (current.pass += 1) : (current.fail += 1);
    current.duration += result.duration;
    await setValue('result', current);
  };

  onComplete = async () => {
    const current: any = await getValue('result');
    console.log(`ON COMPLETE ${JSON.stringify(current)}`);
  };
}
