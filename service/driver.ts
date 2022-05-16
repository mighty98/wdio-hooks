/**
 * @author R,Mithun
 * @module Driver
 * This custom service is used for below functions:
 * - Download selenium standalone driver (pass the version from conf.ts file)
 * - Download all required browser drivers
 * - Start selenium server for above drivers
 * Selenium driver - Pass 'latest' to get the latest driver or pass specific versions
 * Browser driver - Pass 'latest' to get the latest driver or pass specific versions
 * Supports chrome, firefox, edge, chromiumedge
 */
import type { Capabilities, Options, Services } from '@wdio/types';
import { SevereServiceError } from 'webdriverio';
import { existsSync, mkdirSync, createWriteStream, rmSync } from 'fs';
import { resolve } from 'path';
import { promisify } from 'util';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { Socket } from 'net';
import * as stream from 'stream';
import got from 'got';

type driverType = 'chrome' | 'firefox' | 'edge' | 'chromiumedge' | 'selenium';

const defaultOptions: { [K in driverType]: any } = {
  selenium: { baseUrl: 'https://github.com/SeleniumHQ/selenium/releases/download', fallback: '4.1.1' },
  chrome: { baseUrl: 'https://chromedriver.storage.googleapis.com', fallback: '100.0.4896.60' },
  firefox: { baseUrl: 'https://github.com/mozilla/geckodriver/releases/download', fallback: '0.30.0' },
  edge: { baseUrl: 'https://msedgedriver.azureedge.net', fallback: '97.0.1072.76' },
  chromiumedge: { baseUrl: 'https://msedgedriver.azureedge.net' },
};

const DEFAULT_CONNECTION = {
  protocol: 'http',
  hostname: 'localhost',
  port: 4444,
  path: '/wd/hub',
};

const sleep = (ms = 1) => new Promise((r) => setTimeout(r, ms));

export default class Driver implements Services.ServiceInstance {
  _platform: string;
  _arch: string;
  _javaPath: any;
  _rejectUnauthorized: boolean;
  _seleniumVersion: string;
  _requiredDrivers: driverType[];
  _seleniumArgs: string[];
  _javaArgs: string[];
  _startArgs: string[];
  _driverPaths: any;
  _waitTime: number;

  constructor(
    private _options: Services.ServiceOption,
    private _capabilities: Capabilities.RemoteCapability,
    private _config: Omit<Options.Testrunner, 'capabilities'>
  ) {
    this._seleniumVersion = this._options?.selenium ? this._options.selenium : defaultOptions.selenium.fallback;
    this._requiredDrivers = this._options?.drivers ? (Object.keys(this._options.drivers) as driverType[]) : ['chrome'];
    this._seleniumArgs = this._options?.seleniumArgs ? this._options.seleniumArgs : [];
    this._javaArgs = this._options?.javaArgs ? this._options.javaArgs : [];
    this._startArgs = [];
    this._rejectUnauthorized = this._options.hasOwnProperty('rejectUnauthorized') ? this._options.rejectUnauthorized : true;
    this._platform = process.platform;
    this._arch = process.arch;
    this._waitTime = this._options?.timeout ? this._options?.timeout : 60000;
    this._driverPaths = Object.fromEntries(this._requiredDrivers.map((driver) => [driver, '']));
  }

  isPortReachable = async (port: number, params: { host: string; timeout: number }) => {
    return new Promise<boolean>((resolve, reject) => {
      const socket = new Socket();
      const onError = () => {
        socket.destroy();
        resolve(false);
      };

      socket.setTimeout(params.timeout);
      socket.once('error', onError);
      socket.once('timeout', onError);

      socket.connect(port, params.host, () => {
        socket.end();
        resolve(true);
      });
    });
  };

  checkDependencies = () => {
    try {
      const which = require('which');
      this._javaPath = which.sync('java');
    } catch (err) {
      throw new SevereServiceError('Driver setup failed at dependency check: ' + err);
    }
  };

  createDriversFolderIfNotPresent = () => {
    const driversFolder = resolve(__dirname, '.drivers');
    !existsSync(driversFolder) && mkdirSync(driversFolder, { recursive: true });
  };

  getLatestVersionDetails = async (driverName: driverType) => {
    let data;
    let url = '';
    switch (driverName) {
      case 'chrome':
        url = defaultOptions[driverName].baseUrl + '/LATEST_RELEASE';
        data = await got
          .get(url, { timeout: 10000, https: { rejectUnauthorized: this._rejectUnauthorized } })
          .catch((err) => console.log(`Issue fetching latest chrome version${err}`));
        data = data?.body.replace(/\r|\n/g, '').replace(/[^\d|.]/g, '');
        break;
      case 'firefox':
        url = 'https://api.github.com/repos/mozilla/geckodriver/releases/latest';
        data = await got(url, { timeout: 10000, responseType: 'json', https: { rejectUnauthorized: this._rejectUnauthorized } }).catch(
          (err) => console.log(`Issue fetching latest firefox version${err}`)
        );
        data = data?.body as any;
        data = data?.name;
        break;
      case 'edge':
        data = defaultOptions[driverName].fallback;
        break;
      case 'chromiumedge':
        url = 'https://msedgewebdriverstorage.blob.core.windows.net/edgewebdriver/LATEST_STABLE';
        data = await got
          .get(url, { timeout: 10000, https: { rejectUnauthorized: this._rejectUnauthorized } })
          .catch((err) => console.error('Issue fetching latest chromiumedge version'));
        data = data?.body.replace(/\r|\n/g, '').replace(/[^\d|.]/g, '');
        break;
    }
    return data ? data : defaultOptions[driverName].fallback;
  };

