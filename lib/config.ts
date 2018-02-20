/**
 * get and set global Arc.js settings
 */
export class Config {
  public static instance: Config;
  public static data: any;

  public static get(setting: string): any {
    return Config.data[setting];
  }

  public static set(setting: string, value: any): void {
    Config.data[setting] = value;
  }

  constructor() {
    if (!Config.instance) {
      const defaults = require("../config/default.json");

      if (process && process.env) {
        Object.keys(process.env).forEach((key) => {
          if (defaults[key]) {
            defaults[key] = process.env[key];
          }
        });
      }

      Config.data = defaults;
      Config.instance = this;
    }
    return Config.instance;
  }
}

/**
 * This will automagically create a static instance of Config that will be used whenever
 * someone imports Config.
 */
Object.freeze(new Config());