  getSeleniumDownloadUrl = (version: string) => {
    const v4 = version.startsWith('4');
    const hasSuffix = !/^\d+\.\d+\.\d+$/i.test(version);
    const [major, minor] = version.split('.');
    const baseUrl = defaultOptions.selenium.baseUrl;
    const jarPath = v4 ? (hasSuffix ? `selenium-${version}` : `selenium-${major}.${minor}.0`) : `selenium-${version}`;
    const jarName = v4 ? `selenium-server-${version}.jar` : `selenium-server-standalone-${version}.jar`;
    return `${baseUrl}/${jarPath}/${jarName}`;
  };

  getDriverArchData = (driver: driverType) => {
    let platform = '';
    switch (driver) {
      case 'chrome':
        if (this._platform == 'linux') {
          platform = 'linux64';
        } else if (this._platform === 'darwin') {
          platform = 'mac64' + (this._arch === 'arm64' ? '_m1' : '');
        } else {
          platform = 'win32';
        }
        break;
      case 'chromiumedge':
        break;
      case 'edge':
        break;
      case 'firefox':
        if (this._platform === 'linux') {
          platform = 'linux' + this._arch.slice(-2) + '.tar.gz';
        } else if (this._platform == 'win32') {
          platform = 'win' + this._arch.slice(-2) + '.zip';
        } else if (this._platform == 'darwin') {
          platform = 'macos' + (this._arch === 'arm64' ? '-aarch64' : '') + '.tar.gz';
        }
        break;
    }
    return platform;
  };

  getChromeDriverDownloadUrl = (version: string) => {
    const baseUrl = defaultOptions.chrome.baseUrl;
    const zipPathName = version;
    const archData = this.getDriverArchData('chrome');
    const zipFileName = `chromedriver_${archData}.zip`;
    return `${baseUrl}/${zipPathName}/${zipFileName}`;
  };

  getFirefoxDriverDownloadUrl = (version: string) => {
    const baseUrl = defaultOptions.firefox.baseUrl;
    const archData = this.getDriverArchData('firefox');
    return `${baseUrl}/v${version}/geckodriver-v${version}-${archData}`;
  };

  getEdgeDriverDownloadUrl = (version: string) => {};

  getChromiumEdgeDriverDownloadUrl = (version: string) => {};

  downloadFromUrlToDestination = async (url: string, destination: string, parentFolder: string) => {
    const downloadOptions = { https: { rejectUnauthorized: this._rejectUnauthorized } };
    const downloadStream = got.stream(url, downloadOptions);
    const fileWriterStream = createWriteStream(destination);
    const pipeline = promisify(stream.pipeline);
    await pipeline(downloadStream, fileWriterStream)
      .then(() => console.log(`File downloaded to ${destination}`))
      .catch((error) => {
        rmSync(parentFolder, { recursive: true, force: true });
        throw new SevereServiceError(`Something went wrong while trying to download from ${url}\n ${error.message}`);
      });
  };

  unzipFile = async (input: string, output: string) => {
    const decompress = require('decompress');
    await decompress(input, output)
      .then((files: any[]) => {
        rmSync(input);
        console.log(input + ' successfully decompressed');
      })
      .catch((err: string) => {
        throw new SevereServiceError(`Something went wrong while trying to unzip ${input}\n ${err}`);
      });
  };

  downloadSeleniumDriver = async (version: string) => {
    const seleniumVersion: string = version === 'latest' ? defaultOptions.selenium.fallback : version;
    const seleniumFolder = resolve(__dirname, '.drivers', 'selenium', seleniumVersion);
    this._seleniumVersion = seleniumVersion;
    if (!existsSync(seleniumFolder)) {
      mkdirSync(seleniumFolder, { recursive: true });
      const url = this.getSeleniumDownloadUrl(seleniumVersion);
      const fileName = 'driver.jar';
      const seleniumInstallationFolder = seleniumFolder + '/' + fileName;
      await this.downloadFromUrlToDestination(url, seleniumInstallationFolder, seleniumFolder);
    }
    this._driverPaths['selenium'] = resolve(seleniumFolder, 'driver.jar');
  };

  downloadChromeDriver = async (version: string) => {
    const chromeFolder = resolve(__dirname, '.drivers', 'chrome', version);
    if (!existsSync(chromeFolder)) {
      mkdirSync(chromeFolder, { recursive: true });
      const url = this.getChromeDriverDownloadUrl(version);
      const zipFileName = 'driver.zip';
      const chromeDownloadFolder = chromeFolder + '/' + zipFileName;
      await this.downloadFromUrlToDestination(url, chromeDownloadFolder, chromeFolder);
      await this.unzipFile(chromeDownloadFolder, chromeFolder);
    }
    this._driverPaths['chrome'] = resolve(chromeFolder, 'chromedriver.exe');
  };

  downloadFirefoxDriver = async (version: string) => {
    const firefoxFolder = resolve(__dirname, '.drivers', 'firefox', version);
    if (!existsSync(firefoxFolder)) {
      mkdirSync(firefoxFolder, { recursive: true });
      const url = this.getFirefoxDriverDownloadUrl(version);
      const zipFileName = 'driver-' + this.getDriverArchData('firefox');
      const firefoxDownloadFolder = firefoxFolder + '/' + zipFileName;
      await this.downloadFromUrlToDestination(url, firefoxDownloadFolder, firefoxFolder);
      await this.unzipFile(firefoxDownloadFolder, firefoxFolder);
    }
    this._driverPaths['firefox'] = resolve(firefoxFolder, 'geckodriver.exe');
  };

  downloadEdgeDriver = async (version: string) => {};

  downloadChromiumEdgeDriver = async (version: string) => {};

  downloadRequiredBrowserDrivers = async (requiredDrivers: driverType[]) => {
    for (const requiredDriver of requiredDrivers) {
      const requiredVersion =
        this._options.drivers[requiredDriver] === 'latest'
          ? await this.getLatestVersionDetails(requiredDriver)
          : this._options.drivers[requiredDriver];
      switch (requiredDriver) {
        case 'chrome':
          await this.downloadChromeDriver(requiredVersion);
          break;
        case 'firefox':
          await this.downloadFirefoxDriver(requiredVersion);
          break;
        case 'edge':
          await this.downloadEdgeDriver(requiredVersion);
          break;
        case 'chromiumedge':
          await this.downloadChromiumEdgeDriver(requiredVersion);
          break;
      }
    }
  };

  addDriverPathAsStartArgumens = (drivers: driverType[]) => {
    drivers.forEach((driver) => {
      switch (driver) {
        case 'chrome':
          this._startArgs.push('-Dwebdriver.chrome.driver=' + this._driverPaths['chrome']);
          break;
        case 'chromiumedge':
          this._startArgs.push('-Dwebdriver.edge.driver=' + this._driverPaths['chromiumedge']);
          break;
        case 'edge':
          this._startArgs.push('-Dwebdriver.edge.driver=' + this._driverPaths['edge']);
          break;
        case 'firefox':
          this._startArgs.push('-Dwebdriver.gecko.driver=' + this._driverPaths['firefox']);
          break;
      }
    });
  };

  getSeleniumStatusUrl = () => {
    const protocol = DEFAULT_CONNECTION.protocol;
    const host = DEFAULT_CONNECTION.hostname;
    const port = DEFAULT_CONNECTION.port;
    const statusPath = this._seleniumVersion.startsWith('4') ? '/status' : '/wd/hub/status';
    return new URL(`${protocol}://${host}:${port}${statusPath}`);
  };

  checkSeleniumStarted = async (selenium: ChildProcessWithoutNullStreams) => {
    const seleniumStatusUrl = this.getSeleniumStatusUrl();

    selenium.stdout?.on('data', (data) => console.log(data.toString()));
    selenium.stderr?.on('data', (data) => console.log(data.toString()));

    let attempts = this._waitTime / 2000 - 1;
    const startTime = Date.now();
    while (attempts > 0 && Date.now() - startTime < this._waitTime) {
      await sleep(this._waitTime / 60);
      attempts--;
      try {
        await got(seleniumStatusUrl, {
          responseType: 'json',
          timeout: 10000,
          retry: 0,
        });
        return null;
      } catch (err) {
        if (attempts % 5 === 0) {
          console.error('Failed to connect to selenium.', 'Attempts left:', attempts, '\n', err.message);
        }
      }
    }
    selenium.kill('SIGINT');
    throw new SevereServiceError('Unable to connect to selenium');
  };

  startServer = async () => {
    const seleniumStatusUrl = this.getSeleniumStatusUrl();
    this._seleniumArgs.unshift('standalone');
    this.addDriverPathAsStartArgumens(this._requiredDrivers);
    this._startArgs.push(...this._javaArgs, '-jar', this._driverPaths['selenium'], ...this._seleniumArgs);
    const used = await this.isPortReachable(Number(seleniumStatusUrl.port), { host: seleniumStatusUrl.hostname, timeout: 100 });
    if (used) throw new SevereServiceError(`Port ${seleniumStatusUrl.port} is already in use.`);
    const selenium = spawn(this._javaPath, this._startArgs);
    await this.checkSeleniumStarted(selenium);
  };

  onPrepare = async () => {
    this.checkDependencies();
    this.createDriversFolderIfNotPresent();
    await this.downloadSeleniumDriver(this._seleniumVersion);
    await this.downloadRequiredBrowserDrivers(this._requiredDrivers);
    await this.startServer();
  };
}
